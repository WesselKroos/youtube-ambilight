import { $, html, body, on, off, setTimeout, supportsWebGL } from './generic'
import AmbilightSentry from './ambilight-sentry'
import { contentScript } from './messaging'
import { getBrowser } from './utils'

export const FRAMESYNC_DECODEDFRAMES = 0
export const FRAMESYNC_DISPLAYFRAMES = 1
export const FRAMESYNC_VIDEOFRAMES = 2

const feedbackFormLink = document.currentScript.getAttribute('data-feedback-form-link') || 'https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform'

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
        title: 'How much energy will be spent on sychronising ambient light frames with video frames.\n\nDecoded framerate: Lowest CPU & GPU usage.\nMight result in dropped and delayed frames.\n\nDisplay framerate: Highest CPU & GPU usage.\nMight still result in delayed frames on high refreshrate monitors (120hz and higher) and higher than 1080p videos.\n\nVideo framerate: Lowest CPU & GPU usage.\nUses the newest browser technology to always keep the frames in sync.'
      },
      type: 'list',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
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
      advanced: false
    },
    {
      name: 'webGL',
      label: 'WebGL renderer (uses less power)',
      description: 'Has the most impact on laptops',
      type: 'checkbox',
      default: false,
      experimental: true,
      advanced: false
    },
    {
      name: 'resolution',
      label: 'WebGL resolution',
      type: 'list',
      default: 100,
      unit: '%',
      valuePoints: (() => {
        const points = [6.25];
        while(points[points.length - 1] < 400) {
          points.push(points[points.length - 1] * 2);
        }
        return points;
      })(),
      manualinput: false,
      advanced: false,
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
      name: 'immersiveTheaterView',
      label: 'Hide in theater mode',
      type: 'checkbox',
      default: false
    },
    {
      name: 'immersive',
      label: 'Hide when scrolled to top',
      type: 'checkbox',
      default: false,
      defaultKey: 'Z',
      advanced: true
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
      name: 'detectVerticalBarSizeEnabled',
      label: 'Remove black sidebars',
      description: 'More CPU usage',
      type: 'checkbox',
      default: false,
      defaultKey: 'V'
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
      name: 'verticalBarsClipPercentage',
      label: 'Black sidebars size',
      type: 'list',
      default: 0,
      min: 0,
      max: 40,
      step: 0.1,
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
      label: 'Fill video to screen',
      type: 'checkbox',
      default: false,
      defaultKey: 'S'
    },
    {
      type: 'section',
      label: 'Filters',
      name: 'sectionAmbilightImageAdjustmentCollapsed',
      default: true,
      advanced: true
    },
    {
      name: 'brightness',
      label: 'Brightness',
      type: 'list',
      default: 100,
      min: 0,
      max: 200,
      step: 1,
      advanced: true
    },
    {
      name: 'contrast',
      label: 'Contrast',
      type: 'list',
      default: 100,
      min: 0,
      max: 200,
      step: 1,
      advanced: true
    },
    {
      name: 'saturation',
      label: 'Saturation',
      type: 'list',
      default: 100,
      min: 0,
      max: 200,
      step: 1,
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
      step: 1,
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
      name: 'enableInViews',
      label: 'View mode(s)',
      type: 'list',
      manualinput: false,
      default: 0,
      min: 0,
      max: 5,
      step: 1,
      snapPoints: [
        { value:  0, label: 'All' },
        { value:  1, label: 'Small' },
        { value:  2, hiddenLabel: 'Small & Theater' },
        { value:  3, label: 'Theater' },
        { value:  4, hiddenLabel: 'Theater & Fullscreen' },
        { value:  5, label: 'Fullscreen' },
      ]
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
    return (async () => {
      this.ambilight = ambilight
      this.menuBtnParent = menuBtnParent
      this.menuElemParent = menuElemParent

      this.config = this.config.map(setting => {
        if(setting.name === 'webGL' && getBrowser() === 'Firefox') {
          setting.default = true
        }
        if(setting.name === 'resolution' && getBrowser() === 'Firefox') {
          setting.default = 25
        }
        if(setting.name === 'frameSync' && this.ambilight.videoHasRequestVideoFrameCallback) {
          setting.max = 2
          setting.default = 2
          setting.advanced = true
        }
        if(setting.name === 'sectionAmbilightQualityPerformanceCollapsed' && this.ambilight.videoHasRequestVideoFrameCallback && !supportsWebGL()) {
          setting.advanced = true
        }
        return setting
      })

      await this.getAll()
      await this.initWebGLExperiment()

      this.config = this.config.map(setting => {
        if(setting.name === 'webGL' && !supportsWebGL()) {
          this.webGL = undefined
          return undefined
        }
        if(setting.name === 'resolution' && !this.webGL) {
          this.resolution = undefined
          return undefined
        }
        return setting
      }).filter(setting => setting)

      try {
        const enableInFullscreen = await contentScript.getStorageEntryOrEntries('setting-enableInFullscreen')
        if(enableInFullscreen === false) {
          this.enableInViews = 2
          this.saveStorageEntry('enableInViews', 2)
          this.saveStorageEntry('enableInFullscreen', null)
        }
      } catch(ex) {
        AmbilightSentry.captureExceptionWithDetails(ex)
      }

      this.initMenu()

      if(this.pendingWarning) {
        this.pendingWarning()
        this.pendingWarning = undefined
      }

      return this
    })()
  }

  async initWebGLExperiment() {
    if(this.webGL || !supportsWebGL() || getBrowser() === 'Firefox') return

    try {
      this.webGLExperiment = await contentScript.getStorageEntryOrEntries('webGL-experiment')
      if(this.webGLExperiment !== null) return
    } catch(ex) {
      AmbilightSentry.captureExceptionWithDetails(ex)
      return
    }

    let newUser = false
    try {
      newUser = !Object.entries(localStorage).some(entry => entry[0].indexOf('ambilight-') === 0)
    } catch {
      newUser = true
    }
    this.webGLExperiment = (newUser || Math.random() > .8)
    try {
      await contentScript.setStorageEntry('webGL-experiment', this.webGLExperiment)
    } catch(ex) {
      AmbilightSentry.captureExceptionWithDetails(ex)
      return
    }
    if(!this.webGLExperiment) return

    this.set('webGL', true)
  }
  
  async getAll() {
    const names = []
    for (const setting of this.config) {
      names.push(`setting-${setting.name}`)

      if(setting.defaultKey !== undefined) {
        names.push(`setting-${setting.name}-key`)
      }
    }

    let storedSettings = {}
    try {
      storedSettings = await contentScript.getStorageEntryOrEntries(names, true) || {}
    } catch {
      this.setWarning('The settings cannot be retrieved, the extension could have been updated.\nRefresh the page to retry again.')
    }
      
    for (const setting of this.config) {
      let value = storedSettings[`setting-${setting.name}`]
      value = (value === null || value === undefined) ? await this.tryGetAndMigrateLocalStorageEntry(setting.name) : value
      this[setting.name] = this.processStorageEntry(setting.name, value)

      if(setting.defaultKey !== undefined) {
        let key = storedSettings[`setting-${setting.name}-key`]
        if(key === null || key === undefined) key = await this.tryGetAndMigrateLocalStorageEntry(`${setting.name}-key`)
        if(key === null) key = setting.defaultKey
        setting.key = key
      }
    }
    await this.flushPendingStorageEntries() // Complete migrations

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
          <div class="ytp-menuitem ytpa-menuitem--warning" style="display: none">
            <div class="ytp-menuitem-label" rowspan="2">
              <span class="ytpa-warning"></span>
            </div>
          </div>
          <div class="ytp-menuitem ytpa-menuitem--header">
            <div class="ytp-menuitem-label">
              <a class="ytpa-feedback-link" href="https://github.com/WesselKroos/youtube-ambilight/blob/master/TROUBLESHOOT.md" target="_blank">
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
              <a class="ytpa-feedback-link" href="${feedbackFormLink}" target="_blank">
                <span class="ytpa-feedback-link__text">Give feedback or rate Ambient light</span>
              </a>
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
                  colspan="2" 
                  value="${setting.valuePoints ? setting.valuePoints.indexOf(value) : value}" 
                  ${setting.min ? `min="${setting.min}"` : ''} 
                  ${setting.max ? `max="${setting.max}"` : ''} 
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

    this.warningItemElem = this.menuElem.querySelector('.ytpa-menuitem--warning')
    this.warningElem = this.warningItemElem.querySelector('.ytpa-warning')

    const resetSettingsBtnElem = this.menuElem.querySelector('.ytpa-reset-settings-btn')
    on(resetSettingsBtnElem, 'click', () => {
      if(!confirm('Are you sure you want to reset ALL the settings?')) return
      
      // Reset values
      for (const input of this.menuElem.querySelectorAll('[role="menuitemcheckbox"], input[type="range"]')) {
        input.dispatchEvent(new Event('contextmenu'))
      }

      // Reset keys
      for (const setting of this.config.filter(setting => setting.key)) {
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
        const inputElem = $.s(`#setting-${setting.name}-range`)
        const valueElem = $.s(`#setting-${setting.name}-value`)

        const manualInputElem = $.s(`#setting-${setting.name}-manualinput`)
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

        on(inputElem, 'change mousemove dblclick contextmenu touchmove', (e) => {
          if(e.type === 'mousemove' && e.buttons === 0) return

          let value = parseFloat(inputElem.value)
          if (e.type === 'dblclick' || e.type === 'contextmenu') {
            value = this.config.find(s => s.name === setting.name).default
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

          if(this[setting.name] === value) return

          this.set(setting.name, value)
          valueElem.textContent = this.getSettingListDisplayText(setting)

          if(setting.name === 'theme') {
            this.ambilight.updateTheme()
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

              const edgeSetting = this.config.find(setting => setting.name === 'edge')
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

          if(
            setting.name === 'verticalBarsClipPercentage' &&
            this.detectVerticalBarSizeEnabled
          ) {
            const controllerInput = $.s(`#setting-detectVerticalBarSizeEnabled`)
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
            (this.detectHorizontalBarSizeEnabled || this.detectVerticalBarSizeEnabled) &&
            setting.name === 'detectHorizontalBarSizeOffsetPercentage'
          ) {
            this.ambilight.barDetection.clear()
            this.ambilight.scheduleBarSizeDetection()
          }

          if (
            setting.name === 'spread' || 
            setting.name === 'edge'
          ) {
            this.ambilight.canvassesInvalidated = true
          }

          if(['surroundingContentShadowSize', 'videoShadowSize'].some(name => name === setting.name)) {
            this.updateVisibility()
          }

          this.ambilight.buffersCleared = true
          this.ambilight.sizesInvalidated = true
          this.ambilight.optionalFrame()
        })
      } else if (setting.type === 'checkbox') {
        on(settingElem, 'dblclick contextmenu click', (e) => {
          let value = !this[setting.name];
          if (e.type === 'dblclick' || e.type === 'contextmenu') {
            value = this.config.find(s => s.name === setting.name).default
            if(value === this[setting.name]) return
          }

          if (
            setting.name === 'videoOverlayEnabled' ||
            setting.name === 'frameSync' ||
            setting.name === 'frameBlending' ||
            setting.name === 'showFPS' ||
            setting.name === 'surroundingContentTextAndBtnOnly' ||
            setting.name === 'horizontalBarsClipPercentageReset' ||
            setting.name === 'detectHorizontalBarSizeEnabled' ||
            setting.name === 'detectColoredHorizontalBarSizeEnabled' ||
            setting.name === 'detectVerticalBarSizeEnabled' ||
            setting.name === 'detectColoredVerticalBarSizeEnabled' ||
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

          if (setting.name === 'enabled') {
            this.ambilight.toggleEnabled(value)
          }
          if (setting.name === 'immersive') {
            this.ambilight.toggleImmersiveMode(value)
          }
          if (setting.name === 'hideScrollbar') {
            html.setAttribute('data-ambilight-hide-scrollbar', value)
          }
          if(setting.name === 'immersiveTheaterView') {
            this.ambilight.updateImmersiveMode()
          }
          
          if(['detectHorizontalBarSizeEnabled', 'detectVerticalBarSizeEnabled', 'frameBlending', 'videoOverlayEnabled'].some(name => name === setting.name)) {
            this.updateVisibility()
          }

          if(setting.name === 'detectHorizontalBarSizeEnabled' || setting.name === 'detectVerticalBarSizeEnabled') {
            if(!value) {
              if(!settingElem.dontResetControlledSetting) {
                const controlledSettingName = ({
                  'detectHorizontalBarSizeEnabled': 'horizontalBarsClipPercentage',
                  'detectVerticalBarSizeEnabled': 'verticalBarsClipPercentage'
                })[setting.name]
                const percentageSetting = this.config.find(setting => setting.name === controlledSettingName)
                const percentageInputElem = $.s(`#setting-${percentageSetting.name}-range`)
                percentageInputElem.value = percentageSetting.default
                percentageInputElem.dispatchEvent(new Event('change', { bubbles: true }))
              }
            } else {
              this.ambilight.barDetection.clear()
              this.ambilight.scheduleBarSizeDetection()
            }
            if(settingElem.dontResetControlledSetting) {
              settingElem.dontResetControlledSetting = false
            }
            this.updateVisibility()
            this.displayBezel(setting.key, !value)

            if(this.webGL) {
              this.ambilight.updateSizes()
            }
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
            this.updateVisibility()

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
            // setTimeout to allow processing of all settings in case the reset button was clicked
            setTimeout(async () => {
              await this.flushPendingStorageEntries()
  
              const search = new URLSearchParams(location.search)
              const time = Math.max(0, Math.floor(this.ambilight.videoElem?.currentTime || 0) - 2)
              time ? search.set('t', time) : search.delete('t')
              history.replaceState(null, null, `${location.pathname}?${search.toString()}`)
              location.reload()
            }, 1)
            return
          }

          this.ambilight.updateSizes()
          this.ambilight.optionalFrame()
        })
      }
    }

    this.updateVisibility()
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
    if(setting.name === 'theme' || setting.name === 'enableInViews') {
      const snapPoint = setting.snapPoints.find(point => point.value === value)
      return snapPoint?.hiddenLabel || snapPoint?.label
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

  
  controlledSettings = [
    {
      name: 'videoScale',
      controllerName: 'detectVideoFillScaleEnabled',
      controller: 'Fill video to screen width'
    },
    {
      name: 'horizontalBarsClipPercentage',
      controllerName: 'detectHorizontalBarSizeEnabled',
      controller: 'Remove black bars'
    },
    {
      name: 'verticalBarsClipPercentage',
      controllerName: 'detectVerticalBarSizeEnabled',
      controller: 'Remove black sidebars size'
    }
  ]
  optionalSettings = [
    {
      names: [
        'detectHorizontalBarSizeEnabled',
        'detectVerticalBarSizeEnabled'
      ],
      visible: () => this.ambilight.getImageDataAllowed
    },
    {
      names: [
        'detectColoredHorizontalBarSizeEnabled',
        'detectHorizontalBarSizeOffsetPercentage'
      ],
      visible: () => this.ambilight.getImageDataAllowed && (this.detectHorizontalBarSizeEnabled || this.detectVerticalBarSizeEnabled)
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
      names: [ 'surroundingContentShadowOpacity' ],
      visible: () => this.surroundingContentShadowSize
    },
    {
      names: [ 'videoShadowOpacity' ],
      visible: () => this.videoShadowSize
    }
  ]
  updateVisibility() {
    for(const setting of this.controlledSettings) {
      const valueElem = $.s(`#setting-${setting.name}-value`)
      if(this[setting.controllerName]) {
        valueElem.classList.add('is-controlled-by-setting')
        valueElem.setAttribute('title', `Controlled by the "${setting.controller}" setting.\nManually adjusting this setting will turn off "${setting.controller}"`)
      } else {
        valueElem.classList.remove('is-controlled-by-setting')
        valueElem.setAttribute('title', '')
      }
    }

    for(const optionalGroup of this.optionalSettings) {
      const optionalSettings = optionalGroup.names.map(name => $.s(`#setting-${name}`)).filter(setting => setting)
      const visible = optionalGroup.visible()
      for (const optionalSetting of optionalSettings) {
        optionalSetting.style.display = visible ? '' : 'none'
      }
    }
  }

  setKey(name, key) {
    const setting = this.config.find(setting => setting.name === name) || {}
    setting.key = key
    this.saveStorageEntry(`${setting.name}-key`, key)
  }

  set(name, value, updateUI) {
    const changed = this[name] !== value
    this[name] = value

    if (name === 'blur')
      value = Math.round((value - 30) * 10) / 10 // Prevent rounding error
    if (name === 'bloom')
      value = Math.round((value - 7) * 10) / 10 // Prevent rounding error

    if(changed) {
      this.saveStorageEntry(name, value)
    }

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
        rangeInput.value = setting.valuePoints ? setting.valuePoints.indexOf(this[name]) : this[name]
        rangeInput.setAttribute('data-previous-value', rangeInput.value)
        $.s(`#setting-${name}-value`).textContent = this.getSettingListDisplayText(setting)
        const manualInput = $.s(`#setting-${name}-manualinput`)
        if(manualInput) {
          manualInput.value = rangeInput.value
        }
      }
    }
  }

  clickUI(name) {
    $.s(`#setting-${name}`).click()
  }

  processStorageEntry(name, value) {
    const setting = this.config.find(setting => setting.name === name) || {}
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

  logLocalStorageWarningOnce(...args) {
    if(this.loggedLocalStorageWarning) return

    console.warn(...args)
    this.loggedLocalStorageWarning = true
  }

  async tryGetAndMigrateLocalStorageEntry(name) {
    let value = null
    try {
      value = localStorage.getItem(`ambilight-${name}`)
      if(value !== null) {
        localStorage.removeItem(`ambilight-${name}`)
        this.saveStorageEntry(name, JSON.parse(value))
      }
    } catch (ex) {
      this.logLocalStorageWarningOnce(`Ambient light for YouTube™ | ${ex.message}`)
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
      if(ex?.message === 'uninstalled') {
        this.setWarning('The changes cannot be saved because the extension has been updated.\nRefresh the page to continue.')
        return
      }
      AmbilightSentry.captureExceptionWithDetails(ex)
      this.logLocalStorageWarningOnce(`Ambient light for YouTube™ | Failed to save settings ${JSON.stringify(this.pendingStorageEntries)}: ${ex.message}`)
    }
  }

  getKeys = () => ({
    immersive: this.config.find(setting => setting.name === 'immersive').key,
    enabled: this.config.find(setting => setting.name === 'enabled').key,
    detectHorizontalBarSizeEnabled: this.config.find(setting => setting.name === 'detectHorizontalBarSizeEnabled').key,
    detectVerticalBarSizeEnabled: this.config.find(setting => setting.name === 'detectVerticalBarSizeEnabled').key,
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

  setWarning = (message, optional = false) => {
    if(!this.menuElem) {
      this.pendingWarning = () => this.setWarning(message, optional)
      return
    }

    if(optional && this.warningElem.textContent.length) return

    const messageChanged = this.warningElem.textContent !== message
    this.warningItemElem.style.display = message ? '' : 'none'
    this.warningElem.textContent = message
    
    this.menuBtn.classList.toggle('has-warning', !!message)
    if(message && messageChanged)
      this.menuElem.scrollTo({
        behavior: 'smooth',
        top: 0
      })
  }
}