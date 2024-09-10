import {
  on,
  off,
  setTimeout,
  supportsWebGL,
  raf,
  setWarning,
  VIEW_SMALL,
  VIEW_THEATER,
  VIEW_FULLSCREEN,
  setDisplayErrorHandler,
} from './generic';
import SentryReporter from './sentry-reporter';
import SettingsConfig, {
  prepareSettingsConfigOnce,
  WebGLOnlySettings,
} from './settings-config';
import { getFeedbackFormLink, getVersion } from './utils';
import { storage } from './storage';

export const FRAMESYNC_DECODEDFRAMES = 0;
export const FRAMESYNC_DISPLAYFRAMES = 1;
export const FRAMESYNC_VIDEOFRAMES = 2;

export const DEBANDING_BLEND_MODE_LCD = 0;
export const DEBANDING_BLEND_MODE_OLED = 1;

export const COLORSPACE_AUTO = 0;
export const COLORSPACE_SRGB = 1;
export const COLORSPACE_DISPLAY_P3 = 2;
export const COLORSPACE_REC_2020_PQ = 3;
export const COLORSPACE_REC_2020_HLG = 4;

export const COLORBITDEPTH_AUTO = 0;
export const COLORBITDEPTH_8 = 1;
export const COLORBITDEPTH_10 = 2;
export const COLORBITDEPTH_16 = 3;
export const COLORBITDEPTH_32 = 4;

export const COLORCONVERSIONPATCH_AUTO = 0;
export const COLORCONVERSIONPATCH_ENABLED = 1;
export const COLORCONVERSIONPATCH_DISABLED = 2;

const feedbackFormLink = getFeedbackFormLink(); // document.currentScript?.getAttribute('data-feedback-form-link')
//  || 'https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform'
const baseUrl = chrome.runtime.getURL('') || ''; // document.currentScript?.getAttribute('data-base-url') || ''
const version = getVersion(); // document.currentScript?.getAttribute('data-version') || ''

const getSettingQuerySelector = (name) =>
  `#setting-${name.replace(/\./g, '\\.')}`;

export default class Settings {
  saveStorageEntryTimeout = {};

  constructor(ambientlight, menuBtnParent, menuElemParent) {
    return async function settingsConstructor() {
      this.ambientlight = ambientlight;
      this.menuBtnParent = menuBtnParent;
      this.menuElemParent = menuElemParent;

      await this.getAll();
      this.initMenu();
      if (this.webGLCrashDate) this.updateWebGLCrashDescription();
      if (this.pendingWarning) this.pendingWarning();
      return this;
    }.bind(this)();
  }

  static getStoredSettingsCached = async () => {
    if (Settings.storedSettingsCached) {
      return Settings.storedSettingsCached;
    }

    prepareSettingsConfigOnce();

    const names = [];
    for (const setting of SettingsConfig) {
      names.push(`setting-${setting.name}`);

      if (setting.defaultKey !== undefined) {
        names.push(`setting-${setting.name}-key`);
      }
    }
    names.push('setting-webGLCrash');
    names.push('setting-webGLCrashVersion');
    names.push('setting-surroundingContentImagesTransparency');

    // Migrate old settings
    names.push('setting-blur');
    names.push('setting-bloom');
    names.push('setting-fadeOutEasing');

    const warningTimeout = setTimeout(
      () =>
        setWarning(
          `It is taking more than 5 seconds to load your previous settings. Something might be wrong.${'\n'}Refresh the webpage to try it again. ${'\n\n'}This can happen after you have updated the extension.`
        ),
      5000
    );
    Settings.storedSettingsCached = (await storage.get(names, true)) || {};
    clearTimeout(warningTimeout);
    setWarning();

    // Migrate old settings
    if (Settings.storedSettingsCached['setting-blur'] != null) {
      const value =
        (Math.round(Settings.storedSettingsCached['setting-blur'] + 30) * 10) /
        10; // Prevent rounding error

      delete Settings.storedSettingsCached['setting-blur'];
      await storage.set('setting-blur', undefined, false);

      Settings.storedSettingsCached['setting-blur2'] = value;
      await storage.set('setting-blur2', value, false);
    }
    if (Settings.storedSettingsCached['setting-bloom'] != null) {
      const value =
        Math.round((Settings.storedSettingsCached['setting-bloom'] + 7) * 10) /
        10; // Prevent rounding error
      delete Settings.storedSettingsCached['setting-bloom'];
      await storage.set('setting-bloom', undefined, false);

      Settings.storedSettingsCached['setting-spreadFadeStart'] = value;
      await storage.set('setting-spreadFadeStart', value, false);
    }
    if (Settings.storedSettingsCached['setting-fadeOutEasing'] != null) {
      Settings.storedSettingsCached['setting-spreadFadeCurve'] =
        Settings.storedSettingsCached['setting-fadeOutEasing'];
      delete Settings.storedSettingsCached['setting-fadeOutEasing'];
      await storage.set('setting-fadeOutEasing', undefined, false);
    }
    if (Settings.storedSettingsCached['setting-frameFading'] != null) {
      const value = Settings.storedSettingsCached['setting-frameFading'];
      const max = SettingsConfig.find(
        (setting) => setting.name === 'frameFading'
      ).max;
      if (value > max) {
        const newValue = Math.min(max, Math.round(Math.sqrt(value) * 50) / 50);
        Settings.storedSettingsCached['setting-frameFading'] = newValue;
        await storage.set('setting-frameFading', newValue, false);
      }
    }

    const webGLEnabled =
      Settings.storedSettingsCached['setting-webGL'] === true ||
      (Settings.storedSettingsCached['setting-webGL'] == null &&
        supportsWebGL());
    if (webGLEnabled) {
      // Disable enabled WebGL setting if not supported anymore
      if (!supportsWebGL()) {
        Settings.storedSettingsCached['setting-webGL'] = null;
        SettingsConfig.find((setting) => setting.name === 'spread').max = 200;
      } else {
        SettingsConfig.find(
          (setting) => setting.name === 'saturation'
        ).advanced = true;
      }
    } else {
      SettingsConfig.find((setting) => setting.name === 'spread').max = 200;
      for (const settingName of WebGLOnlySettings) {
        if (
          Settings.storedSettingsCached[`setting-${settingName}`] !== undefined
        )
          delete Settings.storedSettingsCached[`setting-${settingName}`];
      }
      if (Settings.storedSettingsCached['setting-spread'] > 200)
        Settings.storedSettingsCached['setting-spread'] = 200;
    }

    return Settings.storedSettingsCached;
  };

  getColorSpace = () =>
    ({
      [COLORSPACE_AUTO]: 'srgb',
      [COLORSPACE_SRGB]: 'srgb',
      [COLORSPACE_DISPLAY_P3]: 'display-p3',
      [COLORSPACE_REC_2020_PQ]: 'rec2100-pq',
      [COLORSPACE_REC_2020_HLG]: 'rec2100-hlg',
    }[this.colorSpace ?? 0]);

  getColorBitDepth = () =>
    ({
      [COLORBITDEPTH_AUTO]: 8,
      [COLORBITDEPTH_8]: 8,
      [COLORBITDEPTH_10]: 10,
      [COLORBITDEPTH_16]: 16,
      [COLORBITDEPTH_32]: 32,
    }[this.colorBitDepth ?? 0]);

  async getAll() {
    let storedSettings = {};
    try {
      storedSettings = await Settings.getStoredSettingsCached();
    } catch {
      this.setWarning(
        'Your previous settings cannot be loaded because the extension could have been updated.\nRefresh the page to retry again.'
      );
    }

    const webGLCrash = storedSettings['setting-webGLCrash'];
    const webGLCrashVersion = storedSettings['setting-webGLCrashVersion'];
    if (webGLCrash && webGLCrashVersion === version) {
      this.webGLCrashDate = new Date(webGLCrash);
      this.webGLCrashVersion = webGLCrashVersion;
    }

    for (const setting of SettingsConfig) {
      const value = storedSettings[`setting-${setting.name}`];
      this[setting.name] = this.processStorageEntry(setting.name, value);

      if (setting.defaultKey !== undefined) {
        let key = storedSettings[`setting-${setting.name}-key`];
        if (key == null) key = setting.defaultKey;
        setting.key = key;
      }
    }

    this.migrate(storedSettings);

    // Makes the new default framerateLimit of 30 backwards compatible with a previously enabled frameBlending
    if (this.frameBlending && this.framerateLimit !== 0) {
      this.set('framerateLimit', 0);
    }

    await this.flushPendingStorageEntries(); // Complete migrations

    if (this.enabled)
      document.documentElement.setAttribute(
        'data-ambientlight-hide-scrollbar',
        this.hideScrollbar
      );
  }

  migrate(storedSettings) {
    const surroundingContentImagesTransparency =
      storedSettings['setting-surroundingContentImagesTransparency'];
    if (typeof surroundingContentImagesTransparency === 'number') {
      const opacity = 100 - surroundingContentImagesTransparency;
      this.set('surroundingContentImagesOpacity', opacity);
      this['surroundingContentImagesOpacity'] = opacity;

      this.saveStorageEntry('surroundingContentImagesTransparency', undefined);
    }
  }

