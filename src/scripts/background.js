import { getBrowser, getFeedbackFormLink } from './libs/utils';

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason !== 'install' && details.reason !== 'update') return;

  if (chrome.runtime.setUninstallURL) {
    chrome.runtime.setUninstallURL(getFeedbackFormLink());
  }

  if (details.reason === 'install' && getBrowser() === 'Firefox') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(function () {
  chrome.runtime.openOptionsPage();
});

const patchCsp = (csp) => {
  const workerSrcMatch = csp.match(/worker-src\s([^;]+)/);
  const childSrcMatch = csp.match(/child-src\s([^;]+)/);
  const scriptSrcMatch = csp.match(/script-src\s([^;]+)/);
  if (workerSrcMatch) {
    const sources = workerSrcMatch[1].trim();
    if (!sources.includes('blob:')) {
      const newSources = sources + ' blob:';
      csp = csp.replace(/worker-src\s[^;]+/, `worker-src ${newSources}`);
    }
  } else if (childSrcMatch) {
    const sources = childSrcMatch[1].trim();
    if (!sources.includes('blob:')) {
      const newSources = sources + ' blob:';
      csp = csp.replace(/child-src\s[^;]+/, `child-src ${newSources}`);
    }
  } else if (scriptSrcMatch) {
    const sources = scriptSrcMatch[1].trim();
    if (!sources.includes('blob:')) {
      const newSources = sources + ' blob:';
      csp = csp.replace(/script-src\s[^;]+/, `script-src ${newSources}`);
    }
  }
  return csp;
};

// const askPatchCspPermission = () =>
//   new Promise((resolve, reject) => {
//     try {
//       chrome.permissions.request(
//         {
//           permissions: ['declarativeNetRequestWithHostAccess'],
//           origins: ['https://www.youtube.com'],
//         },
//         (granted) => {
//           if (!granted) {
//             console.log('Permission denied.');
//             reject(new Error('Permission denied.'));
//             return;
//           }

//           console.log('Permission granted!');
//           resolve();
//         }
//       );
//     } catch (ex) {
//       reject(ex);
//     }
//   });

let previouslyPatchedCsp = '';
const updateRules = async () => {
  // await askPatchCspPermission(); // Only required when on any domains
  const response = await fetch('https://www.youtube.com');

  const csp = response.headers.get('Content-Security-Policy');
  const patchedCsp = patchCsp(csp);

  if (previouslyPatchedCsp === patchCsp) return;

  if (csp === patchCsp) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1], // Remove all existing dynamic rules (if any)
    });
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

  previouslyPatchedCsp = patchCsp;
};

chrome.runtime.onStartup.addListener(updateRules);

// Update when extension is installed or reloaded
chrome.runtime.onInstalled.addListener(updateRules);

// Keep checking for possible changes every 10 minutes
setInterval(updateRules, 10 * 60_000);
