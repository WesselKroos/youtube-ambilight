import { $, html, body, on, off, setTimeout } from './generic'
import AmbilightSentry from './ambilight-sentry'

export default class Settings {
  saveStorageEntryTimeout = {}

  config = [
    {
      type: 'section',
      label: 'Settings',
      name: 'sectionSettingsCollapsed',
      default: true
    },
    {
      name: 'advancedSettings',
      label: 'Advanced',
      type: 'checkbox',
      default: false
    },
    {
      type: 'section',
      label: 'Quality',
      name: 'sectionAmbilightQualityPerformanceCollapsed',
      default: true,
      advanced: false
    },
    {
      name: 'showFPS',
      label: 'Show framerate',
      type: 'checkbox',
      default: false,
      advanced: true
    },
    {
      name: 'frameSync',
      label: 'Synchronization',
      questionMark: {
        title: 'How much energy will be spent on sychronising ambient light frames with video frames.\n\nDecoded framerate: Lowest CPU & GPU usage.\nMight result in dropped and delayed frames.\n\nDetect pixel changes: Medium CPU & GPU usage.\nMight still result in delayed frames on higher than 1080p videos.\n\nDisplay framerate: Highest CPU & GPU usage.\nMight still result in delayed frames on high refreshrate monitors (120hz and higher) and higher than 1080p videos.\n\nVideo framerate: Lowest CPU & GPU usage.\nUses the newest browser technology to always keep the frames in sync.'
      },
      type: 'list',
      default: 50,
      min: 0,
      max: 100,
      step: 50,
      manualinput: false,
      advanced: false
    },
    {
      name: 'framerateLimit',
      label: 'Limit framerate (per second)',
      type: 'list',
      default: 0,
      min: 0,
      max: 60,
      step: 1,
      advanced: true
    },
    {
      name: 'resolution',
      label: 'Resolution',
      type: 'list',
      default: 384,
      min: 64,
      max: 1024,
      step: 64,
      unit: 'px',
      manualinput: false,
      advanced: true
    },
    {
      name: 'webGL',
      label: 'Use WebGL',
      description: 'Refreshes the webpage',
      type: 'checkbox',
      default: false,
      advanced: true,
      experimental: true
    },
    {
      experimental: true,
      name: 'videoOverlayEnabled',
      label: 'Sync video with ambient light',
      questionMark: {
        title: 'Delays the video frames according to the ambient light frametimes. This makes sure that that the ambient light is never out of sync with the video, but it can introduce stuttering and/or dropped frames.'
      },
      type: 'checkbox',
      default: false,
      advanced: true
    },
    {
      experimental: true,
      name: 'videoOverlaySyncThreshold',
      label: 'Sync video disable threshold',
      description: 'Disable when dropping % of frames',
      type: 'list',
      default: 5,
      min: 1,
      max: 100,
      step: 1,
      advanced: true
    },
    {
      experimental: true,
      name: 'frameBlending',
      label: 'Smooth motion (frame blending)',
      questionMark: {
        title: 'Click for more information about Frame blending',
        href: 'https://www.youtube.com/watch?v=m_wfO4fvH8M&t=81s'
      },
      description: 'More GPU usage. Works with "Sync video"',
      type: 'checkbox',
      default: false,
      advanced: true
    },
    {
      experimental: true,
      name: 'frameBlendingSmoothness',
      label: 'Smooth motion strength',
      type: 'list',
      default: 80,
      min: 0,
      max: 100,
      step: 1,
      advanced: true
    },
    {
      type: 'section',
      label: 'Page content',
      name: 'sectionOtherPageContentCollapsed',
      default: false
    },
    {
      name: 'surroundingContentTextAndBtnOnly',
      label: 'Shadow only on text and buttons',
      description: 'Decreases scroll & video stutter',
      type: 'checkbox',
      advanced: true,
      default: true
    },
    {
      name: 'surroundingContentShadowSize',
      label: 'Shadow size',
      type: 'list',
      default: 15,
      min: 0,
      max: 100,
      step: .1
    },
    {
      name: 'surroundingContentShadowOpacity',
      label: 'Shadow opacity',
      type: 'list',
      default: 30,
      min: 0,
      max: 100,
      step: .1
    },
    {
      name: 'surroundingContentImagesTransparency',
      label: 'Images transparency',
      type: 'list',
      default: 0,
      min: 0,
      max: 100,
      step: 1,
      advanced: true
    },
    {
      name: 'immersive',
      label: 'Hide when scrolled to top',
      type: 'checkbox',
      default: false,
      defaultKey: 'Z'
    },
    {
      name: 'immersiveTheaterView',
      label: 'Hide in theater mode',
      type: 'checkbox',
      default: false
    },
    {
      name: 'hideScrollbar',
      label: 'Hide scrollbar',
      type: 'checkbox',
      default: false
    },
    {
      type: 'section',
      label: 'Video',
      name: 'sectionVideoResizingCollapsed',
      default: true
    },
    {
      name: 'videoScale',
      label: 'Size',
      type: 'list',
      default: 100,
      min: 25,
      max: 200,
      step: 0.1
    },
    {
      name: 'videoShadowSize',
      label: 'Shadow size',
      type: 'list',
      default: 0,
      min: 0,
      max: 100,
      step: .1
    },
    {
      name: 'videoShadowOpacity',
      label: 'Shadow opacity',
      type: 'list',
      default: 50,
      min: 0,
      max: 100,
      step: .1
    },
    {
      type: 'section',
      label: 'Black bars',
      name: 'sectionHorizontalBarsCollapsed',
      default: true
    },
    {
      name: 'detectHorizontalBarSizeEnabled',
      label: 'Remove black bars',
      description: 'More CPU usage',
      type: 'checkbox',
      default: false,
      defaultKey: 'B'
    },
    {
      name: 'detectColoredHorizontalBarSizeEnabled',
      label: 'Also remove colored bars',
      type: 'checkbox',
      default: false
    },
    {
      name: 'detectHorizontalBarSizeOffsetPercentage',
      label: 'Black bar detection offset',
      type: 'list',
      default: 0,
      min: -5,
      max: 5,
      step: 0.1,
      advanced: true
    },
    {
      name: 'horizontalBarsClipPercentage',
      label: 'Black bars size',
      type: 'list',
      default: 0,
      min: 0,
      max: 40,
      step: 0.1,
      snapPoints: [
        { value:  8.7, label:  8 },
        { value: 12.3, label: 12, flip: true },
        { value: 13.5, label: 13 }
      ],
      advanced: true
    },
    {
      name: 'horizontalBarsClipPercentageReset',
      label: 'Reset black bars next video',
      type: 'checkbox',
      default: true,
      advanced: true
    },
    {
      name: 'detectVideoFillScaleEnabled',
      label: 'Fill video to screen width',
      type: 'checkbox',
      default: false,
      defaultKey: 'W'
    },
    {
      type: 'section',
      label: 'Filters',
      name: 'sectionAmbilightImageAdjustmentCollapsed',
      default: false,
      advanced: true
    },
    {
      name: 'brightness',
      label: 'Brightness',
      type: 'list',
      default: 100,
      min: 0,
      max: 200,
      advanced: true
    },
    {
      name: 'contrast',
      label: 'Contrast',
      type: 'list',
      default: 100,
      min: 0,
      max: 200,
      advanced: true
    },
    {
      name: 'saturation',
      label: 'Saturation',
      type: 'list',
      default: 100,
      min: 0,
      max: 200,
      advanced: true
    },
    {
      type: 'section',
      label: 'Directions',
      name: 'sectionDirectionsCollapsed',
      default: true,
      advanced: true
    },
    {
      name: 'directionTopEnabled',
      label: 'Top',
      type: 'checkbox',
      default: true,
      advanced: true
    },
    {
      name: 'directionRightEnabled',
      label: 'Right',
      type: 'checkbox',
      default: true,
      advanced: true
    },
    {
      name: 'directionBottomEnabled',
      label: 'Bottom',
      type: 'checkbox',
      default: true,
      advanced: true
    },
    {
      name: 'directionLeftEnabled',
      label: 'Left',
      type: 'checkbox',
      default: true,
      advanced: true
    },
    {
      type: 'section',
      label: 'Ambient light',
      name: 'sectionAmbilightCollapsed',
      default: false
    },
    {
      name: 'blur',
      label: 'Blur',
      description: 'More GPU memory',
      type: 'list',
      default: 30,
      min: 0,
      max: 100,
      step: .1
    },
    {
      name: 'spread',
      label: 'Spread',
      description: 'More GPU usage',
      type: 'list',
      default: 17,
      min: 0,
      max: 200,
      step: .1
    },
    {
      name: 'edge',
      label: 'Edge size',
      description: 'Less GPU usage. Tip: Turn blur down',
      type: 'list',
      default: 12,
      min: 2,
      max: 50,
      step: .1,
      advanced: true
    },
    {
      name: 'bloom',
      label: 'Fade out start',
      type: 'list',
      default: 15,
      min: -50,
      max: 100,
      step: .1,
      advanced: true
    },
    {
      name: 'fadeOutEasing',
      label: 'Fade out curve',
      description: 'Tip: Turn blur all the way down',
      type: 'list',
      default: 35,
      min: 1,
      max: 100,
      step: 1,
      advanced: true
    },
    {
      name: 'debandingStrength',
      label: 'Debanding (noise)',
      questionMark: {
        title: 'Click for more information about Dithering',
        href: 'https://www.lifewire.com/what-is-dithering-4686105'
      },
      type: 'list',
      default: 0,
      min: 0,
      max: 100,
      advanced: true
    },
    {
      type: 'section',
      label: 'General',
      name: 'sectionGeneralCollapsed',
      default: false
    },
    {
      name: 'theme',
      label: 'Appearance (theme)',
      type: 'list',
      manualinput: false,
      default: 1,
      min: -1,
      max: 1,
      step: 1,
      snapPoints: [
        { value: -1, label: 'Light'   },
        { value:  0, label: 'Default' },
        { value:  1, label: 'Dark'    },
      ]
    },
    {
      name: 'enableInFullscreen',
      label: 'Keep enabled in fullscreen',
      type: 'checkbox',
      default: true,
      advanced: true
    },
    {
      name: 'enabled',
      label: 'Enabled',
      type: 'checkbox',
      default: true,
      defaultKey: 'A'
    },
  ]

