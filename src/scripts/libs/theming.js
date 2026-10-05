import {
  getCookie,
  isEmbedPageUrl,
  isWatchPageUrl,
  on,
  requestIdleCallback,
  wrapErrorHandler,
} from './generic';
import { isBilibiliPlatform } from './platform';
import { injectedScript } from './messaging/injected';
import SentryReporter from './errors/sentry-reporter';
import { storage } from './storage';

const THEME_LIGHT = -1;
const THEME_DEFAULT = 0;
const THEME_DARK = 1;

export default class Theming {
  constructor(ambientlight) {
    this.ambientlight = ambientlight;
    this.settings = ambientlight.settings;
  }

  initListeners() {
    // Appearance (theme) changes initiated by the YouTube menu
    this.youtubeTheme = this.isDarkTheme() ? THEME_DARK : THEME_LIGHT;
    on(
      document,
      'yt-action',
      async (e) => {
        if (isBilibiliPlatform) return; // Bilibili does not emit yt-action events
        if (!this.settings.enabled) return;
        const name = e?.detail?.actionName;
        if (name === 'yt-signal-action-toggle-dark-theme-off') {
          this.youtubeTheme = await this.prefCookieToTheme();
          this.updateTheme();
        } else if (name === 'yt-signal-action-toggle-dark-theme-on') {
          this.youtubeTheme = await this.prefCookieToTheme();
          this.updateTheme();
        } else if (name === 'yt-signal-action-toggle-dark-theme-device') {
          this.youtubeTheme = await this.prefCookieToTheme();
          this.updateTheme();
        } else if (name === 'yt-forward-redux-action-to-live-chat-iframe') {
          // Let YouTube change the theme to an incorrect color in this process
          requestIdleCallback(
            function forwardReduxActionToLiveChatIframe() {
              // Fix the theme to the correct color after the process
              if (!this.ambientlight.isOnVideoPage) return;
              if (e.detail.args?.[0]?.type === 'SET_WATCH_SCROLL_TOP') return;

              this.updateLiveChatTheme();
            }.bind(this),
            { timeout: 1 }
          );
        }
      },
      undefined,
      true
    );

    try {
      // Firefox does not support the cookieStore
      if (!isBilibiliPlatform && globalThis.cookieStore?.addEventListener) {
        cookieStore.addEventListener(
          'change',
          wrapErrorHandler(async (e) => {
            for (const change of e.changed) {
              if (change.name !== 'PREF') continue;

              this.youtubeTheme = await this.prefCookieToTheme(change.value);
              this.updateTheme();
            }
          }, true)
        );
      }
      matchMedia('(prefers-color-scheme: dark)').addEventListener(
        'change',
        wrapErrorHandler(async () => {
          this.youtubeTheme = await this.getPageTheme();
          this.updateTheme();
        }, true)
      );
    } catch (ex) {
      SentryReporter.captureException(ex);
    }

    let themeCorrections = 0;
    this.themeObserver = new MutationObserver(
      wrapErrorHandler(
        async function themeMutation() {
          // Bilibili's theme lives in a class, so re-read it from the DOM first.
          // This keeps following the page theme when the "Appearance (theme)"
          // setting is set to "Default", where updateTheme() does nothing.
          if (isBilibiliPlatform) this.youtubeTheme = await this.getPageTheme();
          if (!this.shouldToggleTheme()) return;

          themeCorrections++;
          this.updateTheme();
          if (themeCorrections === 5) this.themeObserver.disconnect();
        }.bind(this),
        true
      )
    );
    const themeObserverOptions = isBilibiliPlatform
      ? {
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ['class'],
        }
      : {
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ['dark'],
        };
    this.themeObserver.observe(document.documentElement, themeObserverOptions);
    // Bilibili applies its dark mode to either <html> or <body>
    if (isBilibiliPlatform)
      this.themeObserver.observe(document.body, themeObserverOptions);

    if (isEmbedPageUrl() || isBilibiliPlatform) return;

    this.initLiveChat(); // Depends on this.youtubeTheme set in initListeners
  }

