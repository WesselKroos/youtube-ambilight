import { html, body, on, off, setTimeout, supportsWebGL } from './generic'
import SentryReporter from './sentry-reporter'
import { contentScript } from './messaging'
import { getBrowser } from './utils'
import SettingsConfig from './settings-config'

export const FRAMESYNC_DECODEDFRAMES = 0
export const FRAMESYNC_DISPLAYFRAMES = 1
export const FRAMESYNC_VIDEOFRAMES = 2

const feedbackFormLink = document.currentScript?.getAttribute('data-feedback-form-link') || 'https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform'
const baseUrl = document.currentScript?.getAttribute('data-base-url') || ''
const version = document.currentScript?.getAttribute('data-version') || ''

export default class Settings {
  saveStorageEntryTimeout = {}

  constructor(ambientlight, menuBtnParent, menuElemParent) {
    return (async function settingsConstructor() {
      this.ambientlight = ambientlight
      this.menuBtnParent = menuBtnParent
      this.menuElemParent = menuElemParent

      await this.getAll()
      this.initMenu()
      if(this.webGLCrashDate) this.showWebGLCrashDescription()
      if(this.pendingWarning) this.pendingWarning()
      return this
    }.bind(this))()
  }

  static getStoredSettingsCached = async () => {
    if(Settings.storedSettingsCached) {
      return Settings.storedSettingsCached
    }

    const settingsToRemove = []
    for(const setting of SettingsConfig) {
      if(supportsWebGL()) {
        if(setting.name === 'resolution' && getBrowser() === 'Firefox') {
          setting.default = 50
        }
      } else {
        if([
          'resolution',
          'frameFading'
        ].includes(setting.name)) {
          settingsToRemove.push(setting)
        }
        if([
          'webGL'
        ].includes(setting.name)) {
          setting.default = false
          setting.disabled = 'WebGL is disabled in your browser'
        }
      }
      
      if(HTMLVideoElement.prototype.requestVideoFrameCallback) {
        if(setting.name === 'frameSync') {
          setting.max = 2
          setting.default = 2
        }
      }
    }
    for(const setting of settingsToRemove) {
      SettingsConfig.splice(SettingsConfig.indexOf(setting), 1)
    }

    const names = []
    for (const setting of SettingsConfig) {
      names.push(`setting-${setting.name}`)

      if(setting.defaultKey !== undefined) {
        names.push(`setting-${setting.name}-key`)
      }
    }
    names.push('setting-webGLCrashed')
    names.push('setting-webGLCrashedAtVersion')
    names.push('setting-surroundingContentImagesTransparency')

    Settings.storedSettingsCached = await contentScript.getStorageEntryOrEntries(names, true) || {}

    // Disable enabled WebGL setting if not supported anymore
    if(Settings.storedSettingsCached['setting-webGL'] && !supportsWebGL()) {
      Settings.storedSettingsCached['setting-webGL'] = null
    }

    return Settings.storedSettingsCached;
  }
  
  async getAll() {
    let storedSettings = {}
    try {
      storedSettings = await Settings.getStoredSettingsCached();
    } catch {
      this.setWarning('The settings cannot be retrieved, the extension could have been updated.\nRefresh the page to retry again.')
    }

    this.migrateWebGLCrash(storedSettings)

    for (const setting of SettingsConfig) {
      const value = storedSettings[`setting-${setting.name}`]
      this[setting.name] = this.processStorageEntry(setting.name, value)

      if(setting.defaultKey !== undefined) {
        let key = storedSettings[`setting-${setting.name}-key`]
        if(key === null) key = setting.defaultKey
        setting.key = key
      }
    }
    
    this.migrate(storedSettings)

    // Makes the new default framerateLimit of 30 backwards compatible with a previously enabled frameBlending
    if(this.frameBlending && this.framerateLimit !== 0) {
      this.set('framerateLimit', 0)
    }

    await this.flushPendingStorageEntries() // Complete migrations

    if(this.enabled) html.setAttribute('data-ambientlight-hide-scrollbar', this.hideScrollbar)
  }

  migrate(storedSettings) {
    const surroundingContentImagesTransparency = storedSettings['setting-surroundingContentImagesTransparency']
    if(typeof surroundingContentImagesTransparency === 'number') {
      const opacity = 100 - surroundingContentImagesTransparency
      this.set('surroundingContentImagesOpacity', opacity)
      this['surroundingContentImagesOpacity'] = opacity

      this.saveStorageEntry('surroundingContentImagesTransparency', undefined)
    }
  }

  migrateWebGLCrash(storedSettings) {
    const webGLCrashed = storedSettings['setting-webGLCrashed']
    if(!webGLCrashed) return

    const webGL = storedSettings['setting-webGL']
    if(webGL === false) return

    if(webGL) {
      this.saveStorageEntry('webGLCrashed', undefined)
      this.saveStorageEntry('webGLCrashedAtVersion', undefined)
      return
    }

    const webGLCrashDate = new Date(webGLCrashed)
    const weekAfterCrashDate = new Date(webGLCrashDate.setDate(webGLCrashDate.getDate() + 7))
    // const weekAfterCrashDate = new Date(webGLCrashDate.setSeconds(webGLCrashDate.getSeconds() + 20))
    const retryAfterUpdateOrAWeekLater = (
      version !== storedSettings['setting-webGLCrashedAtVersion'] ||
      weekAfterCrashDate < new Date()
    )
    if(retryAfterUpdateOrAWeekLater) {
      this.saveStorageEntry('webGLCrashed', undefined)
      this.saveStorageEntry('webGLCrashedAtVersion', undefined)
      return
    }

    this.webGLCrashDate = webGLCrashDate
    SettingsConfig.find(setting => setting.name === 'webGL').default = false // Disable by default
  }

  handleWebGLCrash = async () => {
    this.webGLCrashDate = new Date()
    this.saveStorageEntry('webGLCrashed', +this.webGLCrashDate)
    this.saveStorageEntry('webGLCrashedAtVersion', version)
    
    this.set('webGL', false, true)
    this.updateVisibility()

    this.saveStorageEntry('webGL', undefined) // Override false
    this.saveStorageEntry('frameFading', undefined) // Override potential crash reason
    this.saveStorageEntry('resolution', undefined) // Override potential crash reason

    await this.flushPendingStorageEntries()
    this.showWebGLCrashDescription()
  }

