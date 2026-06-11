import {
  isEmbedPageUrl,
  isWatchPageUrl,
  on,
  requestIdleCallback,
  wrapErrorHandler,
} from './generic';
import { injectedScript } from './messaging/injected';
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
    // YouTube renders its theme into the html[dark] attribute before the
    // extension toggles anything, so the page itself is the source of the
    // YouTube theme. The device theme media query is not a reliable source:
    // YouTube's theme does not have to match the device theme
    this.youtubeTheme = this.isDarkTheme() ? THEME_DARK : THEME_LIGHT;
    // Refine with the explicit appearance choice persisted from the menu
    this.refreshYoutubeTheme();
    on(
      document,
      'yt-action',
      (e) => {
        if (!this.settings.enabled) return;
        const name = e?.detail?.actionName;
        if (name === 'yt-signal-action-toggle-dark-theme-off') {
          // An explicit choice that matches the device theme cannot be
          // derived from the page, so the menu choice is persisted
          this.youtubeThemeExplicitFromMenu = true;
          this.youtubeTheme = THEME_LIGHT;
          storage.set('youtube-theme-explicit', true);
          this.updateTheme();
        } else if (name === 'yt-signal-action-toggle-dark-theme-on') {
          this.youtubeThemeExplicitFromMenu = true;
          this.youtubeTheme = THEME_DARK;
          storage.set('youtube-theme-explicit', true);
          this.updateTheme();
        } else if (name === 'yt-signal-action-toggle-dark-theme-device') {
          this.youtubeThemeExplicitFromMenu = false;
          storage.set('youtube-theme-explicit', false);
          // YouTube applies its device theme in response to this action;
          // capture the resulting page theme instead of guessing from the
          // device theme media query
          this.capturingYoutubeTheme = true;
          requestAnimationFrame(
            wrapErrorHandler(() => {
              this.capturingYoutubeTheme = false;
              this.youtubeTheme = this.isDarkTheme()
                ? THEME_DARK
                : THEME_LIGHT;
              this.updateTheme();
            }, true)
          );
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

    // Guard against YouTube overriding html[dark] / html[light] at any point
    // after a theme toggle (e.g. when YouTube re-applies its stored account
    // preference asynchronously after a navigation). While the extension is
    // not controlling the theme, an attribute change is YouTube's own theme
    // change instead (e.g. the device theme changed) and is captured as the
    // YouTube theme. MutationObserver callbacks are microtask-queued, so
    // after our own toggle both attributes are already correct and the
    // conditions below short-circuit without re-invoking
    this.themeObserver = new MutationObserver(
      wrapErrorHandler(
        function themeMutation() {
          if (this.capturingYoutubeTheme) return;

          const controlling =
            this.settings.enabled &&
            !this.ambientlight.isHidden &&
            this.settings.theme !== THEME_DEFAULT &&
            !this.youtubeThemeIsExplicit;
          if (!controlling) {
            const pageTheme = this.isDarkTheme() ? THEME_DARK : THEME_LIGHT;
            if (this.youtubeTheme !== pageTheme) {
              this.youtubeTheme = pageTheme;
              if (!isEmbedPageUrl()) this.updateLiveChatTheme();
            }
            return;
          }

          if (this.shouldToggleTheme()) {
            this.updateTheme();
            return;
          }

          // The hashed CSS custom properties also depend on html[light], so
          // re-assert it when it drifts from the applied theme
          const toDark = this.shouldBeDarkTheme();
          if (
            this.isDarkTheme() === toDark &&
            document.documentElement.hasAttribute('light') === toDark
          ) {
            this.updateDocumentTheme(toDark);
          }
        }.bind(this),
        true
      )
    );
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['dark', 'light'],
    });

    if (isEmbedPageUrl()) return;

    this.initLiveChat(); // Depends on this.youtubeTheme set in initListeners
  }

  // Whether the appearance has explicitly been set to Dark or Light in
  // YouTube's own settings instead of following the device theme, observed
  // from the YouTube menu and persisted across page loads
  youtubeThemeExplicitFromMenu = null;
  capturingYoutubeTheme = false;

  get youtubeThemeIsExplicit() {
    return this.youtubeThemeExplicitFromMenu === true;
  }

  refreshYoutubeTheme = wrapErrorHandler(
    async function refreshYoutubeTheme() {
      const storedExplicit = await storage.get('youtube-theme-explicit');
      if (
        this.youtubeThemeExplicitFromMenu === null &&
        typeof storedExplicit === 'boolean'
      ) {
        this.youtubeThemeExplicitFromMenu = storedExplicit;
      }

      // The page already provided the YouTube theme; updateTheme always runs
      // because a toggle may already have been applied before this resolved
      this.updateTheme();
    }.bind(this),
    true
  );

  isDarkTheme = () => document.documentElement.getAttribute('dark') != null;

  shouldBeDarkTheme = (enabledAndVisible) => {
    const enabled =
      enabledAndVisible === undefined
        ? !this.settings.enabled || this.ambientlight.isHidden
        : !enabledAndVisible;
    // An appearance explicitly set to Dark or Light in YouTube's own settings
    // is respected; the extension theme only applies while YouTube follows
    // the device theme
    const toTheme =
      enabled ||
      this.settings.theme === THEME_DEFAULT ||
      this.youtubeThemeIsExplicit
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
        fromSettings &&
        this.youtubeThemeIsExplicit &&
        this.settings.theme !== THEME_DEFAULT &&
        this.settings.theme !== this.youtubeTheme
      ) {
        this.settings.setWarning(
          `The appearance has been set to ${
            this.youtubeTheme === THEME_DARK ? 'Dark' : 'Light'
          } in YouTube's own settings and is being respected.\n\nSelect "Use device theme" in YouTube's appearance settings to let this setting control the appearance.`
        );
      }

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
              `Because the previous theme toggle attempt failed to prevent repeated page refreshes, the automatic toggle to the ${
                this.isDarkTheme() ? 'light' : 'dark'
              } appearance has been disabled for 10 seconds.\n\nSet the "Appearance (theme)" setting to "Default" to disable the automatic appearance toggle permanently if it keeps on failing.\n(And let me know via the feedback form that it failed so that I can fix it in the next version of the extension)`
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
    await injectedScript.postAndReceiveMessage('update-theme', toDark);
  }

  async toggleDarkTheme() {
    const wasDark = this.isDarkTheme();
    await this.updateDocumentTheme(!wasDark);
    if (!isEmbedPageUrl()) {
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