  prefCookieToTheme = async (cookieValue) => {
    if (!cookieValue) {
      cookieValue = (await getCookie('PREF'))?.value || '';
    }

    let f6 = new URLSearchParams(cookieValue)?.get('f6') || null;
    if (f6 != null && /^[A-Fa-f0-9]+$/.test(f6)) {
      f6 = parseInt(f6, 16);
    }
    f6 = f6 || 0;

    if (f6 & (1 << 165 % 31)) return THEME_DARK;
    if (f6 & (1 << 174 % 31)) return THEME_LIGHT;
    if (matchMedia('(prefers-color-scheme: dark)').matches) return THEME_DARK;
    return THEME_LIGHT;
  };

  /**
   * The theme the page itself is currently using, independent of our setting:
   * YouTube stores it in the PREF cookie, Bilibili in a class on the page.
   */
  getPageTheme = async () => {
    if (isBilibiliPlatform)
      return this.isDarkTheme() ? THEME_DARK : THEME_LIGHT;
    return await this.prefCookieToTheme();
  };

  isDarkTheme = () => {
    if (!isBilibiliPlatform)
      return document.documentElement.getAttribute('dark') != null;

    // Bilibili toggles a "dark" class on <html> or <body> (the "light" class is
    // supported for completeness). If neither is present, fall back to the
    // actual background color so the extension still follows the page.
    for (const elem of [document.documentElement, document.body]) {
      if (!elem) continue;
      if (elem.classList.contains('dark')) return true;
      if (elem.classList.contains('light')) return false;
    }
    return this.hasDarkBackground();
  };