  showWebGLCrashDescription = () => {
    const labelElem = this.menuElem.querySelector('#setting-webGL .ytp-menuitem-label')
    labelElem.appendChild(document.createElement('br'))

    const webGLAvailable = SettingsConfig.find(setting => setting.name === 'webGL').disabled === undefined
    const descriptionElem = document.createElement('span')
    descriptionElem.classList.add('ytpa-menuitem-description')
    descriptionElem.style.color = '#fa0'
    descriptionElem.appendChild(document.createTextNode(`${webGLAvailable ? 'Failed' : 'and failed'} to load at ${this.webGLCrashDate.toLocaleTimeString()} ${this.webGLCrashDate.toLocaleDateString()}`))
    
    if(webGLAvailable) {
      descriptionElem.appendChild(document.createElement('br'))
      descriptionElem.appendChild(document.createElement('br'))
      descriptionElem.appendChild(document.createTextNode(`Check your browsers Hardware acceleration and  WebGL settings or click on the link "troubleshoot performance problems" at the top of this menu to troubleshoot this problem.`))
      descriptionElem.appendChild(document.createElement('br'))
      descriptionElem.appendChild(document.createElement('br'))
      descriptionElem.appendChild(document.createTextNode('Note: You can re-enable this setting to try it again. In case the WebGL renderer fails again we will update the time at which it failed.'))
    }

    labelElem.appendChild(descriptionElem)
  }
  
