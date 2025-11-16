import { isNetworkError, wrapErrorHandler } from './errors/base';

const addBlobToCspWorkerSrc = (csp) => {
  if (!csp) return csp;

  const workerSrcMatch = csp.match(/worker-src\s([^;]+)/);
  const childSrcMatch = csp.match(/child-src\s([^;]+)/);
  const scriptSrcMatch = csp.match(/script-src\s([^;]+)/);

  if (workerSrcMatch) {
    const sources = workerSrcMatch[1].trim();
    if (!sources.includes('blob:')) {
      const newSources = `${sources.replace("'none'", '')} blob:`;
      csp = csp.replace(/worker-src\s[^;]+/, `worker-src ${newSources}`);
    }
  } else if (childSrcMatch) {
    const sources = childSrcMatch[1].trim();
    if (!sources.includes('blob:')) {
      const newSources = `${sources.replace("'none'", '')} blob:`;
      csp = `worker-src ${newSources}; ${csp}`;
    }
  } else if (scriptSrcMatch) {
    const sources = scriptSrcMatch[1].trim();
    if (!sources.includes('blob:')) {
      const newSources = `${sources.replace("'none'", '')} blob:`;
      csp = `worker-src ${newSources}; ${csp}`;
    }
  }
  return csp;
};

let previouslyPatchedCsp = null;
export const updateDeclarativeNetRequestRules = wrapErrorHandler(async () => {
  if (!globalThis.navigator?.onLine) return;

  let response;
  try {
    response = await fetch('https://www.youtube.com');
    if (!response?.ok) {
      // non-200 status
      throw new Error(
        [response?.status, response?.statusText].filter((_) => _).join(': ') ??
          'Unknown response'
      );
    }
  } catch (error) {
    // DeclarativeNetRequest rules are saved between browsing sessions.
    // So quickly retrying should not often be necessary.

    if (!error) return; // cors error or offline
    if (isNetworkError(error)) return; // Failed to reach www.youtube.com

    console.log(`Failed to updateDeclarativeNetRequestRules: ${error}`);
    return;
  }

  const csp = response.headers.get('Content-Security-Policy');
  const patchedCsp = addBlobToCspWorkerSrc(csp);

  if (previouslyPatchedCsp === patchedCsp) return;

  if (csp === patchedCsp) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1], // Remove all existing dynamic rules (if any)
    });
    return;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1], // Remove all existing dynamic rules (if any)
    addRules: [
      {
        id: 1,
        priority: 2,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              header: 'content-security-policy',
              operation: 'set',
              value: patchedCsp,
            },
          ],
        },
        condition: {
          urlFilter: 'https://www.youtube.com/*',
          resourceTypes: ['main_frame', 'sub_frame'],
        },
      },
    ],
  });

  previouslyPatchedCsp = patchedCsp;
});