  handleWebGLCrash = async () => {
    this.webGLCrashDate = new Date();
    this.saveStorageEntry('webGLCrash', +this.webGLCrashDate);
    this.saveStorageEntry('webGLCrashVersion', version);

    this.set('webGL', false, true, true);
    this.updateVisibility();

    this.saveStorageEntry('flickerReduction', undefined); // Override potential crash reason
    this.saveStorageEntry('frameFading', undefined); // Override potential crash reason
    this.saveStorageEntry('resolution', undefined); // Override potential crash reason

    SettingsConfig.find((setting) => setting.name === 'spread').max = 200;
    if (this.spread > 200) this.set('spread', 200, true, false); // Override potential crash reason
    const spreadRangeInputElem = this.menuElem.querySelector(
      `#setting-spread-range`
    );
    if (spreadRangeInputElem) spreadRangeInputElem.max = 200;

    await this.flushPendingStorageEntries();
    this.updateWebGLCrashDescription();
  };

  updateWebGLCrashDescription = () => {
    const disabledText =
      SettingsConfig.find((setting) => setting.name === 'webGL').disabled || '';
    const labelElem = this.menuElem.querySelector(
      '#setting-webGL .ytp-menuitem-label'
    );
    let descriptionElem = this.menuElem.querySelector(
      '#setting-webGL .ytp-menuitem-label .ytpa-menuitem-description'
    );
    if (!descriptionElem) {
      descriptionElem = document.createElement('span');
      descriptionElem.className = 'ytpa-menuitem-description';
      labelElem.appendChild(descriptionElem);
    }
    descriptionElem.classList.add('ytpa-menuitem-description--warning');

    let descriptionText = disabledText;
    if (this.webGLCrashDate) {
      descriptionText += `${
        disabledText
          ? '\r\nAnd the WebGL renderer previously failed'
          : 'Failed to load'
      } at ${this.webGLCrashDate.toLocaleTimeString()} ${this.webGLCrashDate.toLocaleDateString()}`;
      descriptionText += `\r\n\r\nCheck the Hardware acceleration and WebGL settings in your browser or click on the link "troubleshoot performance problems" at the top of this menu to troubleshoot this problem.`;
      if (!disabledText)
        descriptionText += `\r\n\r\nNote: You can re-enable this setting to try it again. In case the WebGL renderer fails again we will update the time at which it failed.`;
    }
    descriptionElem.textContent = descriptionText;
  };

  createMenuElement() {
    const elem = document.createElement('div');
    elem.className = `ytp-popup ytp-settings-menu ytp-rounded-menu ytpa-ambientlight-settings-menu ${
      this.advancedSettings ? 'ytpa-ambientlight-settings-menu--advanced' : ''
    }`;
    elem.id = 'ytp-id-190';

    const panel = document.createElement('div');
    panel.className = 'ytp-panel';
    elem.appendChild(panel);

    const menu = document.createElement('div');
    menu.className = 'ytp-panel-menu';
    menu.role = 'menu';
    panel.appendChild(menu);

    // panelMenu.innerHTML `<div class="ytp-menuitem ytpa-menuitem--updates" title="Click to dismiss" style="display: none">
    //   <div class="ytp-menuitem-label" rowspan="2">
    //     <span class="ytpa-updates">${''
    //       }<b>Changes in version ${version}:</b>
    //       <ul>
    //         ${getBrowser() === 'Firefox'
    //           ? ''
    //           : `<li>${''
    //               }The ambient light now also supports VR/180/360 videos.\n ${''
    //               }(Let me know when support fails on your device through the feedback link.)
    //             </li>`}
    //         <li>${''
    //           }The following hotkeys have changed to prevent conflicts with the AWSD keys in VR/180/360 videos: \n- Enable/disable [A] -> [G] \n- Fill video [S] -> [H]
    //         </li>
    //     </ul></span>
    //   </div>
    // </div>`

    const warning = document.createElement('div');
    warning.className = 'ytp-menuitem ytpa-menuitem--warning';
    warning.style.display = 'none';
    menu.appendChild(warning);

    const warningLabel = document.createElement('div');
    warningLabel.className = 'ytp-menuitem-label';
    warningLabel.rowspan = '2';
    warning.appendChild(warningLabel);

    const warningSpan = document.createElement('span');
    warningSpan.className = 'ytpa-warning';
    warningSpan.rowspan = '2';
    warningLabel.appendChild(warningSpan);

    const warningCloseButton = document.createElement('button');
    warningCloseButton.className = 'ytpa-warning-close-btn';
    warningCloseButton.title = 'Close warning';
    warning.appendChild(warningCloseButton);

    const info = document.createElement('div');
    info.className = 'ytp-menuitem ytpa-menuitem--info';
    info.style.display = 'none';
    menu.appendChild(info);

    const infoLabel = document.createElement('div');
    infoLabel.className = 'ytp-menuitem-label';
    infoLabel.rowspan = '2';
    info.appendChild(infoLabel);

    const infoSpan = document.createElement('span');
    infoSpan.className = 'ytpa-info';
    infoSpan.rowspan = '2';
    infoLabel.appendChild(infoSpan);

    const header1 = document.createElement('div');
    header1.className = 'ytp-menuitem ytpa-menuitem--header';
    menu.appendChild(header1);

    const header1Label = document.createElement('div');
    header1Label.className = 'ytp-menuitem-label';
    header1.appendChild(header1Label);

    const header1Content = document.createElement('div');
    header1Content.className = 'ytp-menuitem-content';
    header1.appendChild(header1Content);

    const troubleshootLink = document.createElement('a');
    troubleshootLink.className = 'ytpa-feedback-link';
    troubleshootLink.href =
      'https://github.com/WesselKroos/youtube-ambilight/blob/master/TROUBLESHOOT.md';
    troubleshootLink.target = '_blank';
    troubleshootLink.rel = 'noopener';
    header1Label.appendChild(troubleshootLink);

    const troubleshootLinkText = document.createElement('span');
    troubleshootLinkText.className = 'ytpa-feedback-link__text';
    troubleshootLinkText.textContent = 'Troubleshoot performance problems';
    troubleshootLink.appendChild(troubleshootLinkText);

    const toolbar = document.createElement('div');
    toolbar.className = 'ytpa-settings-toolbar';
    header1Content.appendChild(toolbar);

    const importBtn = document.createElement('button');
    importBtn.className = 'ytpa-export-import-settings-btn';
    importBtn.type = 'button';
    toolbar.appendChild(importBtn);

    const importTooltip = document.createElement('span');
    importTooltip.className = 'ytpa-export-import-settings-btn__tooltip';
    importTooltip.textContent = `How to export or import settings: 
1. Click on the extension icon to open the option. 
2. Scroll down to "Import / Export settings"`;
    importBtn.appendChild(importTooltip);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'ytpa-reset-settings-btn';
    resetBtn.type = 'button';
    resetBtn.title = 'Reset all settings';
    toolbar.appendChild(resetBtn);

    const header2 = document.createElement('div');
    header2.className = 'ytp-menuitem ytpa-menuitem--header';
    menu.appendChild(header2);

    const header2Label = document.createElement('div');
    header2Label.className = 'ytp-menuitem-label';
    header2.appendChild(header2Label);

    const header2Content = document.createElement('div');
    header2Content.className = 'ytp-menuitem-content';
    header2.appendChild(header2Content);

    const feedbackLink = document.createElement('a');
    feedbackLink.className = 'ytpa-feedback-link';
    feedbackLink.href = feedbackFormLink;
    feedbackLink.target = '_blank';
    feedbackLink.rel = 'noopener';
    header2Label.appendChild(feedbackLink);

    const feedbackLinkText = document.createElement('span');
    feedbackLinkText.className = 'ytpa-feedback-link__text';
    feedbackLinkText.textContent = 'Give feedback or a rating';
    feedbackLink.appendChild(feedbackLinkText);

    const donateLink = document.createElement('a');
    donateLink.className = 'ytpa-donate-link';
    donateLink.href = 'https://ko-fi.com/G2G59EK8L';
    donateLink.target = '_blank';
    donateLink.rel = 'noopener';
    header2Content.appendChild(donateLink);

    const donateLinkImage = document.createElement('img');
    donateLinkImage.className = 'ytpa-donate-link__image';
    donateLinkImage.alt = 'Support me via a donation';
    donateLinkImage.title = 'Support me via a donation';
    donateLinkImage.src = `${baseUrl}images/donate.svg`;
    donateLinkImage.height = '23';
    donateLink.appendChild(donateLinkImage);

    let sectionContent;

    for (const i in SettingsConfig) {
      const setting = SettingsConfig[i];

      const value = this[setting.name];

      let classes = 'ytp-menuitem';
      if (setting.advanced) classes += ' ytpa-menuitem--advanced';
      if (setting.hdr) classes += ' ytpa-menuitem--hdr';
      if (setting.new) classes += ' ytpa-menuitem--new';
      if (setting.experimental) classes += ' ytpa-menuitem--experimental';

      const labelElems = [];
      labelElems.push(document.createTextNode(setting.label));

      if (setting.key) {
        labelElems.push(document.createTextNode('['));

        const labelKey = document.createElement('span');
        labelKey.contentEditable = true;
        labelKey.className = 'ytpa-menuitem-key';
        labelKey.title =
          'Click here and press a key to change the hotkey\n(Or press the escape key to disable this hotkey)';
        labelKey.textContent = setting.key;
        labelElems.push(labelKey);

        labelElems.push(document.createTextNode(']'));
      }

      if (setting.questionMark) {
        const questionMark = document.createElement('a');
        questionMark.title = setting.questionMark.title;
        questionMark.style.padding = '0 5px';
        questionMark.textContent = '?';
        if (setting.questionMark.href) {
          questionMark.href = setting.questionMark.href;
          questionMark.target = '_blank';
          questionMark.rel = 'noopener';
        } else {
          questionMark.href = '#';
          questionMark.addEventListener('click', () => false);
        }
        labelElems.push(questionMark);
      }

      if (setting.description) {
        labelElems.push(document.createElement('br'));
        const labelDescription = document.createElement('span');
        labelDescription.className = 'ytpa-menuitem-description';
        labelDescription.textContent = setting.description;
        labelElems.push(labelDescription);
      }

      if (setting.type === 'section') {
        const section = document.createElement('div');
        section.className = `ytpa-section ${value ? 'is-collapsed' : ''} ${
          setting.advanced ? 'ytpa-section--advanced' : ''
        } ${setting.hdr ? 'ytpa-section--hdr' : ''}`;
        section.dataset.name = setting.name;
        menu.appendChild(section);

        const cell1 = document.createElement('div');
        cell1.className = 'ytpa-section__cell';
        section.appendChild(cell1);

        const label = document.createElement('div');
        label.className = 'ytpa-section__label';
        label.replaceChildren(...labelElems);
        cell1.appendChild(label);

        const cell2 = document.createElement('div');
        cell2.className = 'ytpa-section__cell';
        section.appendChild(cell2);

        const fill = document.createElement('div');
        fill.className = 'ytpa-section__fill';
        fill.textContent = '-';
        cell2.appendChild(fill);

        sectionContent = document.createElement('div');
        sectionContent.className = 'ytpa-section-content';
        menu.appendChild(sectionContent);
      }

      if (setting.type === 'checkbox') {
        const checkbox = document.createElement('div');
        checkbox.id = `setting-${setting.name}`;
        checkbox.className = classes;
        checkbox.role = 'menuitemcheckbox';
        checkbox.ariaChecked = value ? 'true' : 'false';
        if (setting.disabled) {
          checkbox.ariaDisabled = 'true';
          checkbox.title = 'This setting is unavailable';
        } else {
          checkbox.title = 'Right click to reset';
          checkbox.tabindex = '0';
        }
        sectionContent.appendChild(checkbox);

        const label = document.createElement('div');
        label.className = 'ytp-menuitem-label';
        checkbox.appendChild(label);

        label.replaceChildren(...labelElems);

        if (setting.disabled) {
          const description = document.createElement('span');
          description.className = 'ytpa-menuitem-description';
          description.style.color = '#fa0';
          description.textContent = setting.disabled;
          label.appendChild(description);
        }

        const content = document.createElement('div');
        content.className = 'ytp-menuitem-content';
        checkbox.appendChild(content);

        const toggle = document.createElement('div');
        toggle.className = 'ytp-menuitem-toggle-checkbox';
        content.appendChild(toggle);
      }

      if (setting.type === 'list') {
        const wrapper = document.createElement('div');
        wrapper.id = `setting-${setting.name}`;
        wrapper.className = 'ytp-menuitem-range-wrapper';
        sectionContent.appendChild(wrapper);

        const list = document.createElement('div');
        list.className = classes;
        list.ariaHasPopup = 'false';
        list.role = 'menuitemrange';
        list.tabIndex = 0;
        wrapper.appendChild(list);

        const label = document.createElement('div');
        label.className = 'ytp-menuitem-label';
        label.replaceChildren(...labelElems);
        list.appendChild(label);

        const content = document.createElement('div');
        content.className = 'ytp-menuitem-content';
        list.appendChild(content);

        if (setting.manualinput !== false) {
          const manualInput = document.createElement('input');
          manualInput.id = `setting-${setting.name}-manualinput`;
          manualInput.className = 'ytpa-menuitem-input';
          manualInput.type = 'text';
          manualInput.value = value;
          content.appendChild(manualInput);
        }

        const valueElem = document.createElement('div');
        valueElem.id = `setting-${setting.name}-value`;
        valueElem.className = 'ytp-menuitem-value';
        valueElem.textContent = this.getSettingListDisplayText(setting);
        content.appendChild(valueElem);

        const range = document.createElement('div');
        range.className = `ytp-menuitem-range ${
          setting.snapPoints ? 'ytp-menuitem-range--has-snap-points' : ''
        }`;
        range.setAttribute('rowspan', '2');
        range.title = 'Right click to reset';
        wrapper.appendChild(range);

        const input = document.createElement('input');
        input.id = `setting-${setting.name}-range`;
        input.type = 'range';
        input.setAttribute('colspan', '2');
        if (setting.min !== undefined) input.min = setting.min.toString();
        if (setting.max !== undefined) input.max = setting.max.toString();
        if (setting.valuePoints) {
          input.min = '0';
          input.max = (setting.valuePoints.length - 1).toString();
        }
        if (setting.step || setting.valuePoints) input.step = setting.step || 1;
        input.value = this.getInputRangeValue(setting.name);
        range.appendChild(input);

        if (setting.snapPoints) {
          const datalist = document.createElement('datalist');
          datalist.className = 'setting-range-datalist';
          datalist.id = `snap-points-${setting.name}`;
          wrapper.appendChild(datalist);

          for (const {
            label,
            hiddenLabel,
            value,
            flip,
          } of setting.snapPoints) {
            const option = document.createElement('option');
            option.className = `setting-range-datalist__label ${
              flip ? 'setting-range-datalist__label--flip' : ''
            }`;
            option.title = `Set to ${hiddenLabel || label}`;
            option.style.marginLeft = `${
              (value + -setting.min) * (100 / (setting.max - setting.min))
            }%`;
            option.value = value.toString();
            option.label = label || '';
            option.textContent = option.label;
            datalist.appendChild(option);
          }
        }
      }
    }

    return elem;
  }