  hasDarkBackground = () => {
    for (const elem of [document.body, document.documentElement]) {
      if (!elem) continue;
      const backgroundColor = getComputedStyle(elem).backgroundColor;
      const match = backgroundColor?.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/
      );
      if (!match) continue;
      if (match[4] !== undefined && parseFloat(match[4]) === 0) continue;
      const [r, g, b] = [match[1], match[2], match[3]].map(Number);
      return r * 0.299 + g * 0.587 + b * 0.114 < 128;
    }
    return false;
  };

  shouldBeDarkTheme = (enabledAndVisible) => {
    const enabled =
      enabledAndVisible === undefined
        ? !this.settings.enabled || this.ambientlight.isHidden
        : !enabledAndVisible;
    const toTheme =
      enabled || this.settings.theme === THEME_DEFAULT
        ? this.youtubeTheme
        : this.settings.theme;
    return toTheme === THEME_DARK;
  };

  shouldToggleTheme = () => {
    const toDark = this.shouldBeDarkTheme();
    return !(this.isDarkTheme() === toDark || (toDark && !isWatchPageUrl()));
  };

  updateTheme = wrapErrorHandler(
    async function updateTheme(fromSettings = false) {
      if (
        this.updatingTheme ||
        (!fromSettings && this.settings.theme === THEME_DEFAULT) ||
        !this.shouldToggleTheme()
      )
        return;

      this.updatingTheme = true;

      if (this.themeToggleFailed !== false) {
        const lastFailedThemeToggle = await new Promise(
          // eslint-disable-next-line no-async-promise-executor
          async (resolve, reject) => {
            try {
              let timeout = setTimeout(() => {
                timeout = undefined;
                resolve();
              }, 5000);
              const result = await storage.get('last-failed-theme-toggle');
              if (!timeout) return;

              clearTimeout(timeout);
              resolve(result);
            } catch (ex) {
              reject(ex);
            }
          }
        );

        if (lastFailedThemeToggle) {
          const now = new Date().getTime();
          const withinThresshold = now - 10000 < lastFailedThemeToggle;
          if (withinThresshold) {
            this.settings.setWarning(
              `Because the previous attempt failed and to prevent repeated page refreshes we temporarily disabled the automatic toggle to the ${
                this.isDarkTheme() ? 'light' : 'dark'
              } appearance for 10 seconds.\n\nSet the "Appearance (theme)" setting to "Default" to disable the automatic appearance toggle permanently if it keeps on failing.\n(And let me know via the feedback form that it failed so that I can fix it in the next version of the extension)`
            );
            this.updatingTheme = false;
            return;
          }
          storage.set('last-failed-theme-toggle', undefined);
        }
        if (this.themeToggleFailed) {
          this.settings.setWarning('');
          this.themeToggleFailed = false;
        }

        if (!this.shouldToggleTheme()) {
          this.updatingTheme = false;
          return;
        }
      }

      await this.toggleDarkTheme();
      this.updatingTheme = false;
    }.bind(this),
    true
  );

  async updateDocumentTheme(toDark) {
    if (isBilibiliPlatform) {
      // The injected (page world) script only knows YouTube's bare "dark"
      // attribute, and Bilibili's own theme is a class, so apply it directly.
      document.documentElement.classList.toggle('dark', toDark);
      return;
    }
    await injectedScript.postAndReceiveMessage('update-theme', toDark);
  }

  async toggleDarkTheme() {
    const wasDark = this.isDarkTheme();
    await this.updateDocumentTheme(!wasDark);
    if (!isEmbedPageUrl() && !isBilibiliPlatform) {
      this.updateLiveChatTheme();
    }

    const isDark = this.isDarkTheme();
    if (wasDark !== isDark) return;

    this.themeToggleFailed = true;
    await storage.set('last-failed-theme-toggle', new Date().getTime());
    this.settings.setWarning(
      `Failed to toggle the page theme to from ${
        wasDark ? 'dark' : 'light'
      } to ${
        isDark ? 'dark' : 'light'
      } mode.\n\nSet the "Appearance (theme)" setting to "Default" to disable the automatic appearance toggle permanently if it keeps on failing.\n(And let me know via the feedback form that it failed so that I can fix it in the next version of the extension)`
    );
  }

  initLiveChat = () => {
    if (isBilibiliPlatform) return; // Bilibili has no YouTube live chat frame
    this.initLiveChatSecondaryElem();
    if (this.secondaryElem) return;

    const observer = new MutationObserver(
      wrapErrorHandler(
        function initLiveChatMutation() {
          this.initLiveChatSecondaryElem();
          if (!this.secondaryElem) return;

          observer.disconnect();
        }.bind(this),
        true
      )
    );
    observer.observe(this.ambientlight.ytdAppElem, {
      childList: true,
      subtree: true,
    });
  };

  initLiveChatSecondaryElem = () => {
    this.secondaryElem = document.querySelector('#secondary');
    if (!this.secondaryElem) return;

    this.initLiveChatElem();
    const observer = new MutationObserver(
      wrapErrorHandler(this.initLiveChatElem)
    );
    observer.observe(this.secondaryElem, {
      childList: true,
    });
  };

  initLiveChatElem = () => {
    const liveChatElem = document.querySelector('ytd-app ytd-live-chat-frame');
    if (!liveChatElem || this.liveChatElem === liveChatElem) return;

    liveChatElem.dataset.ytalElem = 'live-chat';
    this.liveChatElem = liveChatElem;

    this.initLiveChatIframe();
    const observer = new MutationObserver(
      wrapErrorHandler(this.initLiveChatIframe)
    );
    observer.observe(liveChatElem, {
      childList: true,
    });
  };

  initLiveChatIframe = () => {
    const iframeElem = document.querySelector(
      'ytd-app ytd-live-chat-frame iframe'
    );
    if (!iframeElem || this.liveChatIframeElem === iframeElem) return;

    this.liveChatIframeElem = iframeElem;
    this.updateLiveChatTheme();
    on(iframeElem, 'load', () => {
      this.ambientlight.updateLayoutPerformanceImprovements();
      this.updateLiveChatTheme();
    });
  };

  updateLiveChatThemeThrottle = {};
  updateLiveChatTheme = () => {
    if (isBilibiliPlatform) return;
    if (!this.liveChatElem || !this.liveChatIframeElem) this.initLiveChatElem();
    if (!this.liveChatElem || !this.liveChatIframeElem) return;
    if (this.updateLiveChatThemeThrottle.timeout) return;

    const update = function updateLiveChatThemeUpdate() {
      this.updateLiveChatThemeThrottle.updateTime = performance.now();
      if (!this.ambientlight.isOnVideoPage) return;

      const toDark = this.shouldBeDarkTheme();
      injectedScript.postMessage('set-live-chat-theme', toDark);
    }.bind(this);

    if (this.updateLiveChatThemeThrottle.updateTime > performance.now() - 500) {
      this.updateLiveChatThemeThrottle.timeout = setTimeout(() => {
        update();
        this.updateLiveChatThemeThrottle.timeout = undefined;
      }, 500);
    } else {
      update();
    }
  };
}
