import { getVersion } from './libs/utils';
import { setWarning } from './libs/generic';
import { defaultCrashOptions, storage } from './libs/storage';
import SentryReporter, {
  setCrashOptions,
  setVersion,
} from './libs/errors/sentry-reporter';
import { injectedScript } from './libs/messaging/injected';
import {
  appendErrorStack,
  setErrorHandler,
  wrapErrorHandler,
} from './libs/errors/base';

setErrorHandler((ex) => SentryReporter.captureException(ex));

injectedScript.addMessageListener('error', (injectedEx) => {
  const ex = new Error(injectedEx.message);
  ex.name = injectedEx.name;
  ex.stack = injectedEx.stack;
  if (injectedEx.details) ex.details = injectedEx.details;

  SentryReporter.captureException(ex);
});

const setResourceWarning = (url) => {
  setWarning(
    url
      ? `Failed to load a resource. Reload the webpage to try it again. 
This can happen after you have updated the extension. 

Or if this happens often, view the error in your browser's DevTools javascript console panel. 
Tip: Look for errors about this url: ${url}`
      : `Failed to load the extension on this webpage because it has been updated, reloaded or uninstalled. 
Reload the webpage to reload the extension.`
  );
};

const waitForHtmlElement = async () => {
  if (document.documentElement) return;

  const stack = new Error().stack;
  await new Promise((resolve, reject) => {
    try {
      const observer = new MutationObserver(
        wrapErrorHandler(
          function onHtmlElementMutation() {
            if (!document.documentElement) return;

            observer.disconnect();
            resolve();
          }.bind(this),
          true
        )
      );
      observer.observe(document, { childList: true });
    } catch (ex) {
      appendErrorStack(stack, ex);
      reject(ex);
    }
  });
};

const waitForHeadElement = async () => {
  if (document.head) return;

  const stack = new Error().stack;
  await new Promise((resolve, reject) => {
    try {
      const observer = new MutationObserver(
        wrapErrorHandler(
          function onHeadElementMutation() {
            if (!document.head) return;

            observer.disconnect();
            resolve();
          }.bind(this),
          true
        )
      );
      observer.observe(document.documentElement, { childList: true });
    } catch (ex) {
      appendErrorStack(stack, ex);
      reject(ex);
    }
  });
};

const captureResourceLoadingException = async (url, event) => {
  if (!chrome?.runtime?.id) {
    setResourceWarning();
    return;
  }

  let error;
  try {
    const stack = new Error().stack;
    await new Promise((resolve, reject) => {
      try {
        const req = new XMLHttpRequest();
        req.onreadystatechange = () => {
          try {
            if (req.readyState == XMLHttpRequest.DONE) {
              if (req.status !== 200) {
                error = new Error(
                  `Cannot load ${url} (Status: ${req.statusText} ${req.status})`
                );
                appendErrorStack(stack, error);
              }
              resolve();
            }
          } catch (ex) {
            reject(ex);
          }
        };
        req.open('GET', url, true);
        req.send();
      } catch (ex) {
        appendErrorStack(stack, ex);
        reject(ex);
      }
    });
  } catch (ex) {
    error = ex;
  } finally {
    if (error) {
      error.details = event;
      SentryReporter.captureException(error);
    }

    setResourceWarning(url);
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

  if (!chrome?.runtime?.id) {
    setResourceWarning();
    return;
  }

  let loaded = await new Promise((resolve) => {
    let url;
    try {
      url = chrome.runtime.getURL('styles/content.css');
    } catch {
      setResourceWarning();
      resolve(false);
      return;
    }

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
  if (!chrome?.runtime?.id) {
    setResourceWarning();
    return;
  }
  if (!loaded) return;

  loaded = await new Promise((resolve) => {
    let url;
    try {
      url = chrome.runtime.getURL('scripts/injected.js');
    } catch {
      setResourceWarning();
      resolve(false);
      return;
    }

    const script = document.createElement('script');
    script.src = url;
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
  if (!chrome?.runtime?.id) {
    setResourceWarning();
    return;
  }
  if (!loaded) return;

  let scriptUrl;
  try {
    scriptUrl = chrome.runtime.getURL('scripts/content-main.js');
  } catch {
    setResourceWarning();
    return;
  }

  try {
    await import(scriptUrl);
  } catch (error) {
    await captureResourceLoadingException(scriptUrl, error);
  }
})();