  initMenu() {
    this.menuBtn = this.createMenuButton();
    on(this.menuBtn, 'click', this.onSettingsBtnClicked);

    const settingsMenuBtnTooltip = document.createElement('div');
    settingsMenuBtnTooltip.className =
      'ytp-tooltip ytp-bottom ytp-ambientlight-settings-button-tooltip';
    settingsMenuBtnTooltip.setAttribute('aria-live', 'polite');
    settingsMenuBtnTooltip.style.opacity = 0;

    const settingsMenuBtnTooltipTextWrapper = document.createElement('div');
    settingsMenuBtnTooltipTextWrapper.className = 'ytp-tooltip-text-wrapper';
    settingsMenuBtnTooltip.prepend(settingsMenuBtnTooltipTextWrapper);

    this.settingsMenuBtnTooltipText = document.createElement('span');
    this.settingsMenuBtnTooltipText.className =
      'ytp-tooltip-text ytp-tooltip-text-no-title';
    this.settingsMenuBtnTooltipText.appendChild(
      document.createTextNode('Ambient light loading is paused.')
    );
    this.settingsMenuBtnTooltipText.appendChild(document.createElement('br'));
    this.settingsMenuBtnTooltipText.appendChild(
      document.createTextNode(
        'Waiting for the video and page to be loaded first...'
      )
    );
    settingsMenuBtnTooltipTextWrapper.prepend(this.settingsMenuBtnTooltipText);

    this.menuBtn.prepend(settingsMenuBtnTooltip);
    const ytSettingsBtn = document.querySelector(
      'ytd-player [data-tooltip-target-id="ytp-autonav-toggle-button"]'
    );
    if (ytSettingsBtn) {
      ytSettingsBtn.parentNode.insertBefore(this.menuBtn, ytSettingsBtn);
    } else {
      this.menuBtnParent.prepend(this.menuBtn);
    }
    setDisplayErrorHandler(this.onError);

    this.menuElem = this.createMenuElement();

    this.updateItemElem = this.menuElem.querySelector(
      '.ytpa-menuitem--updates'
    );
    if (this.updateItemElem) {
      on(this.updateItemElem, 'click', this.hideUpdatesMessage);
    }

    this.warningItemElem = this.menuElem.querySelector(
      '.ytpa-menuitem--warning'
    );
    this.warningElem = this.warningItemElem.querySelector('.ytpa-warning');
    this.warningCloseBtn = this.warningItemElem.querySelector(
      '.ytpa-warning-close-btn'
    );
    if (this.warningCloseBtn) {
      on(this.warningCloseBtn, 'click', () => this.setWarning());
    }

    this.infoItemElem = this.menuElem.querySelector('.ytpa-menuitem--info');
    this.infoElem = this.infoItemElem.querySelector('.ytpa-info');

    const resetSettingsBtnElem = this.menuElem.querySelector(
      '.ytpa-reset-settings-btn'
    );
    on(resetSettingsBtnElem, 'click', async () => {
      if (
        !confirm(
          'Are you sure you want to reset ALL the settings and reload the watch page?'
        )
      )
        return;

      for (const setting of SettingsConfig) {
        this.saveStorageEntry(setting.name, undefined);
        if (setting.defaultKey) {
          this.saveStorageEntry(`${setting.name}-key`, undefined);
        }
      }
      await this.flushPendingStorageEntries();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this.reloadPage();
    });

    for (const label of this.menuElem.querySelectorAll(
      '.setting-range-datalist__label'
    )) {
      on(label, 'click', (e) => {
        const value = e.target.value;
        const name = e.target.parentNode.id.replace('snap-points-', '');
        const inputElem = this.menuElem.querySelector(
          `${getSettingQuerySelector(name)}-range`
        );
        inputElem.value = value;
        inputElem.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    for (const section of this.menuElem.querySelectorAll('.ytpa-section')) {
      on(section, 'click', async () => {
        const name = section.getAttribute('data-name');
        const value = !this[name];
        this.set(name, value);

        if (!value) {
          section.classList.remove('is-collapsed');
        }

        const sectionContent = section.nextElementSibling;
        sectionContent.style.opacity = '';
        let startHeight = value ? sectionContent.clientHeight ?? 0 : 0;
        let endHeight = value ? 0 : sectionContent.clientHeight ?? 0;
        sectionContent.style.opacity = '';
        sectionContent.style.height = `${startHeight}px`;
        sectionContent.style.marginBottom = value ? '0' : '-5px';
        sectionContent.style.paddingBottom = value ? '5px' : '0';
        sectionContent.style.overflow = 'hidden';
        sectionContent.style.position = 'relative';

        await new Promise((resolve) => setTimeout(resolve, 1));
        section.classList.add('is-collapsed-transition');
        sectionContent.style.transition =
          'height .4s ease-in-out, margin-bottom .4s ease-in-out, padding-bottom .4s ease-in-out';
        sectionContent.style.height = `${endHeight}px`;
        sectionContent.style.marginBottom = value ? '-5px' : '0';
        sectionContent.style.paddingBottom = value ? '0' : '5px';

        await new Promise((resolve) => setTimeout(resolve, 400));
        section.classList.remove('is-collapsed-transition');
        sectionContent.style.transition = '';
        sectionContent.style.height = '';
        sectionContent.style.marginBottom = '';
        sectionContent.style.paddingBottom = '';
        sectionContent.style.overflow = '';
        sectionContent.style.position = '';

        if (value) {
          section.classList.add('is-collapsed');
        }
      });
    }

    on(
      this.menuElem,
      'mousemove click dblclick contextmenu touchstart touchmove touchend',
      (e) => {
        e.stopPropagation();
      }
    );
    on(this.menuElem, 'contextmenu', (e) => {
      e.preventDefault();
    });

    this.menuElemParent.prepend(this.menuElem);

    this.bezelElem = this.createBezelElem();
    this.bezelTextElem = this.bezelElem.querySelector('text');
    this.menuElemParent.prepend(this.bezelElem);

    for (const setting of SettingsConfig) {
      const settingElem = this.menuElem.querySelector(
        getSettingQuerySelector(setting.name)
      );
      if (!settingElem) continue;

      const keyElem = settingElem.querySelector('.ytpa-menuitem-key');
      if (keyElem) {
        on(keyElem, 'click', (e) => {
          e.stopPropagation();
          e.preventDefault();
        });
        on(keyElem, 'focus', () => {
          // Select all
          const range = document.createRange();
          range.selectNodeContents(keyElem);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
        on(keyElem, 'keydown keyup keypress', (e) => {
          e.stopPropagation();
          e.preventDefault();
          keyElem.blur();

          const key = e.key.length === 1 ? e.key?.toUpperCase() : ' ';
          if (keyElem.textContent === key) return;

          keyElem.textContent = key;
          this.setKey(setting.name, key);
        });
        on(keyElem, 'blur', () => {
          // Deselect all
          const sel = window.getSelection();
          sel.removeAllRanges();
        });
      }

      if (setting.type === 'list') {
        const inputElem = this.menuElem.querySelector(
          `${getSettingQuerySelector(setting.name)}-range`
        );
        const valueElem = this.menuElem.querySelector(
          `${getSettingQuerySelector(setting.name)}-value`
        );

        const manualInputElem = this.menuElem.querySelector(
          `${getSettingQuerySelector(setting.name)}-manualinput`
        );
        if (manualInputElem) {
          on(manualInputElem, 'keydown keyup keypress', (e) => {
            e.stopPropagation();
          });
          const onChange = () => {
            if (inputElem.value === manualInputElem.value) return;
            inputElem.value = manualInputElem.value;
            inputElem.dispatchEvent(new Event('change'));
          };
          on(manualInputElem, 'change', onChange);
          on(manualInputElem, 'blur', onChange);
          on(manualInputElem, 'keypress', (e) => {
            if (e.key !== 'Enter') return;
            manualInputElem.blur();
          });
        }

        on(
          inputElem,
          'change mousemove dblclick contextmenu touchmove',
          async (e) => {
            if (e.type === 'mousemove' && e.buttons === 0) return;

            let value = parseFloat(inputElem.value);
            if (e.type === 'dblclick' || e.type === 'contextmenu') {
              value = SettingsConfig.find(
                (s) => s.name === setting.name
              ).default;
              if (setting.valuePoints) {
                value = setting.valuePoints.indexOf(value);
              }
            } else if (
              inputElem.value === inputElem.getAttribute('data-previous-value')
            ) {
              return;
            }
            inputElem.value = value;
            inputElem.setAttribute('data-previous-value', value);
            if (manualInputElem) {
              manualInputElem.value = inputElem.value;
            }
            if (setting.valuePoints) {
              value = setting.valuePoints[value];
            }

            if (this[setting.name] === value) return;

            this.set(setting.name, value);
            valueElem.textContent = this.getSettingListDisplayText(setting);

            if (setting.name === 'theme') {
              this.ambientlight.theming.updateTheme(true);
              return;
            }

            if (setting.name === 'colorConversionPatch') {
              this.ambientlight.updateHdr();
            }

            if (!this.advancedSettings) {
              if (setting.name === 'blur2') {
                const edgeValue =
                  value <= 5 ? 2 : value >= 42.5 ? 17 : value / 2.5;

                const edgeSetting = SettingsConfig.find(
                  (setting) => setting.name === 'edge'
                );
                const edgeInputElem = this.menuElem.querySelector(
                  `#setting-${edgeSetting.name}-range`
                );
                edgeInputElem.value = edgeValue;
                edgeInputElem.dispatchEvent(
                  new Event('change', { bubbles: true })
                );
              }
            }

            if (
              [
                'horizontalBarsClipPercentage',
                'verticalBarsClipPercentage',
              ].some((name) => name === setting.name)
            ) {
              if (!inputElem.dontResetControllerSetting) {
                const controllerSetting = {
                  horizontalBarsClipPercentage:
                    'detectHorizontalBarSizeEnabled',
                  verticalBarsClipPercentage: 'detectVerticalBarSizeEnabled',
                }[setting.name];
                if (this[controllerSetting]) {
                  const controllerInput = this.menuElem.querySelector(
                    `#setting-${controllerSetting}`
                  );
                  controllerInput.dontResetControlledSetting = true;
                  controllerInput.click();
                  return;
                }
              } else {
                inputElem.dontResetControllerSetting = false;
              }
              this.updateVisibility();

              this.ambientlight.barDetection.clear();
              if (this.enabled && this.webGL) {
                this.ambientlight.buffersCleared = true; // Force a buffer redraw because the buffer can be transferred to the bar detection worker
              }
            }

            if (
              (this.detectHorizontalBarSizeEnabled ||
                this.detectVerticalBarSizeEnabled) &&
              [
                'detectColoredHorizontalBarSizeEnabled',
                'barSizeDetectionAverageHistorySize',
                'detectHorizontalBarSizeOffsetPercentage',
                'barSizeDetectionAllowedElementsPercentage',
                'barSizeDetectionAllowedUnevenBarsPercentage',
              ].includes(setting.name)
            ) {
              this.ambientlight.barDetection.clear();
              if (this.enabled && this.webGL) {
                this.ambientlight.buffersCleared = true; // Force a buffer redraw because the buffer can be transferred to the bar detection worker
              }
            }

            if (
              [
                'headerShadowSize',
                'headerShadowOpacity',
                'headerFillOpacity',
                'headerImagesOpacity',
                'surroundingContentShadowSize',
                'surroundingContentShadowOpacity',
                'surroundingContentFillOpacity',
                'surroundingContentImagesOpacity',
                'pageBackgroundGreyness',
                'videoDebandingStrength',
                'debandingStrength',
                'debandingBlendMode',
                'videoShadowSize',
                'videoShadowOpacity',
              ].some((name) => name === setting.name) ||
              setting.name.startsWith('videoScale.')
            ) {
              this.ambientlight.updateStyles();
            }

            if (['frameFading'].some((name) => name === setting.name)) {
              if (value > 0) {
                if (this['framerateLimit'] !== 30) {
                  this.set('framerateLimit', 30, true);
                }
                if (this['frameBlending']) {
                  this.set('frameBlending', false, true);
                }
              } else {
                const defaultValue = SettingsConfig.find(
                  (s) => s.name === 'framerateLimit'
                ).default;
                if (this['framerateLimit'] !== defaultValue) {
                  this.set('framerateLimit', defaultValue, true);
                }
              }
              await this.updateProjectorWebGLCtx();
              this.updateVisibility();
            }

            if (['flickerReduction'].some((name) => name === setting.name)) {
              await this.updateBufferProjectorWebGLCtx();
              this.ambientlight.buffersCleared = true;
            }

            if (['framerateLimit'].some((name) => name === setting.name)) {
              if (this['frameBlending']) {
                this.set('frameBlending', false, true);
              }
              this.resetFrameFading();
              this.updateVisibility();
            }

            if (
              setting.name === 'vibrance' ||
              setting.name === 'spread' ||
              setting.name === 'edge'
            ) {
              this.ambientlight.canvassesInvalidated = true;
            }

            if (setting.name === 'spread' || setting.name === 'blur2') {
              if (this.ambientlight.chromiumBugVideoJitterWorkaround?.update)
                this.ambientlight.chromiumBugVideoJitterWorkaround.update();
            }

            if (setting.name === 'vibrance') {
              try {
                if (!(await this.ambientlight.projector.updateVibrance()))
                  return;
                this.setWarning('');
              } catch (ex) {
                this.ambientlight.projector.setWebGLWarning('change');
                throw ex;
              }
            }

            if (
              [
                'frameSync',
                'headerShadowSize',
                'headerShadowOpacity',
                'surroundingContentShadowSize',
                'surroundingContentShadowOpacity',
                'videoShadowSize',
              ].some((name) => name === setting.name)
            ) {
              this.updateVisibility();
            }

            if (
              ['colorSpace', 'colorBitDepth'].some(
                (name) => name === setting.name
              )
            ) {
              this.saveStorageEntry(setting.name, value);
              await this.flushPendingStorageEntries();
              await new Promise((resolve) => setTimeout(resolve, 1000));
              this.reloadPage();
              return;
            }

            this.ambientlight.sizesChanged = true;
            this.ambientlight.optionalFrame(true);
          }
        );
      } else if (setting.type === 'checkbox') {
        on(settingElem, 'dblclick contextmenu click', async (e) => {
          if (setting.disabled) {
            e.stopPropagation();
            e.preventDefault();
            return;
          }

          let value = !this[setting.name];
          if (e.type === 'dblclick' || e.type === 'contextmenu') {
            value = SettingsConfig.find((s) => s.name === setting.name).default;
            if (value === this[setting.name]) return;
          }

          if (
            [
              'energySaver',
              'videoOverlayEnabled',
              'frameBlending',
              'fixedPosition',
              'showFPS',
              'showFrametimes',
              'showResolutions',
              'showBarDetectionStats',
              'chromiumDirectVideoOverlayWorkaround',
              'chromiumBugVideoJitterWorkaround',
              'surroundingContentTextAndBtnOnly',
              'headerTransparentEnabled',
              'horizontalBarsClipPercentageReset',
              'detectHorizontalBarSizeEnabled',
              'detectColoredHorizontalBarSizeEnabled',
              'detectVerticalBarSizeEnabled',
              'detectVideoFillScaleEnabled',
              'directionTopEnabled',
              'directionRightEnabled',
              'directionBottomEnabled',
              'directionLeftEnabled',
              'advancedSettings',
              'relatedScrollbar',
              'hideScrollbar',
              'immersiveTheaterView',
              'webGL',
              'layoutPerformanceImprovements',
              'prioritizePageLoadSpeed',
              'enableInPictureInPicture',
              'enableInEmbed',
              'enableInVRVideos',
            ].some((name) => name === setting.name)
          ) {
            if (setting.name !== 'webGL') this.set(setting.name, value);
            this.menuElem
              .querySelector(getSettingQuerySelector(setting.name))
              .setAttribute('aria-checked', value);
          }

          if (
            ['chromiumBugVideoJitterWorkaround'].some(
              (name) => name === setting.name
            )
          ) {
            this.ambientlight.applyChromiumBugVideoJitterWorkaround();
          }

          if (
            ['chromiumDirectVideoOverlayWorkaround'].some(
              (name) => name === setting.name
            )
          ) {
            this.ambientlight.applyChromiumBugDirectVideoOverlayWorkaround();
          }
          if (
            ['detectVideoFillScaleEnabled'].some(
              (name) => name === setting.name
            )
          ) {
            this.displayBezel(setting.key, !value);
          }

          if (
            [
              'detectHorizontalBarSizeEnabled',
              'detectVerticalBarSizeEnabled',
            ].some((name) => name === setting.name)
          ) {
            this.displayBezel(setting.key, !value);
            if (!settingElem.dontResetControlledSetting) {
              const controlledSettingName = {
                detectHorizontalBarSizeEnabled: 'horizontalBarsClipPercentage',
                detectVerticalBarSizeEnabled: 'verticalBarsClipPercentage',
              }[setting.name];
              const percentageSetting = SettingsConfig.find(
                (setting) => setting.name === controlledSettingName
              );
              const percentageInputElem = this.menuElem.querySelector(
                `#setting-${percentageSetting.name}-range`
              );
              if (percentageInputElem.value != percentageSetting.default) {
                percentageInputElem.dontResetControllerSetting = true;
                percentageInputElem.value = percentageSetting.default;
                percentageInputElem.dispatchEvent(
                  new Event('change', { bubbles: true })
                );
                return;
              }
            } else {
              settingElem.dontResetControlledSetting = false;
            }
          }

          if (setting.name === 'enabled') {
            this.ambientlight.toggleEnabled(value);
          }

          if (
            setting.name === 'layoutPerformanceImprovements' &&
            this.enabled
          ) {
            this.ambientlight.updateLayoutPerformanceImprovements();
          }

          const html = document.documentElement;
          if (setting.name === 'relatedScrollbar' && this.enabled) {
            if (value)
              html.setAttribute('data-ambientlight-related-scrollbar', true);
            else html.removeAttribute('data-ambientlight-related-scrollbar');
          }

          if (setting.name === 'hideScrollbar' && this.enabled) {
            if (value)
              html.setAttribute('data-ambientlight-hide-scrollbar', true);
            else html.removeAttribute('data-ambientlight-hide-scrollbar');
            this.ambientlight.updateVideoPlayerSize();
          }

          if (setting.name === 'immersiveTheaterView' && this.enabled) {
            await this.ambientlight.updateImmersiveMode();
          }

          if (setting.name === 'frameBlending') {
            if (value) {
              if (this['framerateLimit'] !== 0) {
                this.set('framerateLimit', 0, true);
              }
              this.resetFrameFading();
            } else {
              const defaultValue = SettingsConfig.find(
                (s) => s.name === 'framerateLimit'
              ).default;
              if (this['framerateLimit'] !== defaultValue) {
                this.set('framerateLimit', defaultValue, true);
              }
            }
            this.ambientlight.sizesChanged = true;
            this.updateVisibility();
          }
          if (['energySaver'].includes(setting.name)) {
            if (value) {
              this.ambientlight.calculateAverageVideoFramesDifference();
            } else {
              this.ambientlight.resetAverageVideoFramesDifference();
            }
          }

          if (
            [
              'videoOverlayEnabled',
              'detectVideoFillScaleEnabled',
              'directionTopEnabled',
              'directionRightEnabled',
              'directionBottomEnabled',
              'directionLeftEnabled',
            ].includes(setting.name)
          ) {
            this.updateVisibility();
            this.ambientlight.sizesChanged = true;
          }

          if (
            [
              'detectHorizontalBarSizeEnabled',
              'detectVerticalBarSizeEnabled',
              'detectColoredHorizontalBarSizeEnabled',
            ].some((name) => name === setting.name)
          ) {
            this.ambientlight.barDetection.clear();
            if (this.enabled && this.webGL) {
              this.ambientlight.buffersCleared = true; // Force a buffer redraw because the buffer can be transferred to the bar detection worker
            }
            this.ambientlight.sizesChanged = true;
            this.updateVisibility();
          }

          if (setting.name === 'advancedSettings') {
            if (value) {
              this.menuElem.classList.add(
                'ytpa-ambientlight-settings-menu--advanced'
              );
            } else {
              this.menuElem.classList.remove(
                'ytpa-ambientlight-settings-menu--advanced'
              );
            }
            this.updateVisibility();
          }

          if (
            [
              'showFPS',
              'showFrametimes',
              'showResolutions',
              'showBarDetectionStats',
              'detectHorizontalBarSizeEnabled',
              'detectVerticalBarSizeEnabled',
            ].some((name) => name === setting.name)
          ) {
            if (value) {
              this.ambientlight.stats.update();
            } else {
              this.ambientlight.stats.hide(true);
            }
          }

          if (
            ['surroundingContentTextAndBtnOnly', 'fixedPosition'].some(
              (name) => name === setting.name
            )
          ) {
            this.ambientlight.updateStyles();
            this.ambientlight.optionalFrame(true);
            return;
          }

          if (setting.name === 'webGL') {
            this.saveStorageEntry('webGL', value);
            await this.flushPendingStorageEntries();
            await new Promise((resolve) => setTimeout(resolve, 1000));
            this.reloadPage();
            return;
          }

          this.ambientlight.sizesInvalidated = true;
          this.ambientlight.optionalFrame(true);
        });
      }
    }

    this.updateVisibility();
    on(
      document,
      'visibilitychange',
      this.handleDocumentVisibilityChange,
      false
    );
  }

  createBezelElem() {
    const elem = document.createElement('div');
    elem.className = 'ytal-bezel ytp-bezel ytal-bezel--no-animation';
    elem.setAttribute('role', 'status');

    const iconElem = document.createElement('div');
    iconElem.className = 'ytp-bezel-icon';

    const xmlns = 'http://www.w3.org/2000/svg';

    const svgElem = document.createElementNS(xmlns, 'svg');
    svgElem.setAttributeNS(null, 'height', '100%');
    svgElem.setAttributeNS(null, 'width', '100%');
    svgElem.setAttributeNS(null, 'version', '1.1');
    svgElem.setAttributeNS(null, 'viewBox', '0 0 36 36');

    const textElem = document.createElementNS(xmlns, 'text');
    textElem.setAttributeNS(null, 'class', 'ytp-svg-fill');
    textElem.setAttributeNS(null, 'x', '50%');
    textElem.setAttributeNS(null, 'y', '59%');
    textElem.setAttributeNS(null, 'dominant-baseline', 'middle');
    textElem.setAttributeNS(null, 'text-anchor', 'middle');

    svgElem.appendChild(textElem);
    iconElem.appendChild(svgElem);
    elem.appendChild(iconElem);

    return elem;
  }

  createMenuButton() {
    const elem = document.createElement('button');
    elem.className = 'ytp-button ytp-ambientlight-settings-button is-loading';
    elem.setAttribute('aria-owns', 'ytp-id-190');

    const xmlns = 'http://www.w3.org/2000/svg';

    const svgElem = document.createElementNS(xmlns, 'svg');
    svgElem.setAttributeNS(null, 'height', '100%');
    svgElem.setAttributeNS(null, 'width', '100%');
    svgElem.setAttributeNS(null, 'version', '1.1');
    svgElem.setAttributeNS(null, 'viewBox', '0 0 36 36');

    const useElem = document.createElementNS(xmlns, 'use');
    useElem.setAttributeNS(null, 'class', 'ytp-svg-shadow');
    useElem.setAttributeNS(null, 'href', '#ytp-ambientlight-btn-icon');

    const pathElem = document.createElementNS(xmlns, 'path');
    pathElem.setAttributeNS(null, 'id', 'ytp-ambientlight-btn-icon');
    pathElem.setAttributeNS(null, 'fill', '#fff');
    pathElem.setAttributeNS(
      null,
      'd',
      'm 23.94,18.78 c .03,-0.25 .05,-0.51 .05,-0.78 0,-0.27 -0.02,-0.52 -0.05,-0.78 l 1.68,-1.32 c .15,-0.12 .19,-0.33 .09,-0.51 l -1.6,-2.76 c -0.09,-0.17 -0.31,-0.24 -0.48,-0.17 l -1.99,.8 c -0.41,-0.32 -0.86,-0.58 -1.35,-0.78 l -0.30,-2.12 c -0.02,-0.19 -0.19,-0.33 -0.39,-0.33 l -3.2,0 c -0.2,0 -0.36,.14 -0.39,.33 l -0.30,2.12 c -0.48,.2 -0.93,.47 -1.35,.78 l -1.99,-0.8 c -0.18,-0.07 -0.39,0 -0.48,.17 l -1.6,2.76 c -0.10,.17 -0.05,.39 .09,.51 l 1.68,1.32 c -0.03,.25 -0.05,.52 -0.05,.78 0,.26 .02,.52 .05,.78 l -1.68,1.32 c -0.15,.12 -0.19,.33 -0.09,.51 l 1.6,2.76 c .09,.17 .31,.24 .48,.17 l 1.99,-0.8 c .41,.32 .86,.58 1.35,.78 l .30,2.12 c .02,.19 .19,.33 .39,.33 l 3.2,0 c .2,0 .36,-0.14 .39,-0.33 l .30,-2.12 c .48,-0.2 .93,-0.47 1.35,-0.78 l 1.99,.8 c .18,.07 .39,0 .48,-0.17 l 1.6,-2.76 c .09,-0.17 .05,-0.39 -0.09,-0.51 l -1.68,-1.32 0,0 z m -5.94,2.01 c -1.54,0 -2.8,-1.25 -2.8,-2.8 0,-1.54 1.25,-2.8 2.8,-2.8 1.54,0 2.8,1.25 2.8,2.8 0,1.54 -1.25,2.8 -2.8,2.8 l 0,0 z'
    );

    svgElem.appendChild(useElem);
    svgElem.appendChild(pathElem);
    elem.appendChild(svgElem);

    return elem;
  }

  async updateBufferProjectorWebGLCtx() {
    if (!this.ambientlight.projectorBuffer?.ctx?.initCtx) return; // Can be undefined when migrating from previous settings

    try {
      await new Promise((resolve) => setTimeout(resolve, 0)); // Await for update sizes
      if (!this.ambientlight.projectorBuffer?.ctx?.initCtx) return; // Can be undefined when migrating from previous settings

      if (!(await this.ambientlight.projectorBuffer.ctx.initCtx(true))) return;
      this.setWarning('');
    } catch (ex) {
      this.ambientlight.projectorBuffer.ctx.setWebGLWarning('change');
      throw ex;
    }
  }

  resetFrameFading() {
    const frameFadingDefaultValue = SettingsConfig.find(
      (s) => s.name === 'frameFading'
    )?.default;
    if (this['frameFading'] === frameFadingDefaultValue) return;

    this.set('frameFading', frameFadingDefaultValue, true);
    this.updateProjectorWebGLCtx();
  }

  async updateProjectorWebGLCtx() {
    if (!this.ambientlight.projector?.initCtx) return; // Can be undefined when migrating from previous settings

    try {
      await new Promise((resolve) => setTimeout(resolve, 0)); // Await for update sizes
      if (!this.ambientlight.projector?.initCtx) return; // Can be undefined when migrating from previous settings

      if (!(await this.ambientlight.projector.initCtx(true))) return;
      this.setWarning('');
    } catch (ex) {
      this.ambientlight.projector.setWebGLWarning('change');
      throw ex;
    }
  }

  reloadPage() {
    const search = new URLSearchParams(location.search);
    const time = Math.max(
      0,
      Math.floor(this.ambientlight.videoElem?.currentTime || 0) - 2
    );
    time ? search.set('t', time) : search.delete('t');
    history.replaceState(
      null,
      null,
      `${location.pathname}?${search.toString()}`
    );
    location.reload();
  }

  frameFadingValueToDuration(value) {
    if (!value) return 'Off';

    const frames = Math.pow(value, 2);
    const seconds = frames / 30;
    if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
    return `${Math.round(seconds * 10) / 10} seconds`;
  }

  getSettingListDisplayText(setting) {
    const value = this[setting.name];
    if (setting.name === 'frameSync') {
      return {
        [FRAMESYNC_DECODEDFRAMES]: 'Decoded framerate',
        [FRAMESYNC_DISPLAYFRAMES]: 'Display framerate',
        [FRAMESYNC_VIDEOFRAMES]: 'Video framerate',
      }[value];
    }
    if (setting.name === 'debandingBlendMode') {
      return {
        [DEBANDING_BLEND_MODE_LCD]: 'LCD',
        [DEBANDING_BLEND_MODE_OLED]: 'OLED',
      }[value];
    }
    if (setting.name === 'colorSpace') {
      return {
        [COLORSPACE_AUTO]: 'Auto',
        [COLORSPACE_SRGB]: 'sRGB',
        [COLORSPACE_DISPLAY_P3]: 'Display P3 D65',
        [COLORSPACE_REC_2020_PQ]: 'Rec. 2100 PQ\n(Rec. 2020 / HDR10)',
        [COLORSPACE_REC_2020_HLG]: 'Rec. 2100 HLG\n(Rec. 2020 / HDR10)',
      }[value];
    }
    if (setting.name === 'colorBitDepth') {
      return {
        [COLORBITDEPTH_AUTO]: 'Auto',
        [COLORBITDEPTH_8]: '8 bits',
        [COLORBITDEPTH_16]: '16 bits',
        [COLORBITDEPTH_32]: '32 bits',
      }[value];
    }
    if (setting.name === 'colorConversionPatch') {
      return {
        [COLORCONVERSIONPATCH_AUTO]: 'Auto',
        [COLORCONVERSIONPATCH_ENABLED]: 'Enabled',
        [COLORCONVERSIONPATCH_DISABLED]: 'Disabled',
      }[value];
    }
    if (setting.name === 'barSizeDetectionAverageHistorySize') {
      return this.barSizeDetectionAverageHistorySize == 1
        ? `1 frame`
        : `${value} frames`;
    }
    if (setting.name === 'framerateLimit') {
      return this.framerateLimit == 0 ? 'max fps' : `${value} fps`;
    }
    if (setting.name === 'frameFading') {
      return this.frameFadingValueToDuration(value);
    }
    if (setting.name === 'theme' || setting.name === 'enableInViews') {
      const snapPoint = setting.snapPoints.find(
        (point) => point.value === value
      );
      return snapPoint?.hiddenLabel || snapPoint?.label;
    }
    return `${value}${setting.unit || '%'}`;
  }

  menuOnCloseScrollBottom = -1;
  menuOnCloseScrollHeight = 1;
  onSettingsBtnClicked = async () => {
    const isOpen =
      this.menuElem.classList.contains('is-visible') ||
      this.menuElem.classList.contains('fade-out');
    if (isOpen) return;

    while (!this.ambientlight.initializedTime) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.menuElem.classList.remove('fade-out');
    this.menuElem.classList.add('is-visible');

    if (this.menuOnCloseScrollBottom !== -1) {
      const percentage =
        this.menuElem.scrollHeight / this.menuOnCloseScrollHeight;
      this.menuElem.scrollTop =
        this.menuElem.scrollHeight -
        this.menuElem.offsetHeight -
        this.menuOnCloseScrollBottom * percentage;
    }

    this.menuBtn.setAttribute('aria-expanded', true);

    if (this.ambientlight.videoPlayerElem) {
      this.ambientlight.videoPlayerElem.classList.add(
        'ytp-ambientlight-settings-shown'
      );
    }

    on(document.body, 'click', this.onCloseMenu, { capture: true });

    setTimeout(() => {
      this.scrollToWarning();
    }, 100);
  };

  onCloseMenu = (e) => {
    const isOpen =
      this.menuElem.classList.contains('is-visible') ||
      this.menuElem.classList.contains('fade-out');
    if (!isOpen) return;

    if (this.menuElem === e.target || this.menuElem.contains(e.target)) return;

    e.stopPropagation();

    this.menuOnCloseScrollBottom = !this.menuElem.scrollTop
      ? -1
      : this.menuElem.scrollHeight -
        this.menuElem.offsetHeight -
        this.menuElem.scrollTop;
    this.menuOnCloseScrollHeight = this.menuElem.scrollHeight;

    on(this.menuElem, 'animationend', this.onSettingsFadeOutEnd);
    this.onSettingsFadeOutEndTimeout = setTimeout(() => {
      if (!this.onSettingsFadeOutEndTimeout) return;
      this.onSettingsFadeOutEndTimeout = undefined;
      this.onSettingsFadeOutEnd();
    }, 500);
    this.menuElem.classList.add('fade-out');

    this.menuBtn.setAttribute('aria-expanded', false);

    if (this.ambientlight.videoPlayerElem) {
      this.ambientlight.videoPlayerElem.classList.remove(
        'ytp-ambientlight-settings-shown'
      );
    }

    off(document.body, 'click', this.onCloseMenu);

    this.hideUpdatesBadge();
  };

  onSettingsFadeOutEnd = () => {
    off(this.menuElem, 'animationend', this.onSettingsFadeOutEnd);
    if (this.onSettingsFadeOutEndTimeout) {
      clearTimeout(this.onSettingsFadeOutEndTimeout);
      this.onSettingsFadeOutEndTimeout = undefined;
    }

    this.menuElem.classList.remove('fade-out', 'is-visible');
  };

  onLoaded = () => {
    if (!this.menuBtn.classList.contains('is-loading')) return;

    this.menuBtn.classList.remove('is-loading');
    this.settingsMenuBtnTooltipText.textContent = 'Ambient light settings';

    this.showUpdatesMessage();
  };

  onError = (ex) => {
    const message = ex?.message ?? typeof ex;
    if (this.menuBtn?.classList?.contains?.('is-loading')) {
      this.menuBtn.classList.add('has-warning');
      this.settingsMenuBtnTooltipText.textContent = `Ambient light failed to load:\n${message}`;
    } else {
      this.setWarning(`An error occured:\n${message}`);
    }
  };

  controlledSettings = [
    {
      name: 'horizontalBarsClipPercentage',
      controllers: ['detectHorizontalBarSizeEnabled'],
    },
    {
      name: 'verticalBarsClipPercentage',
      controllers: ['detectVerticalBarSizeEnabled'],
    },
    {
      name: 'framerateLimit',
      controllers: ['frameBlending', 'frameFading'],
    },
    {
      name: 'frameBlending',
      controllers: ['frameFading'],
    },
    {
      name: 'frameFading',
      controllers: ['frameBlending'],
    },
  ];
  optionalSettings = [
    {
      names: ['detectHorizontalBarSizeEnabled', 'detectVerticalBarSizeEnabled'],
      visible: () => this.ambientlight.getImageDataAllowed,
    },
    {
      names: [
        'detectColoredHorizontalBarSizeEnabled',
        'barSizeDetectionAverageHistorySize',
        'detectHorizontalBarSizeOffsetPercentage',
        'barSizeDetectionAllowedElementsPercentage',
        'barSizeDetectionAllowedUnevenBarsPercentage',
      ],
      visible: () =>
        this.ambientlight.getImageDataAllowed &&
        (this.detectHorizontalBarSizeEnabled ||
          this.detectVerticalBarSizeEnabled),
    },
    {
      names: ['frameBlending'],
      visible: () => this.frameSync !== 1,
    },
    {
      names: ['frameBlendingSmoothness'],
      visible: () => this.frameBlending && this.frameSync !== 1,
    },
    {
      names: ['chromiumBugVideoJitterWorkaround'],
      visible: () =>
        this.ambientlight.enableChromiumBugVideoJitterWorkaround && this.webGL,
    },
    {
      names: ['videoOverlaySyncThreshold'],
      visible: () => this.videoOverlayEnabled,
    },
    {
      names: ['headerShadowOpacity'],
      visible: () => this.headerShadowSize,
    },
    {
      names: ['surroundingContentShadowOpacity'],
      visible: () => this.surroundingContentShadowSize,
    },
    {
      names: ['surroundingContentTextAndBtnOnly'],
      visible: () =>
        (this.surroundingContentShadowSize &&
          this.surroundingContentShadowOpacity) ||
        (this.headerShadowSize && this.headerShadowOpacity),
    },
    {
      names: ['videoShadowOpacity'],
      visible: () => this.videoShadowSize,
    },
    {
      names: [
        'resolution',
        'vibrance',
        'frameFading',
        'flickerReduction',
        'fixedPosition',
      ],
      visible: () => this.webGL,
    },
    {
      names: ['chromiumDirectVideoOverlayWorkaround'],
      visible: () =>
        this.ambientlight.enableChromiumBugDirectVideoOverlayWorkaround,
    },
    {
      names: ['framerateLimit'],
      visible: () => !this.ambientlight.isVrVideo,
    },
    {
      names: ['showBarDetectionStats'],
      visible: () =>
        this.detectHorizontalBarSizeEnabled ||
        this.detectVerticalBarSizeEnabled,
    },
    {
      names: [`webGL`],
      visible: () => this.advancedSettings || !this.webGL,
    },
    {
      names: [`videoScale.${VIEW_SMALL}`],
      visible: () => this.ambientlight.view === VIEW_SMALL,
    },
    {
      names: [`videoScale.${VIEW_THEATER}`],
      visible: () => this.ambientlight.view === VIEW_THEATER,
    },
    {
      names: [`videoScale.${VIEW_FULLSCREEN}`],
      visible: () => this.ambientlight.view === VIEW_FULLSCREEN,
    },
  ];
  updateVisibility() {
    for (const setting of this.controlledSettings) {
      if (
        !SettingsConfig.find(
          (settingConfig) => settingConfig.name === setting.name
        )
      )
        continue; // Skip removed settings

      const valueElem = this.menuElem.querySelector(
        `${getSettingQuerySelector(
          setting.name
        )}.ytp-menuitem, ${getSettingQuerySelector(setting.name)} .ytp-menuitem`
      );
      const controlledByName = setting.controllers.find((name) => this[name]);
      const controlledByLabel = SettingsConfig.find(
        (setting) =>
          setting.name === controlledByName &&
          (this.advancedSettings || !setting.advanced)
      )?.label;
      if (controlledByLabel) {
        valueElem.classList.add('is-controlled-by-setting');
        valueElem.setAttribute(
          'title',
          `Controlled by the "${controlledByLabel}" setting.\nManually adjusting this setting will turn off "${controlledByLabel}"`
        );
      } else {
        valueElem.classList.remove('is-controlled-by-setting');
        valueElem.setAttribute('title', '');
      }
    }
    const isMenuOpen = this.menuElem.classList.contains('is-visible');

    for (const optionalGroup of this.optionalSettings) {
      const optionalSettings = optionalGroup.names
        .map((name) =>
          this.menuElem.querySelector(getSettingQuerySelector(name))
        )
        .filter((setting) => setting);
      const visible = optionalGroup.visible();
      for (const optionalSetting of optionalSettings) {
        if (
          !optionalSetting.animationTimeout &&
          optionalSetting.style.display === (visible ? '' : 'none')
        )
          continue;

        if (optionalSetting.animationTimeout) {
          clearTimeout(optionalSetting.animationTimeout);
        }

        if (!isMenuOpen) {
          optionalSetting.style.display = visible ? '' : 'none';
        } else {
          this.fadeSettingElement(optionalSetting, visible);
        }
      }
    }
  }

  async fadeSettingElement(elem, visible) {
    await new Promise((resolve) => {
      elem.style.display = elem.classList.contains('ytp-menuitem')
        ? 'flex'
        : 'block'; // overrides .ytpa-section.is-collapsed selector
      const height = elem.clientHeight ?? 0;
      elem.style.marginBottom = visible ? `-${height}px` : '0px';
      elem.style.transformOrigin = '0% 0%';
      elem.style.transform = visible ? 'scaleY(0%)' : 'scaleY(100%)';

      elem.animationTimeout = raf(() => {
        elem.style.transition =
          'transform .3s ease-in-out, margin-bottom .3s ease-in-out';
        elem.style.willChange = 'transform';
        elem.style.transform = visible ? 'scaleY(100%)' : 'scaleY(0%)';
        elem.style.marginBottom = visible ? '0px' : `-${height}px`;

        let timeout = setTimeout(() => {
          timeout = undefined;
          resolve();
        }, 500);

        elem.animationTimeout = setTimeout(() => {
          elem.animationTimeout = undefined;
          if (elem.style.transition === '') return;

          elem.style.display = visible ? '' : 'none';
          elem.style.transition = '';
          elem.style.transformOrigin = '';
          elem.style.transform = '';
          elem.style.marginBottom = '';
          elem.style.willChange = '';

          if (timeout) clearTimeout(timeout);
          resolve();
        }, 300);
      });
    });
  }

  setKey(name, key) {
    const setting =
      SettingsConfig.find((setting) => setting.name === name) || {};
    const clear = key === undefined;
    if (clear) key = setting.defaultKey;

    setting.key = key;
    this.saveStorageEntry(`${setting.name}-key`, clear ? undefined : key);
  }

  set(name, value, updateUI, dontSave = false) {
    const clear = value === undefined;
    if (clear)
      value = SettingsConfig.find(
        (setting) => setting.name === name
      )?.defaultValue;

    const changed = this[name] !== value;
    this[name] = value;

    // Migrated to blur2
    if (name === 'blur') value = Math.round((value - 30) * 10) / 10; // Prevent rounding error
    // Migrated to spreadFadeStart
    if (name === 'bloom') value = Math.round((value - 7) * 10) / 10; // Prevent rounding error

    if (!dontSave && (clear || changed)) {
      this.saveStorageEntry(name, clear ? undefined : value);
    }

    if (updateUI) {
      this.updateUI(name);
    }
  }

  updateUI(name) {
    const setting =
      SettingsConfig.find((setting) => setting.name === name) || {};
    if (setting.type === 'checkbox') {
      const checkboxInput = this.menuElem.querySelector(
        getSettingQuerySelector(name)
      );
      if (checkboxInput) {
        checkboxInput.setAttribute(
          'aria-checked',
          this[name] ? 'true' : 'false'
        );
      }
    } else if (setting.type === 'list') {
      const rangeInput = this.menuElem.querySelector(
        `${getSettingQuerySelector(name)}-range`
      );
      if (rangeInput) {
        rangeInput.value = this.getInputRangeValue(name);
        rangeInput.setAttribute('data-previous-value', rangeInput.value);
        this.menuElem.querySelector(
          `${getSettingQuerySelector(name)}-value`
        ).textContent = this.getSettingListDisplayText(setting);
        const manualInput = this.menuElem.querySelector(
          `${getSettingQuerySelector(name)}-manualinput`
        );
        if (manualInput) {
          manualInput.value = rangeInput.value;
        }
      }
    }
  }

  getInputRangeValue(name) {
    const setting =
      SettingsConfig.find((setting) => setting.name === name) || {};
    if (setting.valuePoints) {
      return setting.valuePoints.indexOf(this[name]);
    } else {
      return this[name];
    }
  }

  clickUI(name) {
    this.menuElem.querySelector(getSettingQuerySelector(name)).click();
  }

  processStorageEntry(name, value) {
    const setting =
      SettingsConfig.find((setting) => setting.name === name) || {};
    if (value == null) {
      value = setting.default;
    } else if (setting.type === 'checkbox' || setting.type === 'section') {
      value =
        value === 'true' || // localStorage
        value === true; // storage.local
    } else if (setting.type === 'list') {
      value = parseFloat(value);

      // Migrated to blur2
      if (name === 'blur') value = Math.round((value + 30) * 10) / 10; // Prevent rounding error

      // Migrated to spreadFadeStart
      if (name === 'bloom') value = Math.round((value + 7) * 10) / 10; // Prevent rounding error

      if (name === 'frameSync' && value >= 50) {
        value = {
          50: FRAMESYNC_DECODEDFRAMES,
          100: FRAMESYNC_DISPLAYFRAMES,
          150: FRAMESYNC_VIDEOFRAMES,
        }[value];
      }
    }

    return value;
  }

  pendingStorageEntries = {};
  saveStorageEntry(name, value) {
    this.pendingStorageEntries[name] = value;
    if (this.saveStorageEntryTimeout)
      clearTimeout(this.saveStorageEntryTimeout);

    this.saveStorageEntryTimeout = setTimeout(
      function saveStorageEntryTimeout() {
        delete this.saveStorageEntryTimeout;
        this.flushPendingStorageEntries();
      }.bind(this),
      500
    );
  }

  async flushPendingStorageEntries() {
    try {
      if (this.saveStorageEntryTimeout)
        clearTimeout(this.saveStorageEntryTimeout);

      const names = Object.keys(this.pendingStorageEntries);
      for (const name of names) {
        await storage.set(
          `setting-${name}`,
          this.pendingStorageEntries[name],
          true
        );
        delete this.pendingStorageEntries[name];
      }
    } catch (ex) {
      if (ex.message.includes('QuotaExceededError')) {
        this.setWarning(
          'The changes could not be saved because the settings have changed too often.\nWait a few seconds...'
        );
        return;
      }

      if (ex.message === 'uninstalled') {
        this.setWarning(
          'The changes could not be saved because the extension has been updated.\nRefresh the webpage to reload the updated extension.'
        );
        return;
      }

      if (ex.message !== 'An unexpected error occurred')
        SentryReporter.captureException(ex);

      this.logStorageWarningOnce(
        `Failed to save settings ${JSON.stringify(
          this.pendingStorageEntries
        )}: ${ex.message}`
      );
    }
  }

  logStorageWarningOnce(...args) {
    if (this.loggedStorageWarning) return;

    console.warn(...args);
    this.loggedStorageWarning = true;
  }

  getKeys = () => ({
    enabled: SettingsConfig.find((setting) => setting.name === 'enabled').key,
    detectHorizontalBarSizeEnabled: SettingsConfig.find(
      (setting) => setting.name === 'detectHorizontalBarSizeEnabled'
    ).key,
    detectVerticalBarSizeEnabled: SettingsConfig.find(
      (setting) => setting.name === 'detectVerticalBarSizeEnabled'
    ).key,
    detectVideoFillScaleEnabled: SettingsConfig.find(
      (setting) => setting.name === 'detectVideoFillScaleEnabled'
    ).key,
  });

  displayBezelForSetting(name) {
    const key = SettingsConfig.find((setting) => setting.name === name).key;
    const strike = !this[name];
    this.displayBezel(key, strike);
  }

  displayBezel(text, strike = false) {
    if (this.onBezelElemAnimationEndTimeout) {
      this.onBezelElemAnimationEnd();
    }

    this.bezelElem.classList.add('ytal-bezel--no-animation');
    setTimeout(() => {
      this.bezelElem.classList.toggle('ytal-bezel--strike', strike);
      this.bezelTextElem.textContent = text;

      on(this.bezelElem, 'animationend', this.onBezelElemAnimationEnd);
      this.onBezelElemAnimationEndTimeout = setTimeout(() => {
        this.onBezelElemAnimationEndTimeout = undefined;
        this.onBezelElemAnimationEnd();
      }, 1000);

      this.bezelElem.classList.remove('ytal-bezel--no-animation');
    }, 1);
  }

  onBezelElemAnimationEnd = () => {
    off(this.bezelElem, 'animationend', this.onBezelElemAnimationEnd);
    if (this.onBezelElemAnimationEndTimeout) {
      clearTimeout(this.onBezelElemAnimationEndTimeout);
      this.onBezelElemAnimationEndTimeout = undefined;
    }
    this.bezelElem.classList.add('ytal-bezel--no-animation');
  };

  updateAverageVideoFramesDifferenceInfo = () => {
    if (!this.menuElem) return;

    let message = '';
    if (this.energySaver) {
      if (this.ambientlight.averageVideoFramesDifference < 0.002) {
        message =
          'Detected a still image as video\nThe framerate has been limited to: 0.2 fps\n\nLimited by the advanced setting:\nQuality > Save energy on static videos';
      } else if (this.ambientlight.averageVideoFramesDifference < 0.0175) {
        message =
          'Detected only small movements in the video\nThe framerate has been limited to: 1 fps\n\nLimited by the advanced setting:\nQuality > Save energy on static videos';
      }
    }

    this.infoElem.textContent = message;
    this.infoItemElem.style.display = message ? '' : 'none';
  };

  showUpdatesMessage = async () => {
    try {
      if (!version) return;

      let entries;
      try {
        entries = (await storage.get(['shown-version-updates'], true)) || {};
      } catch {
        return;
      }
      const installedVersion = entries['shown-version-updates'];
      if (installedVersion === version) return;

      if (!this.updateItemElem) return;

      this.updateItemElem.style.display = '';
      this.menuBtn.classList.toggle('has-updates', true);
      this.menuBtn.title =
        "Ambient light has been updated with new settings\nClick to see what's new";
      this.showingUpdatesMessage = true;
    } catch (ex) {
      SentryReporter.captureException(ex);
    }
  };

  hideUpdatesMessage = () => {
    if (this.updateItemElem.style.display === 'none') return;

    this.updateItemElem.style.display = 'none';
    this.showingUpdatesMessage = undefined;
    this.hideUpdatesBadge();
  };

  hideUpdatesBadge = () => {
    if (!this.menuBtn.classList.contains('has-updates')) return;
    this.menuBtn.classList.toggle('has-updates', false);
    this.menuBtn.title = '';

    storage.set('shown-version-updates', version, false);
  };

  handleDocumentVisibilityChange = () => {
    const isPageHidden = document.visibilityState === 'hidden';
    if (isPageHidden) return;

    setTimeout(() => {
      if (!this.pendingWarning) return;

      this.pendingWarning();
    }, 1); // Give ambient light the time to clear existing warnings
  };

  setWarning = (message, optional = false, icon = true) => {
    if (!this.menuElem || this.ambientlight.isPageHidden) {
      this.pendingWarning = () => this.setWarning(message, optional);
      return;
    } else {
      this.pendingWarning = undefined;
    }

    if (optional && this.warningElem.textContent.length) return;
    if (this.warningElem.textContent === message) return;

    this.warningItemElem.style.display = message ? '' : 'none';
    this.warningElem.textContent = message;
    this.menuBtn.classList.toggle('has-warning', icon && !!message);
    this.scrollToWarningQueued = !!message;
    if (!message) return;

    this.scrollToWarning();
  };

  updateHdr() {
    if (this.ambientlight.isHdr) {
      this.menuElem.classList.add('ytpa-ambientlight-settings-menu--hdr');
    } else {
      this.menuElem.classList.remove('ytpa-ambientlight-settings-menu--hdr');
    }
  }

  scrollToWarning() {
    if (!this.warningElem.textContent || !this.scrollToWarningQueued) return;

    this.scrollToWarningQueued = false;
    this.menuElem.scrollTo({
      behavior: 'smooth',
      top: 0,
    });
  }
}