  constructor(ambilight, menuBtnParent, menuElemParent) {
    this.ambilight = ambilight
    this.menuBtnParent = menuBtnParent
    this.menuElemParent = menuElemParent

    this.config = this.config.map(setting => {
      if(this.ambilight.videoHasRequestVideoFrameCallback) {
        if(setting.name === 'frameSync') {
          setting.max = 150
          setting.default = 150
          setting.advanced = true // Change this in the future when frameSync 150 is released and validated to work
        }

        if(setting.name === 'sectionAmbilightQualityPerformanceCollapsed') {
          setting.advanced = true
        }
      }
      return setting
    }).filter(setting => setting)

    this.getAll()
    this.initMenu()
  }
  
  getAll() {
    for (const setting of this.config) {
      this[setting.name] = this.get(setting.name)
      if(setting.defaultKey !== undefined) {
        const key = this.getKey(setting.name)
        setting.key = (key !== null) ? key : setting.defaultKey
      }
    }

    html.setAttribute('data-ambilight-hide-scrollbar', this.hideScrollbar)
  }
  
  initMenu() {
    this.menuBtn = document.createElement('button')
    this.menuBtn.classList.add('ytp-button', 'ytp-ambilight-settings-button')
    this.menuBtn.setAttribute('aria-owns', 'ytp-id-190')
    on(this.menuBtn, 'click', this.onSettingsBtnClicked, undefined, (listener) => this.onSettingsBtnClickedListener = listener)
    this.menuBtn.innerHTML = `<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
      <path d="m 23.94,18.78 c .03,-0.25 .05,-0.51 .05,-0.78 0,-0.27 -0.02,-0.52 -0.05,-0.78 l 1.68,-1.32 c .15,-0.12 .19,-0.33 .09,-0.51 l -1.6,-2.76 c -0.09,-0.17 -0.31,-0.24 -0.48,-0.17 l -1.99,.8 c -0.41,-0.32 -0.86,-0.58 -1.35,-0.78 l -0.30,-2.12 c -0.02,-0.19 -0.19,-0.33 -0.39,-0.33 l -3.2,0 c -0.2,0 -0.36,.14 -0.39,.33 l -0.30,2.12 c -0.48,.2 -0.93,.47 -1.35,.78 l -1.99,-0.8 c -0.18,-0.07 -0.39,0 -0.48,.17 l -1.6,2.76 c -0.10,.17 -0.05,.39 .09,.51 l 1.68,1.32 c -0.03,.25 -0.05,.52 -0.05,.78 0,.26 .02,.52 .05,.78 l -1.68,1.32 c -0.15,.12 -0.19,.33 -0.09,.51 l 1.6,2.76 c .09,.17 .31,.24 .48,.17 l 1.99,-0.8 c .41,.32 .86,.58 1.35,.78 l .30,2.12 c .02,.19 .19,.33 .39,.33 l 3.2,0 c .2,0 .36,-0.14 .39,-0.33 l .30,-2.12 c .48,-0.2 .93,-0.47 1.35,-0.78 l 1.99,.8 c .18,.07 .39,0 .48,-0.17 l 1.6,-2.76 c .09,-0.17 .05,-0.39 -0.09,-0.51 l -1.68,-1.32 0,0 z m -5.94,2.01 c -1.54,0 -2.8,-1.25 -2.8,-2.8 0,-1.54 1.25,-2.8 2.8,-2.8 1.54,0 2.8,1.25 2.8,2.8 0,1.54 -1.25,2.8 -2.8,2.8 l 0,0 z" fill="#fff"></path>
    </svg>`

    const settingsMenuBtnTooltip = document.createElement('div')
    settingsMenuBtnTooltip.classList.add('ytp-tooltip', 'ytp-bottom', 'ytp-ambilight-settings-button-tooltip')
    settingsMenuBtnTooltip.setAttribute('aria-live', 'polite')
    const settingsMenuBtnTooltipTextWrapper = document.createElement('div')
    settingsMenuBtnTooltipTextWrapper.classList.add('ytp-tooltip-text-wrapper')
    settingsMenuBtnTooltip.prepend(settingsMenuBtnTooltipTextWrapper)
    const settingsMenuBtnTooltipText = document.createElement('span')
    settingsMenuBtnTooltipText.classList.add('ytp-tooltip-text', 'ytp-tooltip-text-no-title')
    settingsMenuBtnTooltipText.textContent = 'Ambient light settings'
    settingsMenuBtnTooltipTextWrapper.prepend(settingsMenuBtnTooltipText)

    this.menuBtn.prepend(settingsMenuBtnTooltip)
    const ytSettingsBtn = this.menuBtnParent.querySelector('[data-tooltip-target-id="ytp-autonav-toggle-button"]')
    if (ytSettingsBtn) {
      this.menuBtnParent.insertBefore(this.menuBtn, ytSettingsBtn)
    } else {
      this.menuBtnParent.prepend(this.menuBtn)
    }

    this.menuElem = document.createElement('div')
    this.menuElem.classList.add(
      ...([
        'ytp-popup', 
        'ytp-settings-menu', 
        'ytpa-ambilight-settings-menu', 
        (this.advancedSettings) ? 'ytpa-ambilight-settings-menu--advanced' : undefined
      ].filter(c => c))
    )
    this.menuElem.setAttribute('id', 'ytp-id-190')
    this.menuElem.innerHTML = `
      <div class="ytp-panel">
        <div class="ytp-panel-menu" role="menu">
          <div class="ytp-menuitem ytpa-menuitem--header">
            <div class="ytp-menuitem-label">
              <a class="ytpa-feedback-link" rowspan="2" href="${this.feedbackFormLink}" target="_blank">
                <span class="ytpa-feedback-link__text">Give feedback or rate Ambient light for YouTube™</span>
              </a>
            </div>
            <div class="ytp-menuitem-content">
              <button
                class="ytpa-reset-settings-btn"
                title="Reset all settings"
              ></button>
            </div>
          </div>
          ${
      this.config.map(setting => {
        let classes = 'ytp-menuitem'
        if(setting.advanced) classes += ' ytpa-menuitem--advanced'
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
            tabindex="0"
            title="Right click to reset">
              <div class="ytp-menuitem-label">${label}</div>
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
                  min="${setting.min}" 
                  max="${setting.max}" 
                  colspan="2" 
                  value="${value}" 
                  step="${setting.step || 1}" />
              </div>
              ${!setting.snapPoints ? '' : `
                <datalist class="setting-range-datalist" id="snap-points-${setting.name}">
                  ${setting.snapPoints.map(({ label, value, flip }, i) => {
                    return `
                      <option 
                        class="setting-range-datalist__label ${flip ? 'setting-range-datalist__label--flip' : ''}" 
                        value="${value}" 
                        label="${label}" 
                        title="Snap to ${label}" 
                        style="margin-left: ${(value + (-setting.min)) * (100 / (setting.max - setting.min))}%">
                        ${label}
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
              class="ytpa-section ${value ? 'is-collapsed' : ''} ${setting.advanced ? 'ytpa-section--advanced' : ''}" 
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

    const resetSettingsBtnElem = this.menuElem.querySelector('.ytpa-reset-settings-btn')
    on(resetSettingsBtnElem, 'click', () => {
      if(!confirm('Are you sure you want to reset ALL the settings?')) return
      
      // Reset values
      for (const input of this.menuElem.querySelectorAll('[role="menuitemcheckbox"], input[type="range"]')) {
        input.dispatchEvent(new Event('contextmenu'))
      }

      // Reset keys
      for (const setting of this.config.filter(setting => setting.key)) {
          // this.setKey(setting.name, setting.key)
          const keyElem = $.s(`#setting-${setting.name}`).querySelector('.ytpa-menuitem-key')
          keyElem.dispatchEvent(new KeyboardEvent('keypress', {
            key: setting.defaultKey
          }))
        }
    })
    for (const label of this.menuElem.querySelectorAll('.setting-range-datalist__label')) {
      on(label, 'click', (e) => {
        const value = e.target.value
        const name = e.target.parentNode.id.replace('snap-points-', '')
        const inputElem = $.s(`#setting-${name}-range`)
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
    try {
      this.menuElem.scrollTop = this.menuElem.scrollHeight
      this.menuOnCloseScrollBottom = (!this.menuElem.scrollTop) 
        ? -1 
        : (this.menuElem.scrollHeight - this.menuElem.offsetHeight) - this.menuElem.scrollTop
      this.menuOnCloseScrollHeight = (this.menuElem.scrollHeight - this.menuElem.offsetHeight)
    } catch(ex) {
      console.error('Ambient light for YouTube™ | initSettingsMenuScrollInformation', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }

    this.bezelElem = document.createElement('div')
    this.bezelElem.classList.add('yta-bezel', 'ytp-bezel')
    this.bezelElem.setAttribute('role', 'status')
    this.bezelElem.innerHTML = `
      <div class="ytp-bezel-icon">
        <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
          <text class="ytp-svg-fill" x="50%" y="59%" dominant-baseline="middle" text-anchor="middle"></text>
        </svg>
      </div>`
    on(this.bezelElem, 'animationend', () => {
      this.bezelElem.style.display = 'none'
    })
    this.bezelTextElem = this.bezelElem.querySelector('text')
    this.menuElemParent.prepend(this.bezelElem)

    for (const setting of this.config) {
      const settingElem = $.s(`#setting-${setting.name}`)
      if (!settingElem) continue
      
      const keyElem = settingElem.querySelector('.ytpa-menuitem-key')
      if (keyElem) {
        const settingElem = $.s(`#setting-${setting.name}`)
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
        })
        on(keyElem, 'keypress', (e) => {
          if(e.key.length === 1) {
            const key = e.key?.toUpperCase()
            this.setKey(setting.name, key)
            keyElem.textContent = key
          } else {
            keyElem.textContent = setting.defaultKey
          }

          keyElem.blur()
        })
        on(keyElem, 'blur', (e) => {
          // Deselect all
          const sel = window.getSelection()
          sel.removeAllRanges()
        })
      }

      if (setting.type === 'list') {
        const inputElem = $.s(`#setting-${setting.name}-range`)
        const valueElem = $.s(`#setting-${setting.name}-value`)

        const manualInputElem = $.s(`#setting-${setting.name}-manualinput`)
        if(manualInputElem) {
          on(manualInputElem, 'keydown keyup keypress', (e) => {
            e.stopPropagation()
          })
          const onChange = (empty = false) => {
            const manualValue = manualInputElem.value
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

        on(inputElem, 'change mousemove dblclick contextmenu touchmove', (e) => {
          if(e.type === 'mousemove' && e.buttons === 0) return

          let value = parseFloat(inputElem.value)
          if (e.type === 'dblclick' || e.type === 'contextmenu') {
            value = this.config.find(s => s.name === setting.name).default
          } else if (inputElem.value === inputElem.getAttribute('data-previous-value')) {
            return
          }
          inputElem.value = value
          inputElem.setAttribute('data-previous-value', value)
          if (manualInputElem) {
            manualInputElem.value = inputElem.value
          }
          this.set(setting.name, value)
          valueElem.textContent = this.getSettingListDisplayText({...setting, value})

          if(setting.name === 'theme') {
            this.ambilight.updateTheme()
            return
          }

          if(!this.advancedSettings) {
            if(setting.name === 'blur') {
              const edgeSetting = this.config.find(setting => setting.name === 'edge')
              const edgeValue = (value <= 5 ) ? 2 : ((value >= 42.5) ? 17 : (
                value/2.5
              ))

              const edgeInputElem = $.s(`#setting-${edgeSetting.name}-range`)
              edgeInputElem.value = edgeValue
              edgeInputElem.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }

          if(
            setting.name === 'horizontalBarsClipPercentage' &&
            this.detectHorizontalBarSizeEnabled
          ) {
            const controllerInput = $.s(`#setting-detectHorizontalBarSizeEnabled`)
            controllerInput.dontResetControlledSetting = true
            controllerInput.click()
          }

          if(setting.name === 'videoScale') {
            if(this.detectVideoFillScaleEnabled) {
              const controllerInput = $.s(`#setting-detectVideoFillScaleEnabled`)
              controllerInput.dontResetControlledSetting = true
              controllerInput.click()
            }
          }

          if (
            setting.name === 'surroundingContentShadowSize' ||
            setting.name === 'surroundingContentShadowOpacity' ||
            setting.name === 'surroundingContentImagesTransparency' ||
            setting.name === 'debandingStrength' ||
            setting.name === 'videoShadowSize' ||
            setting.name === 'videoShadowOpacity' ||
            setting.name === 'videoScale'
          ) {
            this.ambilight.updateStyles()
          }

          if (
            this.detectHorizontalBarSizeEnabled &&
            setting.name === 'detectHorizontalBarSizeOffsetPercentage'
          ) {
            this.ambilight.horizontalBarDetection.clear()
            this.ambilight.scheduleHorizontalBarSizeDetection()
          }

          if (
            setting.name === 'spread' || 
            setting.name === 'edge'
          ) {
            this.ambilight.canvassesInvalidated = true
          }

          this.ambilight.buffersCleared = true
          this.ambilight.sizesInvalidated = true
          this.ambilight.optionalFrame()
        })
      } else if (setting.type === 'checkbox') {
        on(settingElem, 'dblclick contextmenu click', (e) => {
          this[setting.name] = !this[setting.name]
          if (e.type === 'dblclick' || e.type === 'contextmenu') {
            this[setting.name] = this.config.find(s => s.name === setting.name).default
          }
          const value = this[setting.name];

          if (setting.name === 'enabled') {
            this.ambilight.toggleEnabled(value)
          }
          if (setting.name === 'immersive') {
            this.ambilight.toggleImmersiveMode(value)
          }
          if (setting.name === 'hideScrollbar') {
            html.setAttribute('data-ambilight-hide-scrollbar', value)
          }
          if (
            setting.name === 'videoOverlayEnabled' ||
            setting.name === 'frameSync' ||
            setting.name === 'frameBlending' ||
            setting.name === 'enableInFullscreen' ||
            setting.name === 'showFPS' ||
            setting.name === 'surroundingContentTextAndBtnOnly' ||
            setting.name === 'horizontalBarsClipPercentageReset' ||
            setting.name === 'detectHorizontalBarSizeEnabled' ||
            setting.name === 'detectColoredHorizontalBarSizeEnabled' ||
            setting.name === 'detectVideoFillScaleEnabled' ||
            setting.name === 'directionTopEnabled' ||
            setting.name === 'directionRightEnabled' ||
            setting.name === 'directionBottomEnabled' ||
            setting.name === 'directionLeftEnabled' ||
            setting.name === 'advancedSettings' ||
            setting.name === 'hideScrollbar' ||
            setting.name === 'immersiveTheaterView' ||
            setting.name === 'webGL'
          ) {
            this.set(setting.name, value)
            $.s(`#setting-${setting.name}`).setAttribute('aria-checked', value)
          }

          if(setting.name === 'immersiveTheaterView') {
            this.ambilight.updateImmersiveMode()
          }

          if(setting.name === 'detectHorizontalBarSizeEnabled') {
            if(!value) {
              if(!settingElem.dontResetControlledSetting) {
                const horizontalBarsClipPercentageSetting = this.config.find(setting => setting.name === 'horizontalBarsClipPercentage')
                const horizontalBarsClipPercentageInputElem = $.s(`#setting-${horizontalBarsClipPercentageSetting.name}-range`)
                horizontalBarsClipPercentageInputElem.value = horizontalBarsClipPercentageSetting.default
                horizontalBarsClipPercentageInputElem.dispatchEvent(new Event('change', { bubbles: true }))
              }
            } else {
              this.ambilight.horizontalBarDetection.clear()
              this.ambilight.scheduleHorizontalBarSizeDetection()
            }
            if(settingElem.dontResetControlledSetting) {
              settingElem.dontResetControlledSetting = false
            }
            this.updateControlledSettings()

            const key = this.config.find(setting => setting.name === 'detectHorizontalBarSizeEnabled').key
            this.displayBezel(key, !value)
            this.ambilight.optionalFrame()
            return
          }

          if(setting.name === 'detectVideoFillScaleEnabled') {
            if(!value) {
              if(!settingElem.dontResetControlledSetting) {
                const videoScaleSetting = this.config.find(setting => setting.name === 'videoScale')
                const videoScaleInputElem = $.s(`#setting-${videoScaleSetting.name}-range`)
                videoScaleInputElem.value = videoScaleSetting.default
                videoScaleInputElem.dispatchEvent(new Event('change', { bubbles: true }))
              }
            }
            if(settingElem.dontResetControlledSetting) {
              settingElem.dontResetControlledSetting = false
            }
            this.updateControlledSettings()

            const key = this.config.find(setting => setting.name === 'detectVideoFillScaleEnabled').key
            this.displayBezel(key, !value)
          }

          if(setting.name === 'advancedSettings') {
            if(value) {
              this.menuElem.classList.add('ytpa-ambilight-settings-menu--advanced')
            } else {
              this.menuElem.classList.remove('ytpa-ambilight-settings-menu--advanced')
            }
          }

          if (setting.name === 'showFPS') {
            if(value) {
              this.ambilight.updateStats()
            } else {
              this.ambilight.hideStats()
            }
            return
          }

          if(setting.name === 'surroundingContentTextAndBtnOnly') {
            this.ambilight.updateStyles()
            return
          }

          if(setting.name === 'webGL') {
            this.flushPendingStorageEntries()

            const search = new URLSearchParams(location.search)
            const time = Math.max(0, Math.floor(this.ambilight.videoElem?.currentTime || 0) - 2)
            time ? search.set('t', time) : search.delete('t')
            history.replaceState(null, null, `${location.pathname}?${search.toString()}`)
            location.reload()
            return
          }

          this.ambilight.updateSizes()
          this.ambilight.optionalFrame()
        })
      }
    }

    this.updateControlledSettings()
  }

  getSettingListDisplayText(setting) {
    const value = this[setting.name];
    if (setting.name === 'frameSync') {
      if (value == 0)
        return 'Decoded framerate'
      if (value == 50)
        return 'Detect pixel changes'
      if (value == 100)
        return 'Display framerate'
      if (value == 150)
        return 'Video framerate'
    }
    if(setting.name === 'framerateLimit') {
      return (this.framerateLimit == 0) ? 'max fps' : `${value} fps`
    }
    if(setting.name === 'theme') {
      return setting.snapPoints.find(point => point.value === value)?.label
    }
    return `${value}${setting.unit || '%'}`
  }

  settingsMenuOnCloseScrollBottom = 0
  settingsMenuOnCloseScrollHeight = 0
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

    if(this.ambilight.videoPlayerElem) {
      this.ambilight.videoPlayerElem.classList.add('ytp-ambilight-settings-shown')
    }

    off(this.menuBtn, 'click', this.onSettingsBtnClickedListener)
    setTimeout(() => {
      on(body, 'click', this.onCloseMenu, undefined, (listener) => this.onCloseMenuListener = listener)
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

    if(this.ambilight.videoPlayerElem) {
      this.ambilight.videoPlayerElem.classList.remove('ytp-ambilight-settings-shown')
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

  updateControlledSettings() {
    const videoScaleValue = $.s(`#setting-videoScale-value`)
    if(!this.detectVideoFillScaleEnabled) {
      videoScaleValue.classList.remove('is-controlled-by-setting')
      videoScaleValue.setAttribute('title', '')
    } else {
      videoScaleValue.classList.add('is-controlled-by-setting')
      videoScaleValue.setAttribute('title', 'Controlled by the "Fill video to screen width" setting.\nManually adjusting this setting will turn off "Fill video to screen width"')
    }

    const horizontalBarsClipPercentageValue = $.s(`#setting-horizontalBarsClipPercentage-value`)
    if(!this.detectHorizontalBarSizeEnabled) {
      horizontalBarsClipPercentageValue.classList.remove('is-controlled-by-setting')
      horizontalBarsClipPercentageValue.setAttribute('title', '')
    } else {
      horizontalBarsClipPercentageValue.classList.add('is-controlled-by-setting')
      horizontalBarsClipPercentageValue.setAttribute('title', 'Controlled by the "Remove black bars" setting.\nManually adjusting this setting will turn off "Remove black bars"')
    }
  }

  setKey(name, key) {
    const setting = this.config.find(setting => setting.name === name) || {}
    setting.key = key
    this.saveStorageEntry(`${setting.name}-key`, key)
  }

  getKey(name) {
    return this.getStorageEntry(`${name}-key`)
  }

  set(name, value, updateUI) {
    this[name] = value

    if (name === 'blur')
      value = Math.round((value - 30) * 10) / 10 // Prevent rounding error
    if (name === 'bloom')
      value = Math.round((value - 7) * 10) / 10 // Prevent rounding error

    this.saveStorageEntry(name, value)

    if (updateUI) {
      this.updateUI(name)
    }
  }

  updateUI(name) {
    const setting = this.config.find(setting => setting.name === name) || {}
    if (setting.type === 'checkbox') {
      const checkboxInput = $.s(`#setting-${name}`)
      if (checkboxInput) {
        checkboxInput.setAttribute('aria-checked', this[name] ? 'true' : 'false')
      }
    } else if (setting.type === 'list') {
      const rangeInput = $.s(`#setting-${name}-range`)
      if (rangeInput) {
        rangeInput.value = this[name]
        rangeInput.setAttribute('data-previous-value', rangeInput.value)
        $.s(`#setting-${name}-value`).textContent = `${rangeInput.value}%`
        $.s(`#setting-${name}-manualinput`).value = rangeInput.value
      }
    }
  }

  clickUI(name) {
    $.s(`#setting-${name}`).click()
  }

  get(name) {
    let value = this.getStorageEntry(name)
    const setting = this.config.find(setting => setting.name === name) || {}
    if (value === null) {
      value = setting.default
    } else if (setting.type === 'checkbox' || setting.type === 'section') {
      value = (value === 'true')
    } else if (setting.type === 'list') {
      value = parseFloat(value)
      if (name === 'blur')
        value = Math.round((value + 30) * 10) / 10 // Prevent rounding error
      if (name === 'bloom')
        value = Math.round((value + 7) * 10) / 10 // Prevent rounding error
    }

    return value
  }

  getStorageEntry(name) {
    let value = null
    try {
      value = localStorage.getItem(`ambilight-${name}`)
    } catch (ex) {
      console.warn('Ambient light for YouTube™ | getSetting', ex)
      //AmbilightSentry.captureExceptionWithDetails(ex)
    }
    return value
  }

  saveStorageEntry(name, value) {
    if (this.saveStorageEntryTimeout[name])
      clearTimeout(this.saveStorageEntryTimeout[name])

    this.saveStorageEntryTimeout[name] = setTimeout(() => {
      try {
        localStorage.setItem(`ambilight-${name}`, value)
      } catch (ex) {
        console.warn('Ambient light for YouTube™ | saveStorageEntry', ex)
        //AmbilightSentry.captureExceptionWithDetails(ex)
      }
      delete this.saveStorageEntryTimeout[name]
    }, 500)
  }

  removeStorageEntry(name) {
    try {
      localStorage.removeItem(`ambilight-${name}`)
    } catch (ex) {
      console.warn('Ambient light for YouTube™ | removeStorageEntry', ex)
      //AmbilightSentry.captureExceptionWithDetails(ex)
    }
  }

  flushPendingStorageEntries() {
    const pendingNames = Object.keys(this.saveStorageEntryTimeout)
    for(const name of pendingNames) {
      localStorage.setItem(`ambilight-${name}`, this[name])

      clearTimeout(this.saveStorageEntryTimeout[name])
      delete this.saveStorageEntryTimeout[name]
    }
  }

  getKeys = () => ({
    immersive: this.config.find(setting => setting.name === 'immersive').key,
    enabled: this.config.find(setting => setting.name === 'enabled').key,
    detectHorizontalBarSizeEnabled: this.config.find(setting => setting.name === 'detectHorizontalBarSizeEnabled').key,
    detectVideoFillScaleEnabled: this.config.find(setting => setting.name === 'detectVideoFillScaleEnabled').key
  })

  displayBezelForSetting(name) {
    const key = this.config.find(setting => setting.name === name).key
    const strike = !this[name]
    this.displayBezel(key, strike)
  }

  displayBezel(text, strike = false) {
    this.bezelElem.style.display = 'none'
    setTimeout(() => {
      this.bezelElem.classList.toggle('yta-bezel--strike', strike)
      this.bezelElem.style.display = ''
      this.bezelTextElem.textContent = text
    }, 0);
  }

  setGetImageDataAllowedVisibility = (allowed) => {
    const settings = [
      $.s(`#setting-detectHorizontalBarSizeEnabled`),
      $.s(`#setting-detectColoredHorizontalBarSizeEnabled`),
      $.s(`#setting-detectHorizontalBarSizeOffsetPercentage`)
    ].filter(setting => setting)
    if(allowed) {
      for (const setting of settings) {
        setting.style.display = ''
      }
    } else {
      for (const setting of settings) {
        setting.style.display = 'none'
      }
    }
  }
}