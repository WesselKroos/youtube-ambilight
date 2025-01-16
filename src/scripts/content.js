import { getVersion } from './libs/utils';
import { setErrorHandler, setWarning, wrapErrorHandler } from './libs/generic';
import { defaultCrashOptions, storage } from './libs/storage';
import SentryReporter, {
  setCrashOptions,
  setVersion,
} from './libs/sentry-reporter';
import { injectedScript } from './libs/messaging/injected';

setErrorHandler((ex) => SentryReporter.captureException(ex));

const waitForHtmlElement = async () => {
  if (document.documentElement) return;

  await new Promise((resolve, reject) => {
    try {
      const observer = new MutationObserver(() => {
        if (!document.documentElement) return;

        observer.disconnect();
        resolve();
      });
      observer.observe(document, { childList: true });
    } catch (ex) {
      reject(ex);
    }
  });
};

const waitForHeadElement = async () => {
  if (document.head) return;

  await new Promise((resolve, reject) => {
    try {
      const observer = new MutationObserver(() => {
        if (!document.head) return;

        observer.disconnect();
        resolve();
      });
      observer.observe(document.documentElement, { childList: true });
    } catch (ex) {
      reject(ex);
    }
  });
};

const captureResourceLoadingException = async (url, event) => {
  let error;
  try {
    await new Promise((resolve, reject) => {
      try {
        const req = new XMLHttpRequest();
        req.onreadystatechange = () => {
          try {
            if (req.readyState == XMLHttpRequest.DONE) {
              error = new Error(
                `Cannot load ${url} (Status: ${req.statusText} ${req.status})`
              );
              resolve();
            }
          } catch (ex) {
            reject(ex);
          }
        };
        req.open('GET', url, true);
        req.send();
      } catch (ex) {
        reject(ex);
      }
    });
  } catch (ex) {
    error = ex;
  } finally {
    error = error ?? new Error(`Cannot load ${url} (Status: unknown)`);
    error.details = event;
    SentryReporter.captureException(error);

    setWarning(
      `Failed to load a resource. Refresh the webpage to try it again. ${'\n'}This can happen after you have updated the extension. ${'\n\n'}Or if this happens often, view the error in your browser's DevTools javascript console panel. ${'\n'}Tip: Look for errors about this url: ${url}`
    );
  }
};

wrapErrorHandler(async function loadContentScript() {
  const version = getVersion();
  setVersion(version);

  let crashOptions = defaultCrashOptions;
  try {
    crashOptions = (await storage.get('crashOptions')) || defaultCrashOptions;
    setCrashOptions(crashOptions);
  } catch (ex) {
    SentryReporter.captureException(ex);
  }

  storage.addListener(function storageListener(changes) {
    if (!changes.crashOptions?.newValue) return;

    const crashOptions = changes.crashOptions.newValue;
    setCrashOptions(crashOptions);
    injectedScript.postMessage('crashOptions', crashOptions);
  });

  await waitForHtmlElement();
  await waitForHeadElement();

  // const addWebGLLint = () => {
  //   const s = document.createElement('script')
  //   s.src = 'https://greggman.github.io/webgl-lint/webgl-lint.js'
  //   s.setAttribute('data-gman-debug-helper', JSON.stringify({
  //     throwOnError: false
  //   }))
  //   s.onerror = function injectScriptOnError(ex) {
  //     console.error(ex)
  //   }.bind(this)
  //   document.body.appendChild(s)
  // }
  // addWebGLLint()

  let loaded = await new Promise((resolve) => {
    const url = chrome.runtime.getURL('styles/content.css');
    if (document.head.querySelector(`link[href="${url}"]`)) {
      resolve(true);
      return;
    }

    const style = document.createElement('link');
    style.href = url;
    style.rel = 'stylesheet';
    style.addEventListener(
      'error',
      async function injectStyleOnError(event) {
        await captureResourceLoadingException(style.href, event);
        resolve(false);
      }.bind(this)
    );
    style.addEventListener(
      'load',
      function injectStyleOnLoad() {
        resolve(true);
      }.bind(this)
    );
    document.head.appendChild(style);
  });
  if (!loaded) return;

  loaded = await new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('scripts/injected.js');
    script.async = true;
    script.setAttribute('data-crash-options', JSON.stringify(crashOptions));
    script.setAttribute('data-version', version);
    script.addEventListener(
      'error',
      async function injectScriptOnError(event) {
        await captureResourceLoadingException(script.src, event);
        resolve(false);
      }.bind(this)
    );
    script.addEventListener(
      'load',
      function injectStyleOnLoad() {
        resolve(true);
      }.bind(this)
    );
    document.head.appendChild(script);
  });
  if (!loaded) return;

  const scriptSrc = chrome.runtime.getURL('scripts/content-main.js');
  import(scriptSrc);
})();
