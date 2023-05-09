import { getCookie, html, isWatchPageUrl, on, requestIdleCallback, wrapErrorHandler } from "./generic"
import { contentScript } from "./messaging"

const THEME_LIGHT = -1
const THEME_DEFAULT = 0
const THEME_DARK = 1

export default class Theming {
  constructor(ambientlight) {
    this.ambientlight = ambientlight
    this.settings = ambientlight.settings
  }

  initListeners() {
    // Appearance (theme) changes initiated by the YouTube menu
    this.originalTheme = this.isDarkTheme() ? 1 : -1
    on(document, 'yt-action', async (e) => {
      if (!this.settings.enabled) return
      const name = e?.detail?.actionName
      if (name === 'yt-signal-action-toggle-dark-theme-off') {
        this.originalTheme = await this.prefCookieToTheme()
        this.updateTheme()
      } else if(name === 'yt-signal-action-toggle-dark-theme-on') {
        this.originalTheme = await this.prefCookieToTheme()
        this.updateTheme()
      } else if(name === 'yt-signal-action-toggle-dark-theme-device') {
        this.originalTheme = await this.prefCookieToTheme()
        this.updateTheme()
      } else if(name === 'yt-forward-redux-action-to-live-chat-iframe') {
        // Let YouTube change the theme to an incorrect color in this process
        requestIdleCallback(function forwardReduxActionToLiveChatIframe() {
          // Fix the theme to the correct color after the process
          if (!this.ambientlight.isOnVideoPage) return
          this.updateLiveChatTheme()
        }.bind(this), { timeout: 1 })
      }
    }, undefined, undefined, true)

    
    try {
      // Firefox does not support the cookieStore
      if(window.cookieStore?.addEventListener) {
        cookieStore.addEventListener('change', wrapErrorHandler(async e => {
          for(const change of e.changed) {
            if(change.name !== 'PREF') continue

            this.originalTheme = await this.prefCookieToTheme(change.value)
            this.updateTheme()
          }
        }, true));
      }
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', wrapErrorHandler(async () => {
        this.originalTheme = await this.prefCookieToTheme()
        this.updateTheme()
      }, true))
    } catch(ex) {
      SentryReporter.captureException(ex)
    }
    
    let themeCorrections = 0
    this.themeObserver = new MutationObserver(wrapErrorHandler((a) => {
      if(!this.shouldToggleTheme()) return
      
      themeCorrections++
      this.updateTheme()
      if(themeCorrections === 5) this.themeObserver.disconnect()
    }))
    this.themeObserver.observe(html, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['dark']
    })

    this.initLiveChat() // Depends on this.originalTheme set in initListeners
  }
  
  prefCookieToTheme = async (cookieValue) => {
    if(!cookieValue) {
      cookieValue = (await getCookie('PREF'))?.value || ''
    }

    let f6 = new URLSearchParams(cookieValue)?.get('f6') || null
    if (f6 != null && /^[A-Fa-f0-9]+$/.test(f6)) {
      f6 = parseInt(f6, 16)
    }
    f6 = f6 || 0

    if(!!(f6 & 1 << 165 % 31)) return THEME_DARK
    if(!!(f6 & 1 << 174 % 31)) return THEME_LIGHT
    if(matchMedia('(prefers-color-scheme: dark)').matches) return THEME_DARK
    return THEME_LIGHT
  }

  isDarkTheme = () => (html.getAttribute('dark') !== null)
  
  shouldBeDarkTheme = () => {
    const toTheme = ((!this.settings.enabled || this.ambientlight.isHidden || this.settings.theme === THEME_DEFAULT) ? this.originalTheme : this.settings.theme)
    return (toTheme === THEME_DARK)
  }

  shouldToggleTheme = () => {
    const toDark = this.shouldBeDarkTheme()
    return !(
      this.isDarkTheme() === toDark ||
      (toDark && !isWatchPageUrl())
    )
  }

  updateTheme = wrapErrorHandler(async function updateTheme(beforeToggleCallback = () => undefined) {
    if(this.updatingTheme) return
    if(!this.shouldToggleTheme()) return beforeToggleCallback()

    this.updatingTheme = true
    
    if(this.themeToggleFailed !== false) {
      const lastFailedThemeToggle = await contentScript.getStorageEntryOrEntries('last-failed-theme-toggle')
      if(lastFailedThemeToggle) {
        const now = new Date().getTime()
        const withinThresshold = now - 10000 < lastFailedThemeToggle
        if(withinThresshold) {
          this.settings.setWarning(`Because the previous attempt failed and to prevent repeated page refreshes we temporarily disabled the automatic toggle to the ${this.isDarkTheme() ? 'light' : 'dark'} appearance for 10 seconds.\n\nSet the "Appearance (theme)" setting to "Default" to disable the automatic appearance toggle permanently if it keeps on failing.\n(And let me know via the feedback form that it failed so that I can fix it in the next version of the extension)`)
          this.updatingTheme = false
          return beforeToggleCallback()
        }
        contentScript.setStorageEntry('last-failed-theme-toggle', undefined)
      }
      if(this.themeToggleFailed) {
        this.settings.setWarning('')
        this.themeToggleFailed = false
      }

      if (!this.shouldToggleTheme()) {
        this.updatingTheme = false
        return beforeToggleCallback()
      }
    }

    beforeToggleCallback()
    await this.toggleDarkTheme()
    this.updatingTheme = false
  }.bind(this), true)

  async toggleDarkTheme() {
    const wasDark = this.isDarkTheme()
    
    try {
      yt.config_.EXPERIMENT_FLAGS.kevlar_refresh_on_theme_change = false // Prevents the video page from refreshing every time
    } catch { }
    
    const detail = {
      actionName: 'yt-dark-mode-toggled-action',
      optionalAction: false,
      args: [ !wasDark ], // boolean for iframe live chat
      disableBroadcast: false,
      returnValue: []
    }
    const ytdAppElem = this.ambientlight.ytdAppElem
    const event = new CustomEvent('yt-action', {
      currentTarget: ytdAppElem,
      bubbles: true,
      cancelable: false,
      composed: true,
      detail,
      returnValue: true
    })

    try {
      // dispatchEvent is overriden by Shady DOM when:
      //   window.shadyDOM.settings.noPatch === "on-demand" && ytcfg.get('EXPERIMENT_FLAGS').polymer_on_demand_shady_dom === true
      // Todo: When this is enabled the theme is directly changing when the Windows Theme changes
      if(ytdAppElem?.__shady_native_dispatchEvent) {
        ytdAppElem.__shady_native_dispatchEvent(event)
      } else {
        ytdAppElem.dispatchEvent(event)
      }
    } catch(ex) {
      SentryReporter.captureException(ex)
      return
    }

    const isDark = this.isDarkTheme()
    if (wasDark !== isDark) return
    
    this.themeToggleFailed = true
    await contentScript.setStorageEntry('last-failed-theme-toggle', new Date().getTime())
    console.warn(`Ambient light for YouTube™ | Failed to toggle theme from ${wasDark ? 'dark' : 'light'} to ${isDark ? 'dark' : 'light'} mode`)
  }

  initLiveChat = () => {
    this.initLiveChatSecondaryElem()
    if(this.secondaryInnerElem) return

    const observer = new MutationObserver(wrapErrorHandler(() => {
      this.initLiveChatSecondaryElem()
      if(!this.secondaryInnerElem) return

      observer.disconnect()
    }))
    observer.observe(this.ambientlight.ytdAppElem, {
      childList: true,
      subtree: true
    })
  }
  
  initLiveChatSecondaryElem = () => {
    this.secondaryInnerElem = document.querySelector('#secondary-inner')
    if(!this.secondaryInnerElem) return

    this.initLiveChatElem()
    const observer = new MutationObserver(wrapErrorHandler(this.initLiveChatElem))
    observer.observe(this.secondaryInnerElem, {
      childList: true
    })
  }

  initLiveChatElem = () => {
    const liveChat = document.querySelector('ytd-watch-flexy ytd-live-chat-frame')
    if(!liveChat || this.liveChat === liveChat) return
    
    this.liveChat = liveChat
    this.initLiveChatIframe()
    const observer = new MutationObserver(wrapErrorHandler(this.initLiveChatIframe))
    observer.observe(liveChat, {
      childList: true
    })
  }

  initLiveChatIframe = () => {
    const iframe = document.querySelector('ytd-watch-flexy ytd-live-chat-frame iframe')
    if(!iframe || this.liveChatIframe === iframe) return

    this.liveChatIframe = iframe
    this.updateLiveChatTheme()
    iframe.addEventListener('load', this.updateLiveChatTheme)
  }

  updateLiveChatTheme = () => {
    if (!this.liveChat || !this.liveChatIframe) return

    const toDark = this.shouldBeDarkTheme()
    this.liveChat.postToContentWindow({
      'yt-live-chat-set-dark-theme': toDark
    })
  }
}