  initMenu() {
    this.menuBtn = document.createElement('button')
    this.menuBtn.classList.add('ytp-button', 'ytp-ambientlight-settings-button')
    this.menuBtn.setAttribute('aria-owns', 'ytp-id-190')
    on(this.menuBtn, 'click', this.onSettingsBtnClicked, undefined, (listener) => this.onSettingsBtnClickedListener = listener)
    this.menuBtn.innerHTML = `<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
      <path d="m 23.94,18.78 c .03,-0.25 .05,-0.51 .05,-0.78 0,-0.27 -0.02,-0.52 -0.05,-0.78 l 1.68,-1.32 c .15,-0.12 .19,-0.33 .09,-0.51 l -1.6,-2.76 c -0.09,-0.17 -0.31,-0.24 -0.48,-0.17 l -1.99,.8 c -0.41,-0.32 -0.86,-0.58 -1.35,-0.78 l -0.30,-2.12 c -0.02,-0.19 -0.19,-0.33 -0.39,-0.33 l -3.2,0 c -0.2,0 -0.36,.14 -0.39,.33 l -0.30,2.12 c -0.48,.2 -0.93,.47 -1.35,.78 l -1.99,-0.8 c -0.18,-0.07 -0.39,0 -0.48,.17 l -1.6,2.76 c -0.10,.17 -0.05,.39 .09,.51 l 1.68,1.32 c -0.03,.25 -0.05,.52 -0.05,.78 0,.26 .02,.52 .05,.78 l -1.68,1.32 c -0.15,.12 -0.19,.33 -0.09,.51 l 1.6,2.76 c .09,.17 .31,.24 .48,.17 l 1.99,-0.8 c .41,.32 .86,.58 1.35,.78 l .30,2.12 c .02,.19 .19,.33 .39,.33 l 3.2,0 c .2,0 .36,-0.14 .39,-0.33 l .30,-2.12 c .48,-0.2 .93,-0.47 1.35,-0.78 l 1.99,.8 c .18,.07 .39,0 .48,-0.17 l 1.6,-2.76 c .09,-0.17 .05,-0.39 -0.09,-0.51 l -1.68,-1.32 0,0 z m -5.94,2.01 c -1.54,0 -2.8,-1.25 -2.8,-2.8 0,-1.54 1.25,-2.8 2.8,-2.8 1.54,0 2.8,1.25 2.8,2.8 0,1.54 -1.25,2.8 -2.8,2.8 l 0,0 z" fill="#fff"></path>
    </svg>`

    const settingsMenuBtnTooltip = document.createElement('div')
    settingsMenuBtnTooltip.classList.add('ytp-tooltip', 'ytp-bottom', 'ytp-ambientlight-settings-button-tooltip')
    settingsMenuBtnTooltip.setAttribute('aria-live', 'polite')
    const settingsMenuBtnTooltipTextWrapper = document.createElement('div')
    settingsMenuBtnTooltipTextWrapper.classList.add('ytp-tooltip-text-wrapper')
    settingsMenuBtnTooltip.prepend(settingsMenuBtnTooltipTextWrapper)
    const settingsMenuBtnTooltipText = document.createElement('span')
    settingsMenuBtnTooltipText.classList.add('ytp-tooltip-text', 'ytp-tooltip-text-no-title')
    settingsMenuBtnTooltipText.textContent = 'Ambient light settings'
    settingsMenuBtnTooltipTextWrapper.prepend(settingsMenuBtnTooltipText)

    this.menuBtn.prepend(settingsMenuBtnTooltip)
    const ytSettingsBtn = document.querySelector('ytd-watch-flexy [data-tooltip-target-id="ytp-autonav-toggle-button"]')
    if (ytSettingsBtn) {
      ytSettingsBtn.parentNode.insertBefore(this.menuBtn, ytSettingsBtn)
    } else {
      this.menuBtnParent.prepend(this.menuBtn)
    }

    this.menuElem = document.createElement('div')
    this.menuElem.classList.add(
      ...([
        'ytp-popup',
        'ytp-settings-menu',
        'ytp-rounded-menu',
        'ytpa-ambientlight-settings-menu', 
        (this.advancedSettings) ? 'ytpa-ambientlight-settings-menu--advanced' : undefined
      ].filter(c => c))
    )
    this.menuElem.setAttribute('id', 'ytp-id-190')
    this.menuElem.innerHTML = `
      <div class="ytp-panel">
        <div class="ytp-panel-menu" role="menu">
          <div class="ytp-menuitem ytpa-menuitem--warning" style="display: none">
            <div class="ytp-menuitem-label" rowspan="2">
              <span class="ytpa-warning"></span>
            </div>
          </div>
          <div class="ytp-menuitem ytpa-menuitem--info" style="display: none">
            <div class="ytp-menuitem-label" rowspan="2">
              <span class="ytpa-info"></span>
            </div>
          </div>
          <div class="ytp-menuitem ytpa-menuitem--header">
            <div class="ytp-menuitem-label">
              <a class="ytpa-feedback-link" href="https://github.com/WesselKroos/youtube-ambilight/blob/master/TROUBLESHOOT.md" target="_blank" rel="noopener">
                <span class="ytpa-feedback-link__text">Troubleshoot performance problems</span>
              </a>
            </div>
            <div class="ytp-menuitem-content">
              <button
                class="ytpa-reset-settings-btn"
                title="Reset all settings"
              ></button>
            </div>
          </div>
          <div class="ytp-menuitem ytpa-menuitem--header">
            <div class="ytp-menuitem-label">
              <a class="ytpa-feedback-link" href="${feedbackFormLink}" target="_blank" rel="noopener">
                <span class="ytpa-feedback-link__text">Give feedback or a rating</span>
              </a>
            </div>
            <div class="ytp-menuitem-content">
              <a class="ytpa-donate-link" href="https://ko-fi.com/G2G59EK8L" target="_blank" rel="noopener">
                <img class="ytpa-donate-link__image" alt="Support me via a donation"" title="Support me via a donation"" height="23" src="${baseUrl}images/donate.svg" />
              </a>
            </div>
          </div>
          ${
      SettingsConfig.map(setting => {
        let classes = 'ytp-menuitem'
        if(setting.advanced) classes += ' ytpa-menuitem--advanced'
        if(setting.hdr) classes += ' ytpa-menuitem--hdr'
        if(setting.new) classes += ' ytpa-menuitem--new'
        if(setting.experimental) classes += ' ytpa-menuitem--experimental'
        
        const label = `${setting.label}
          ${setting.key ? ` [<span contenteditable="true" class="ytpa-menuitem-key" title="Click here and press a key to change the hotkey">${setting.key}</span>]` : ''}
          ${setting.questionMark 
            ? `<a
            title="${setting.questionMark.title}" 
            ${setting.questionMark.href ? `href="${setting.questionMark.href}" target="_blank"` : 'href="#" onclick="return false"' }
            style="padding: 0 5px;">
              ?
            </a>`
            : ''
          }
          ${setting.description ? `<br/><span class="ytpa-menuitem-description">${setting.description}</span>` : ''}
        `
        const value = this[setting.name];
        
        if (setting.type === 'checkbox') {
          return `
            <div id="setting-${setting.name}" 
              class="${classes}" 
              role="menuitemcheckbox" 
              aria-checked="${value ? 'true' : 'false'}" 
              ${setting.disabled ? 'aria-disabled="true" title="This setting is unavailable"' : 'title="Right click to reset" tabindex="0"'}
            >
              <div class="ytp-menuitem-label">${label}${setting.disabled ? `<span class="ytpa-menuitem-description" style="color: #fa0">${setting.disabled}</span>` :''}</div>
              <div class="ytp-menuitem-content">
                <div class="ytp-menuitem-toggle-checkbox"></div>
              </div>
            </div>
          `
        } else if (setting.type === 'list') {
          return `
            <div id="setting-${setting.name}" class="ytp-menuitem-range-wrapper">
              <div class="${classes}" aria-haspopup="false" role="menuitemrange" tabindex="0">
                <div class="ytp-menuitem-label">${label}</div>
                <div class="ytp-menuitem-content">
                  ${(setting.manualinput !== false)
                    ? `<input id="setting-${setting.name}-manualinput" type="text" class="ytpa-menuitem-input" value="${value}" />`
                    : ''
                  }
                  <div class="ytp-menuitem-value" id="setting-${setting.name}-value">${this.getSettingListDisplayText(setting)}</div>
                </div>
              </div>
              <div 
              class="ytp-menuitem-range ${setting.snapPoints ? 'ytp-menuitem-range--has-snap-points' : ''}" 
              rowspan="2" 
              title="Right click to reset">
                <input 
                  id="setting-${setting.name}-range" 
                  type="range" 
                  colspan="2" 
                  value="${this.getInputRangeValue(setting.name)}" 
                  ${setting.min !== undefined ? `min="${setting.min}"` : ''} 
                  ${setting.max !== undefined ? `max="${setting.max}"` : ''} 
                  ${setting.valuePoints 
                    ? `min="0" max="${setting.valuePoints.length - 1}"` 
                    : ''}
                  ${(setting.step || setting.valuePoints) ? `step="${setting.step || 1}"` : ''}
              />
              </div>
              ${!setting.snapPoints ? '' : `
                <datalist class="setting-range-datalist" id="snap-points-${setting.name}">
                  ${setting.snapPoints.map(({ label, hiddenLabel, value, flip }, i) => {
                    return `
                      <option 
                        value="${value}" 
                        class="setting-range-datalist__label ${flip ? 'setting-range-datalist__label--flip' : ''}" 
                        style="margin-left: ${(value + (-setting.min)) * (100 / (setting.max - setting.min))}%"
                        label="${label || ''}"
                        title="Set to ${hiddenLabel || label}"
                      >
                        ${label || ''}
                      </option>
                    `;
                  }).join('')}
                </datalist>
              `}
            </div>
          `
        } else if (setting.type === 'section') {
          return `
            <div 
              class="ytpa-section ${value ? 'is-collapsed' : ''} ${setting.advanced ? 'ytpa-section--advanced' : ''} ${setting.hdr ? 'ytpa-section--hdr' : ''}" 
              data-name="${setting.name}">
              <div class="ytpa-section__cell">
                <div class="ytpa-section__label">${label}</div>
              </div>
              <div class="ytpa-section__cell">
                <div class="ytpa-section__fill">-</div>
              </div>
            </div>
          `
        }
      }).join('')
          }
        </div>
      </div>`

    this.warningItemElem = this.menuElem.querySelector('.ytpa-menuitem--warning')
    this.warningElem = this.warningItemElem.querySelector('.ytpa-warning')
    this.infoItemElem = this.menuElem.querySelector('.ytpa-menuitem--info')
    this.infoElem = this.infoItemElem.querySelector('.ytpa-info')

    const resetSettingsBtnElem = this.menuElem.querySelector('.ytpa-reset-settings-btn')
    on(resetSettingsBtnElem, 'click', async () => {
      if(!confirm('Are you sure you want to reset ALL the settings and reload the watch page?')) return
      

      for(const setting of SettingsConfig) {
        this.saveStorageEntry(setting.name, undefined)
        if(setting.defaultKey) {
          this.saveStorageEntry(`${setting.name}-key`, undefined)
        }
      }
      await this.flushPendingStorageEntries()
      await new Promise(resolve => setTimeout(resolve, 1000))
      this.reloadPage()
    })
    for (const label of this.menuElem.querySelectorAll('.setting-range-datalist__label')) {
      on(label, 'click', (e) => {
        const value = e.target.value
        const name = e.target.parentNode.id.replace('snap-points-', '')
        const inputElem = this.menuElem.querySelector(`#setting-${name}-range`)
        inputElem.value = value
        inputElem.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }
    for (const section of this.menuElem.querySelectorAll('.ytpa-section')) {
      on(section, 'click', (e) => {
        const name = section.getAttribute('data-name')
        const value = !this[name]
        this.set(name, value)
        section.classList[value ? 'add' : 'remove']('is-collapsed')
      })
    }
    
    on(this.menuElem, 'mousemove click dblclick contextmenu touchstart touchmove touchend', (e) => {
      e.stopPropagation()
    })
    on(this.menuElem, 'contextmenu', (e) => {
      e.preventDefault()
    })

    this.menuElemParent.prepend(this.menuElem)

    this.bezelElem = document.createElement('div')
    this.bezelElem.classList.add('yta-bezel', 'ytp-bezel', 'yta-bezel--no-animation')
    this.bezelElem.setAttribute('role', 'status')
    this.bezelElem.innerHTML = `
      <div class="ytp-bezel-icon">
        <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
          <text class="ytp-svg-fill" x="50%" y="59%" dominant-baseline="middle" text-anchor="middle"></text>
        </svg>
      </div>`
    on(this.bezelElem, 'animationend', () => {
      this.bezelElem.classList.add('yta-bezel--no-animation')
    })
    this.bezelTextElem = this.bezelElem.querySelector('text')
    this.menuElemParent.prepend(this.bezelElem)

    for (const setting of SettingsConfig) {
      const settingElem = this.menuElem.querySelector(`#setting-${setting.name}`)
      if (!settingElem) continue
      
      const keyElem = settingElem.querySelector('.ytpa-menuitem-key')
      if (keyElem) {
        const settingElem = this.menuElem.querySelector(`#setting-${setting.name}`)
        on(keyElem, 'click', (e) => {
          e.stopPropagation()
          e.preventDefault()
        })
        on(keyElem, 'focus', (e) => {
          // Select all
          const range = document.createRange()
          range.selectNodeContents(keyElem)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
        })
        on(keyElem, 'keydown keyup keypress', (e) => {
          e.stopPropagation()
          e.preventDefault()
          keyElem.blur()

          const key = (e.key.length === 1) ? e.key?.toUpperCase() : ' '
          if(keyElem.textContent === key) return

          keyElem.textContent = key
          this.setKey(setting.name, key)
        })
        on(keyElem, 'blur', (e) => {
          // Deselect all
          const sel = window.getSelection()
          sel.removeAllRanges()
        })
      }

      if (setting.type === 'list') {
        const inputElem = this.menuElem.querySelector(`#setting-${setting.name}-range`)
        const valueElem = this.menuElem.querySelector(`#setting-${setting.name}-value`)

        const manualInputElem = this.menuElem.querySelector(`#setting-${setting.name}-manualinput`)
        if(manualInputElem) {
          on(manualInputElem, 'keydown keyup keypress', (e) => {
            e.stopPropagation()
          })
          const onChange = (empty = false) => {
            if(inputElem.value === manualInputElem.value) return
            inputElem.value = manualInputElem.value
            inputElem.dispatchEvent(new Event('change'))
          }
          on(manualInputElem, 'change', (e) => onChange())
          on(manualInputElem, 'blur', (e) => onChange())
          on(manualInputElem, 'keypress', (e) => {
            if(e.key !== 'Enter') return
            manualInputElem.blur()
          })
        }

        on(inputElem, 'change mousemove dblclick contextmenu touchmove', async (e) => {
          if(e.type === 'mousemove' && e.buttons === 0) return

          let value = parseFloat(inputElem.value)
          if (e.type === 'dblclick' || e.type === 'contextmenu') {
            value = SettingsConfig.find(s => s.name === setting.name).default
            if(setting.valuePoints) {
              value = setting.valuePoints.indexOf(value)
            }
          } else if (inputElem.value === inputElem.getAttribute('data-previous-value')) {
            return
          }
          inputElem.value = value
          inputElem.setAttribute('data-previous-value', value)
          if (manualInputElem) {
            manualInputElem.value = inputElem.value
          }
          if(setting.valuePoints) {
            value = setting.valuePoints[value]
          }
          if(setting.name === 'frameFading') {
            value = Math.round(Math.pow(value, 2))
          }

          if(this[setting.name] === value) return

          this.set(setting.name, value)
          valueElem.textContent = this.getSettingListDisplayText(setting)

          if(setting.name === 'theme') {
            this.ambientlight.updateTheme()
            return
          }

          if(!this.advancedSettings) {
            if(setting.name === 'blur') {
              const edgeValue = (value <= 5 ) 
                ? 2 
                : ((value >= 42.5) 
                  ? 17 
                  : (value / 2.5)
                )

              const edgeSetting = SettingsConfig.find(setting => setting.name === 'edge')
              const edgeInputElem = this.menuElem.querySelector(`#setting-${edgeSetting.name}-range`)
              edgeInputElem.value = edgeValue
              edgeInputElem.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }

          if([
            'horizontalBarsClipPercentage',
            'verticalBarsClipPercentage',
            'videoScale'
          ].some(name => name === setting.name)) {
            if(!inputElem.dontResetControllerSetting) {
              const controllerSetting = ({
                'horizontalBarsClipPercentage': 'detectHorizontalBarSizeEnabled',
                'verticalBarsClipPercentage': 'detectVerticalBarSizeEnabled',
                'videoScale': 'detectVideoFillScaleEnabled'
              })[setting.name]
              if(this[controllerSetting]) {
                const controllerInput = this.menuElem.querySelector(`#setting-${controllerSetting}`)
                controllerInput.dontResetControlledSetting = true
                controllerInput.click()
                return
              }
            } else {
              inputElem.dontResetControllerSetting = false
            }
            this.updateVisibility()

            this.ambientlight.barDetection.clear()
            if(this.enabled && this.webGL) {
              this.ambientlight.buffersCleared = true // Force a buffer redraw because the buffer can be transferred to the bar detection worker
            }
          }

          if (
            (this.detectHorizontalBarSizeEnabled || this.detectVerticalBarSizeEnabled) &&
            setting.name === 'detectHorizontalBarSizeOffsetPercentage'
          ) {
            this.ambientlight.barDetection.clear()
            if(this.enabled && this.webGL) {
              this.ambientlight.buffersCleared = true // Force a buffer redraw because the buffer can be transferred to the bar detection worker
            }
          }

          if ([
            'headerShadowSize',
            'headerShadowOpacity',
            'headerFillOpacity',
            'headerImagesOpacity',
            'surroundingContentShadowSize',
            'surroundingContentShadowOpacity',
            'surroundingContentFillOpacity',
            'surroundingContentImagesOpacity',
            'debandingStrength',
            'videoShadowSize',
            'videoShadowOpacity',
            'videoScale'
          ].some(name => name === setting.name)) {
            this.ambientlight.updateStyles()
          }

          if ([
            'frameFading',
          ].some(name => name === setting.name)) {
            if(value > 0) {
              if(this['framerateLimit'] !== 30) {
                this.set('framerateLimit', 30, true)
              }
              if(this['frameBlending']) {
                this.set('frameBlending', false, true)
              }
            } else {
              const defaultValue = SettingsConfig.find(s => s.name === 'framerateLimit').default
              if(this['framerateLimit'] !== defaultValue) {
                this.set('framerateLimit', defaultValue, true)
              }
            }
            this.updateVisibility()
            if(this.ambientlight.projector?.initCtx) { // Can be undefined when migrating from previous settings
              try {
                if(!(await this.ambientlight.projector.initCtx())) return
                this.setWarning('')
              } catch(ex) {
                this.ambientlight.projector.setWebGLWarning('change')
                throw ex
              }
            }
          }

          if ([
            'framerateLimit',
          ].some(name => name === setting.name)) {
            if(this['frameBlending']) {
              this.set('frameBlending', false, true)
            }
            const defaultValue = SettingsConfig.find(s => s.name === 'frameFading')?.default
            if(this['frameFading'] !== defaultValue) {
              this.set('frameFading', defaultValue, true)
              if(this.ambientlight.projector?.initCtx) { // Can be undefined when migrating from previous settings
                try {
                  if(!(await this.ambientlight.projector.initCtx())) return
                  this.setWarning('')
                } catch(ex) {
                  this.ambientlight.projector.setWebGLWarning('change')
                  throw ex
                }
              }
            }
            this.updateVisibility()
          }

          if (
            setting.name === 'vibrance' || 
            setting.name === 'spread' || 
            setting.name === 'edge'
          ) {
            this.ambientlight.canvassesInvalidated = true
          }
          if(setting.name === 'vibrance') {
            try {
            if(!(await this.ambientlight.projector.updateVibrance())) return
              this.setWarning('')
            } catch(ex) {
              this.ambientlight.projector.setWebGLWarning('change')
              throw ex
            }
          }

          if([
            'headerShadowSize',
            'headerShadowOpacity',
            'surroundingContentShadowSize',
            'surroundingContentShadowOpacity',
            'videoShadowSize'
          ].some(name => name === setting.name)) {
            this.updateVisibility()
          }

          this.ambientlight.sizesChanged = true
          this.ambientlight.optionalFrame()
        })
      } else if (setting.type === 'checkbox') {
        on(settingElem, 'dblclick contextmenu click', async (e) => {
          if(setting.disabled) {
            e.stopPropagation()
            e.preventDefault()
            return
          }
          
          let value = !this[setting.name];
          if (e.type === 'dblclick' || e.type === 'contextmenu') {
            value = SettingsConfig.find(s => s.name === setting.name).default
            if(value === this[setting.name]) return
          }

          if ([
            'energySaver',
            'videoOverlayEnabled',
            'frameSync',
            'frameBlending',
            'showFPS',
            'showFrametimes',
            'showResolutions',
            'surroundingContentTextAndBtnOnly',
            'headerTransparentEnabled',
            'horizontalBarsClipPercentageReset',
            'detectHorizontalBarSizeEnabled',
            'detectColoredHorizontalBarSizeEnabled',
            'detectVerticalBarSizeEnabled',
            'detectColoredVerticalBarSizeEnabled',
            'detectVideoFillScaleEnabled',
            'directionTopEnabled',
            'directionRightEnabled',
            'directionBottomEnabled',
            'directionLeftEnabled',
            'advancedSettings',
            'hideScrollbar',
            'immersiveTheaterView',
            'webGL',
            'prioritizePageLoadSpeed'
          ].some(name => name === setting.name)) {
            this.set(setting.name, value)
            this.menuElem.querySelector(`#setting-${setting.name}`).setAttribute('aria-checked', value)
          }

          if([
            'detectHorizontalBarSizeEnabled',
            'detectVerticalBarSizeEnabled',
            'detectVideoFillScaleEnabled'
          ].some(name => name === setting.name)) {
            this.displayBezel(setting.key, !value)
            if(!settingElem.dontResetControlledSetting) {
              const controlledSettingName = ({
                'detectHorizontalBarSizeEnabled': 'horizontalBarsClipPercentage',
                'detectVerticalBarSizeEnabled': 'verticalBarsClipPercentage',
                'detectVideoFillScaleEnabled': 'videoScale'
              })[setting.name]
              const percentageSetting = SettingsConfig.find(setting => setting.name === controlledSettingName)
              const percentageInputElem = this.menuElem.querySelector(`#setting-${percentageSetting.name}-range`)
              if(percentageInputElem.value != percentageSetting.default) {
                percentageInputElem.dontResetControllerSetting = true
                percentageInputElem.value = percentageSetting.default
                percentageInputElem.dispatchEvent(new Event('change', { bubbles: true }))
                return
              }
            } else {
              settingElem.dontResetControlledSetting = false
            }
          }

          if (setting.name === 'enabled') {
            this.ambientlight.toggleEnabled(value)
          }

          if (setting.name === 'hideScrollbar' && this.enabled) {
            if(value)
              html.setAttribute('data-ambientlight-hide-scrollbar', true)
            else
              html.removeAttribute('data-ambientlight-hide-scrollbar')
            this.ambientlight.updateVideoPlayerSize()
          }

          if(setting.name === 'immersiveTheaterView' && this.enabled) {
            this.ambientlight.updateImmersiveMode()
          }
          
          if (setting.name === 'frameBlending') {
            if(value) {
              if(this['frameFading'] !== 0) {
                this.set('frameFading', 0, true)
              }
              if(this['framerateLimit'] !== 0) {
                this.set('framerateLimit', 0, true)
              }
            } else {
              const defaultValue = SettingsConfig.find(s => s.name === 'framerateLimit').default
              if(this['framerateLimit'] !== defaultValue) {
                this.set('framerateLimit', defaultValue, true)
              }
            }
            this.ambientlight.sizesChanged = true
            this.updateVisibility()
          }
          if ([
            'energySaver',
          ].includes(setting.name)) {
            if(value) {
              this.ambientlight.calculateAverageVideoFramesDifference()
            } else {
              this.ambientlight.resetAverageVideoFramesDifference()
            }
          }
          
          if ([
            'videoOverlayEnabled',
            'directionTopEnabled',
            'directionRightEnabled',
            'directionBottomEnabled',
            'directionLeftEnabled'
          ].includes(setting.name)) {
            this.updateVisibility()
            this.ambientlight.sizesChanged = true
          }

          if([
            'detectHorizontalBarSizeEnabled',
            'detectVerticalBarSizeEnabled',
            'detectColoredHorizontalBarSizeEnabled',
            'detectColoredVerticalBarSizeEnabled',
            'detectVideoFillScaleEnabled'
          ].some(name => name === setting.name)) {
            this.ambientlight.barDetection.clear()
            if(this.enabled && this.webGL) {
              this.ambientlight.buffersCleared = true // Force a buffer redraw because the buffer can be transferred to the bar detection worker
            }
            this.ambientlight.sizesChanged = true
            this.updateVisibility()
          }

          if(setting.name === 'advancedSettings') {
            if(value) {
              this.menuElem.classList.add('ytpa-ambientlight-settings-menu--advanced')
            } else {
              this.menuElem.classList.remove('ytpa-ambientlight-settings-menu--advanced')
            }
            this.updateVisibility()
          }

          if([
            'showFPS',
            'showFrametimes',
            'showResolutions'
          ].some(name => name === setting.name)) {
            if(value) {
              this.ambientlight.updateStats()
            } else {
              this.ambientlight.hideStats()
            }
            return
          }

          if([
            'surroundingContentTextAndBtnOnly'
          ].some(name => name === setting.name)) {
            this.ambientlight.updateStyles()
            this.ambientlight.optionalFrame()
            return
          }

          if(setting.name === 'webGL') {
            if(!this.webGLCrashDate || this.webGL) {
              await this.flushPendingStorageEntries()
              await new Promise(resolve => setTimeout(resolve, 1000))
              this.reloadPage()
              return
            }
          }

          this.ambientlight.sizesInvalidated = true
          this.ambientlight.optionalFrame()
        })
      }
    }

    this.updateVisibility()
    on(document, 'visibilitychange', this.handleDocumentVisibilityChange, false);
  }

  reloadPage() {
    const search = new URLSearchParams(location.search)
    const time = Math.max(0, Math.floor(this.ambientlight.videoElem?.currentTime || 0) - 2)
    time ? search.set('t', time) : search.delete('t')
    history.replaceState(null, null, `${location.pathname}?${search.toString()}`)
    location.reload()
  }

  framesToDuration(frames) {
    if(!frames) return 'Off'

    const seconds = frames / 30
    if (seconds < 1) return `${Math.round(seconds * 1000)} ms`
    return `${Math.round(seconds * 10) / 10} seconds`
  }

  getSettingListDisplayText(setting) {
    const value = this[setting.name];
    if (setting.name === 'frameSync') {
      return {
        [FRAMESYNC_DECODEDFRAMES]: 'Decoded framerate',
        [FRAMESYNC_DISPLAYFRAMES]: 'Display framerate',
        [FRAMESYNC_VIDEOFRAMES]: 'Video framerate'
      }[value]
    }
    if(setting.name === 'framerateLimit') {
      return (this.framerateLimit == 0) ? 'max fps' : `${value} fps`
    }
    if(setting.name === 'frameFading') {
      return this.framesToDuration(value)
    }
    if(setting.name === 'theme' || setting.name === 'enableInViews') {
      const snapPoint = setting.snapPoints.find(point => point.value === value)
      return snapPoint?.hiddenLabel || snapPoint?.label
    }
    return `${value}${setting.unit || '%'}`
  }

  menuOnCloseScrollBottom = -1
  menuOnCloseScrollHeight = 1
  onSettingsBtnClicked = () => {
    const isOpen = this.menuElem.classList.contains('is-visible')
    if (isOpen) return

    this.menuElem.classList.remove('fade-out')
    this.menuElem.classList.add('is-visible')

    if(this.menuOnCloseScrollBottom !== -1) {
      const percentage = (this.menuElem.scrollHeight) / this.menuOnCloseScrollHeight
      this.menuElem.scrollTop = (
        (this.menuElem.scrollHeight - this.menuElem.offsetHeight) - 
        (this.menuOnCloseScrollBottom * percentage)
      )
    }

    this.menuBtn.setAttribute('aria-expanded', true)

    if(this.ambientlight.videoPlayerElem) {
      this.ambientlight.videoPlayerElem.classList.add('ytp-ambientlight-settings-shown')
    }

    off(this.menuBtn, 'click', this.onSettingsBtnClickedListener)
    setTimeout(() => {
      on(body, 'click', this.onCloseMenu, undefined, (listener) => this.onCloseMenuListener = listener)
      this.scrollToWarning()
    }, 100)
  }

  onCloseMenu = (e) => {
    if(!this.onCloseMenuListener) return;
    if (this.menuElem === e.target || this.menuElem.contains(e.target))
      return

    e.stopPropagation()

    this.menuOnCloseScrollBottom = (!this.menuElem.scrollTop) 
      ? -1 : 
      (this.menuElem.scrollHeight - this.menuElem.offsetHeight) - this.menuElem.scrollTop
    this.menuOnCloseScrollHeight = (this.menuElem.scrollHeight)

    on(this.menuElem, 'animationend', this.onSettingsFadeOutEnd, undefined, (listener) => this.onSettingsFadeOutEndListener = listener)
    this.menuElem.classList.add('fade-out')

    this.menuBtn.setAttribute('aria-expanded', false)

    if(this.ambientlight.videoPlayerElem) {
      this.ambientlight.videoPlayerElem.classList.remove('ytp-ambientlight-settings-shown')
    }

    off(body, 'click', this.onCloseMenuListener)
    this.onCloseMenuListener = undefined
    setTimeout(() => {
      on(this.menuBtn, 'click', this.onSettingsBtnClicked, undefined, (listener) => this.onSettingsBtnClickedListener = listener)
    }, 100)
  }

  onSettingsFadeOutEnd = () => {
    this.menuElem.classList.remove('fade-out', 'is-visible')
    off(this.menuElem, 'animationend', this.onSettingsFadeOutEndListener)
  }

  
  controlledSettings = [
    {
      name: 'videoScale',
      controllers: ['detectVideoFillScaleEnabled']
    },
    {
      name: 'horizontalBarsClipPercentage',
      controllers: ['detectHorizontalBarSizeEnabled']
    },
    {
      name: 'verticalBarsClipPercentage',
      controllers: ['detectVerticalBarSizeEnabled']
    },
    {
      name: 'framerateLimit',
      controllers: ['frameBlending', 'frameFading']
    },
    {
      name: 'frameBlending',
      controllers: ['frameFading']
    },
    {
      name: 'frameFading',
      controllers: ['frameBlending']
    },
  ]
  optionalSettings = [
    {
      names: [
        'detectHorizontalBarSizeEnabled',
        'detectVerticalBarSizeEnabled'
      ],
      visible: () => this.ambientlight.getImageDataAllowed
    },
    {
      names: [
        'detectColoredHorizontalBarSizeEnabled',
        'detectHorizontalBarSizeOffsetPercentage'
      ],
      visible: () => this.ambientlight.getImageDataAllowed && (this.detectHorizontalBarSizeEnabled || this.detectVerticalBarSizeEnabled)
    },
    {
      names: [ 'frameBlendingSmoothness' ],
      visible: () => this.frameBlending
    },
    {
      names: [ 'videoOverlaySyncThreshold' ],
      visible: () => this.videoOverlayEnabled
    },
    {
      names: [ 'headerShadowOpacity' ],
      visible: () => this.headerShadowSize
    },
    {
      names: [ 'surroundingContentShadowOpacity' ],
      visible: () => this.surroundingContentShadowSize
    },
    {
      names: [ 'surroundingContentTextAndBtnOnly' ],
      visible: () => (this.surroundingContentShadowSize && this.surroundingContentShadowOpacity) || (this.headerShadowSize && this.headerShadowOpacity)
    },
    {
      names: [ 'videoShadowOpacity' ],
      visible: () => this.videoShadowSize
    },
    {
      names: [ 'resolution', 'vibrance', 'frameFading' ],
      visible: () => this.webGL
    }
  ]
  updateVisibility() {
    for(const setting of this.controlledSettings) {
      if(!SettingsConfig.find(settingConfig => settingConfig.name === setting.name)) continue // Skip removed settings

      const valueElem = this.menuElem.querySelector(`#setting-${setting.name}.ytp-menuitem, #setting-${setting.name} .ytp-menuitem`)
      const controlledByName = setting.controllers.find(name => this[name])
      const controlledByLabel = SettingsConfig.find(setting => (
        setting.name === controlledByName &&
        (this.advancedSettings || !setting.advanced)
      ))?.label
      if(controlledByLabel) {
        valueElem.classList.add('is-controlled-by-setting')
        valueElem.setAttribute('title', `Controlled by the "${controlledByLabel}" setting.\nManually adjusting this setting will turn off "${controlledByLabel}"`)
      } else {
        valueElem.classList.remove('is-controlled-by-setting')
        valueElem.setAttribute('title', '')
      }
    }

    for(const optionalGroup of this.optionalSettings) {
      const optionalSettings = optionalGroup.names.map(name => this.menuElem.querySelector(`#setting-${name}`)).filter(setting => setting)
      const visible = optionalGroup.visible()
      for (const optionalSetting of optionalSettings) {
        optionalSetting.style.display = visible ? '' : 'none'
      }
    }
  }

  setKey(name, key) {
    const setting = SettingsConfig.find(setting => setting.name === name) || {}
    const clear = (key === undefined)
    if(clear)
      key = setting.defaultKey

    setting.key = key
    this.saveStorageEntry(`${setting.name}-key`, clear ? undefined : key)
  }

  set(name, value, updateUI) {
    const clear = (value === undefined)
    if(clear)
      value = SettingsConfig.find(setting => setting.name === name)?.defaultValue

    const changed = this[name] !== value
    this[name] = value

    if (name === 'blur')
      value = Math.round((value - 30) * 10) / 10 // Prevent rounding error
    if (name === 'bloom')
      value = Math.round((value - 7) * 10) / 10 // Prevent rounding error

    if(clear || changed) {
      this.saveStorageEntry(name, clear ? undefined : value)
    }

    if (updateUI) {
      this.updateUI(name)
    }
  }

  updateUI(name) {
    const setting = SettingsConfig.find(setting => setting.name === name) || {}
    if (setting.type === 'checkbox') {
      const checkboxInput = this.menuElem.querySelector(`#setting-${name}`)
      if (checkboxInput) {
        checkboxInput.setAttribute('aria-checked', this[name] ? 'true' : 'false')
      }
    } else if (setting.type === 'list') {
      const rangeInput = this.menuElem.querySelector(`#setting-${name}-range`)
      if (rangeInput) {
        rangeInput.value = this.getInputRangeValue(name)
        rangeInput.setAttribute('data-previous-value', rangeInput.value)
        this.menuElem.querySelector(`#setting-${name}-value`).textContent = this.getSettingListDisplayText(setting)
        const manualInput = this.menuElem.querySelector(`#setting-${name}-manualinput`)
        if(manualInput) {
          manualInput.value = rangeInput.value
        }
      }
    }
  }

  getInputRangeValue(name) {
    const setting = SettingsConfig.find(setting => setting.name === name) || {}
    if(name === 'frameFading') {
      return Math.round(5 * (Math.exp(Math.log(this[name]) / 2))) / 5
    } else if(setting.valuePoints){
      return setting.valuePoints.indexOf(this[name])
    } else {
      return this[name]
    }
  }

  clickUI(name) {
    this.menuElem.querySelector(`#setting-${name}`).click()
  }

  processStorageEntry(name, value) {
    const setting = SettingsConfig.find(setting => setting.name === name) || {}
    if (value === null || value === undefined) {
      value = setting.default
    } else if (setting.type === 'checkbox' || setting.type === 'section') {
      value = (
        value === 'true' || // localStorage
        value === true // storage.local
      )
    } else if (setting.type === 'list') {
      value = parseFloat(value)
      if (name === 'blur')
        value = Math.round((value + 30) * 10) / 10 // Prevent rounding error
      if (name === 'bloom')
        value = Math.round((value + 7) * 10) / 10 // Prevent rounding error
      if(name === 'frameSync' && value >= 50) {
        value = {
          50: FRAMESYNC_DECODEDFRAMES,
          100: FRAMESYNC_DISPLAYFRAMES,
          150: FRAMESYNC_VIDEOFRAMES
        }[value]
      }
    }

    return value
  }

  pendingStorageEntries = {}
  saveStorageEntry(name, value) {
    this.pendingStorageEntries[name] = value
    if (this.saveStorageEntryTimeout)
      clearTimeout(this.saveStorageEntryTimeout)

    this.saveStorageEntryTimeout = setTimeout(function saveStorageEntryTimeout() {
      delete this.saveStorageEntryTimeout
      this.flushPendingStorageEntries()
    }.bind(this), 500)
  }

  async flushPendingStorageEntries() {
    try {
      if (this.saveStorageEntryTimeout)
        clearTimeout(this.saveStorageEntryTimeout)
      
      const names = Object.keys(this.pendingStorageEntries)
      for(const name of names) {
        await contentScript.setStorageEntry(`setting-${name}`, this.pendingStorageEntries[name], true)
        delete this.pendingStorageEntries[name]
      }
    } catch (ex) {
      if(ex.message.includes('QuotaExceededError')) {
        this.setWarning('The changes cannot be saved because the settings have changed too often.\nWait a few seconds...')
        return
      }

      if(ex.message === 'uninstalled') {
        this.setWarning('The changes cannot be saved because the extension has been updated.\nRefresh the page to continue.')
        return
      }

      if(ex.message !== 'An unexpected error occurred')
        SentryReporter.captureException(ex)

      this.logStorageWarningOnce(`Ambient light for YouTube™ | Failed to save settings ${JSON.stringify(this.pendingStorageEntries)}: ${ex.message}`)
    }
  }

  logStorageWarningOnce(...args) {
    if(this.loggedStorageWarning) return

    console.warn(...args)
    this.loggedStorageWarning = true
  }

  getKeys = () => ({
    enabled: SettingsConfig.find(setting => setting.name === 'enabled').key,
    detectHorizontalBarSizeEnabled: SettingsConfig.find(setting => setting.name === 'detectHorizontalBarSizeEnabled').key,
    detectVerticalBarSizeEnabled: SettingsConfig.find(setting => setting.name === 'detectVerticalBarSizeEnabled').key,
    detectVideoFillScaleEnabled: SettingsConfig.find(setting => setting.name === 'detectVideoFillScaleEnabled').key
  })

  displayBezelForSetting(name) {
    const key = SettingsConfig.find(setting => setting.name === name).key
    const strike = !this[name]
    this.displayBezel(key, strike)
  }

  displayBezel(text, strike = false) {
    this.bezelElem.classList.add('yta-bezel--no-animation')
    setTimeout(() => {
      this.bezelElem.classList.toggle('yta-bezel--strike', strike)
      this.bezelElem.classList.remove('yta-bezel--no-animation')
      this.bezelTextElem.textContent = text
    }, 0);
  }

  updateAverageVideoFramesDifferenceInfo = () => {
    if(!this.menuElem) return

    let message = ''
    if(this.energySaver) {
      if(this.ambientlight.averageVideoFramesDifference < .002) {
        message = 'Detected a still image as video\nThe framerate has been limited to: 0.2 fps\n\n(Disable this via: Quality > Energy saver)'
      } else if(this.ambientlight.averageVideoFramesDifference < .0175) {
        message = 'Detected only small movements in the video\nThe framerate has been limited to: 1 fps\n\n(Disable this via: Quality > Energy saver)'
      }
    }

    this.infoElem.textContent = message
    this.infoItemElem.style.display = message ? '' : 'none'
  }

  handleDocumentVisibilityChange = () => {
    const isPageHidden = document.visibilityState === 'hidden'
    if(isPageHidden) return

    setTimeout(() => {
      if(!this.pendingWarning) return
      
      this.pendingWarning()
    }, 1) // Give ambient light the time to clear existing warnings
  }

  setWarning = (message, optional = false) => {
    if(!this.menuElem || this.ambientlight.isPageHidden) {
      this.pendingWarning = () => this.setWarning(message, optional)
      return
    } else {
      this.pendingWarning = undefined
    }

    if(optional && this.warningElem.textContent.length) return
    if(this.warningElem.textContent === message) return

    this.warningItemElem.style.display = message ? '' : 'none'
    this.warningElem.textContent = message
    this.menuBtn.classList.toggle('has-warning', !!message)
    this.scrollToWarningQueued = !!message
    if(!message) return

    this.scrollToWarning()
  }

  updateHdr() {
    if(this.ambientlight.isHdr) {
      this.menuElem.classList.add('ytpa-ambientlight-settings-menu--hdr')
    } else {
      this.menuElem.classList.remove('ytpa-ambientlight-settings-menu--hdr')
    }
  }

  scrollToWarning() {
    if(!this.warningElem.textContent || !this.scrollToWarningQueued || !this.onCloseMenuListener) return
    
    this.scrollToWarningQueued = false
    this.menuElem.scrollTo({
      behavior: 'smooth',
      top: 0
    })
  }
}