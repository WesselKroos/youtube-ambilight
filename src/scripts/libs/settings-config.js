import { supportsColorMix, supportsWebGL } from './generic';
import { getBrowser } from './utils';
import { t } from './i18n';

const SettingsConfig = [
  {
    type: 'section',
    label: t('setting_sectionSettingsCollapsed_label'),
    name: 'sectionSettingsCollapsed',
    default: true,
  },
  {
    name: 'advancedSettings',
    label: t('setting_advancedSettings_label'),
    type: 'checkbox',
    default: false,
  },
  {
    type: 'section',
    label: t('setting_sectionStatsCollapsed_label'),
    name: 'sectionStatsCollapsed',
    default: true,
    advanced: true,
  },
  {
    name: 'showFPS',
    label: t('setting_showFPS_label'),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'showFrametimes',
    label: t('setting_showFrametimes_label'),
    description: t('setting_showFrametimes_description'),
    questionMark: {
      title: t('setting_showFrametimes_help'),
    },
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'showResolutions',
    label: t('setting_showResolutions_label'),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'showBarDetectionStats',
    label: t('setting_showBarDetectionStats_label'),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    type: 'section',
    label: t('setting_sectionQualityPerformanceCollapsed_label'),
    name: 'sectionQualityPerformanceCollapsed',
    default: true,
  },
  {
    name: 'webGL',
    label: t('setting_webGL_label'),
    description: t('setting_webGL_description'),
    type: 'checkbox',
    default: true,
  },
  {
    name: 'resolution',
    label: t('setting_resolution_label'),
    type: 'list',
    default: 100,
    unit: '%',
    valuePoints: (() => {
      const points = [6.25];
      while (points[points.length - 1] < 400) {
        points.push(points[points.length - 1] * 2);
      }
      return points;
    })(),
    manualinput: false,
  },
  {
    name: 'framerateLimit',
    label: t('setting_framerateLimit_label'),
    type: 'list',
    default: 60,
    min: 0,
    max: 60,
    step: 1,
  },
  {
    name: 'frameSync',
    label: t('setting_frameSync_label'),
    questionMark: {
      title: t('setting_frameSync_help'),
    },
    type: 'list',
    default: 2,
    min: 0,
    max: 2,
    step: 1,
    snapPoints: [
      { value: 0, label: t('setting_frameSync_value_0') },
      { value: 1, label: t('setting_frameSync_value_1') },
      { value: 2, label: t('setting_frameSync_value_2') },
    ],
    manualinput: false,
    advanced: true,
    experimental: true,
  },
  {
    name: 'energySaver',
    label: t('setting_energySaver_label'),
    questionMark: {
      title: t('setting_energySaver_help'),
    },
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'prioritizePageLoadSpeed',
    label: t('setting_prioritizePageLoadSpeed_label'),
    description: t('setting_prioritizePageLoadSpeed_description'),
    type: 'checkbox',
    default: true,
  },
  {
    name: 'layoutPerformanceImprovements',
    label: t('setting_layoutPerformanceImprovements_label'),
    description: t('setting_layoutPerformanceImprovements_description'),
    questionMark: {
      title: t('setting_layoutPerformanceImprovements_help'),
    },
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'debandingBlendMode',
    label: t('setting_debandingBlendMode_label'),
    questionMark: {
      title: t('setting_debandingBlendMode_help'),
    },
    type: 'list',
    default: 0,
    min: 0,
    max: 1,
    step: 1,
    snapPoints: [
      { value: 0, label: t('setting_debandingBlendMode_value_0') },
      { value: 1, label: t('setting_debandingBlendMode_value_1') },
    ],
    manualinput: false,
    advanced: true,
    new: true,
  },
  {
    type: 'section',
    label: t('setting_sectionOtherPageHeaderCollapsed_label'),
    name: 'sectionOtherPageHeaderCollapsed',
    default: true,
  },
  {
    name: 'headerShadowSize',
    label: t('setting_headerShadowSize_label'),
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'headerShadowOpacity',
    label: t('setting_headerShadowOpacity_label'),
    type: 'list',
    default: 30,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'headerImagesOpacity',
    label: t('setting_headerImagesOpacity_label'),
    type: 'list',
    default: 100,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'headerFillOpacity',
    label: t('setting_headerFillOpacity_label'),
    description: t('setting_headerFillOpacity_description'),
    type: 'list',
    default: 100,
    min: -100,
    max: 100,
    step: 0.1,
    advanced: true,
  },

  {
    type: 'section',
    label: t('setting_sectionOtherPageContentCollapsed_label'),
    name: 'sectionOtherPageContentCollapsed',
    default: true,
  },
  {
    name: 'surroundingContentShadowSize',
    label: t('setting_surroundingContentShadowSize_label'),
    type: 'list',
    default: 15,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'surroundingContentShadowOpacity',
    label: t('setting_surroundingContentShadowOpacity_label'),
    type: 'list',
    default: 30,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'surroundingContentTextAndBtnOnly',
    label: t('setting_surroundingContentTextAndBtnOnly_label'),
    description: t('setting_surroundingContentTextAndBtnOnly_description'),
    type: 'checkbox',
    advanced: true,
    default: true,
  },
  {
    name: 'surroundingContentImagesOpacity',
    label: t('setting_surroundingContentImagesOpacity_label'),
    type: 'list',
    default: 100,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'surroundingContentFillOpacity',
    label: t('setting_surroundingContentFillOpacity_label'),
    type: 'list',
    default: 10,
    min: -100,
    max: 100,
    step: 0.1,
  },
  {
    name: 'pageBackgroundGreyness',
    label: t('setting_pageBackgroundGreyness_label'),
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'immersiveTheaterView',
    label: t('setting_immersiveTheaterView_label'),
    type: 'checkbox',
    default: false,
  },
  {
    name: 'relatedScrollbar',
    label: t('setting_relatedScrollbar_label'),
    description: t('setting_relatedScrollbar_description'),
    type: 'checkbox',
    advanced: true,
    default: false,
  },
  {
    name: 'hideScrollbar',
    label: t('setting_hideScrollbar_label'),
    type: 'checkbox',
    advanced: true,
    default: false,
  },
  {
    type: 'section',
    label: t('setting_sectionVideoResizingCollapsed_label'),
    name: 'sectionVideoResizingCollapsed',
    default: true,
  },
  {
    name: 'videoScale.SMALL',
    label: t('setting_videoScale_SMALL_label'),
    type: 'list',
    default: 100,
    min: 25,
    max: 200,
    step: 0.1,
    new: true,
  },
  {
    name: 'videoScale.THEATER',
    label: t('setting_videoScale_THEATER_label'),
    type: 'list',
    default: 100,
    min: 25,
    max: 200,
    step: 0.1,
    new: true,
  },
  {
    name: 'videoScale.FULLSCREEN',
    label: t('setting_videoScale_FULLSCREEN_label'),
    type: 'list',
    default: 100,
    min: 25,
    max: 200,
    step: 0.1,
    new: true,
  },
  {
    name: 'videoShadowSize',
    label: t('setting_videoShadowSize_label'),
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'videoShadowOpacity',
    label: t('setting_videoShadowOpacity_label'),
    type: 'list',
    default: 50,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'videoDebandingStrength',
    label: t('setting_videoDebandingStrength_label'),
    questionMark: {
      title: t('setting_videoDebandingStrength_help'),
      href: 'https://www.lifewire.com/what-is-dithering-4686105',
    },
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 1,
    advanced: true,
  },
  {
    name: 'videoOverlayEnabled',
    label: t('setting_videoOverlayEnabled_label'),
    questionMark: {
      title: t('setting_videoOverlayEnabled_help'),
    },
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'videoOverlaySyncThreshold',
    label: t('setting_videoOverlaySyncThreshold_label'),
    description: t('setting_videoOverlaySyncThreshold_description'),
    type: 'list',
    default: 5,
    min: 1,
    max: 100,
    step: 1,
    advanced: true,
  },
  {
    name: 'chromiumBugVideoJitterWorkaround',
    label: t('setting_chromiumBugVideoJitterWorkaround_label'),
    description: t('setting_chromiumBugVideoJitterWorkaround_description'),
    questionMark: {
      title: t('setting_chromiumBugVideoJitterWorkaround_help'),
      href: 'https://github.com/WesselKroos/youtube-ambilight/issues/166',
    },
    type: 'checkbox',
    default: false, // Should not be enabled by default because it also adds CPU & GPU overhead on 60Hz displays. (60Hz+ detection keeps toggling between off/on when VRR is enabled in the OS.)
    advanced: true,
  },
  {
    name: 'chromiumDirectVideoOverlayWorkaround',
    label: t('setting_chromiumDirectVideoOverlayWorkaround_label'),
    description: t('setting_chromiumDirectVideoOverlayWorkaround_description'),
    questionMark: {
      title: t('setting_chromiumDirectVideoOverlayWorkaround_help'),
      href: 'https://github.com/WesselKroos/youtube-ambilight/blob/master/TROUBLESHOOT.md#3-nvidia-rtx-video-super-resolution-vsr--nvidia-rtx-video-hdr-does-not-work',
    },
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    type: 'section',
    label: t('setting_sectionHorizontalBarsCollapsed_label'),
    name: 'sectionHorizontalBarsCollapsed',
    default: true,
  },
  {
    name: 'detectHorizontalBarSizeEnabled',
    label: t('setting_detectHorizontalBarSizeEnabled_label'),
    description: t('setting_detectHorizontalBarSizeEnabled_description'),
    type: 'checkbox',
    default: false,
    defaultKey: 'B',
  },
  {
    name: 'detectVerticalBarSizeEnabled',
    label: t('setting_detectVerticalBarSizeEnabled_label'),
    description: t('setting_detectVerticalBarSizeEnabled_description'),
    type: 'checkbox',
    default: false,
    defaultKey: 'V',
  },
  {
    name: 'detectColoredHorizontalBarSizeEnabled',
    label: t('setting_detectColoredHorizontalBarSizeEnabled_label'),
    type: 'checkbox',
    default: false,
  },
  {
    name: 'detectHorizontalBarSizeOffsetPercentage',
    label: t('setting_detectHorizontalBarSizeOffsetPercentage_label'),
    type: 'list',
    default: 0,
    min: -5,
    max: 5,
    step: 0.1,
    advanced: true,
  },
  {
    name: 'barSizeDetectionAverageHistorySize',
    label: t('setting_barSizeDetectionAverageHistorySize_label'),
    questionMark: {
      title: t('setting_barSizeDetectionAverageHistorySize_help'),
    },
    type: 'list',
    default: 4,
    min: 1,
    max: 30,
    step: 1,
    advanced: true,
  },
  {
    name: 'barSizeDetectionAllowedElementsPercentage',
    label: t('setting_barSizeDetectionAllowedElementsPercentage_label'),
    questionMark: {
      title: t('setting_barSizeDetectionAllowedElementsPercentage_help'),
    },
    type: 'list',
    default: 20,
    min: 10,
    max: 90,
    step: 10,
    // advanced: true,
  },
  {
    name: 'barSizeDetectionAllowedUnevenBarsPercentage',
    label: t('setting_barSizeDetectionAllowedUnevenBarsPercentage_label'),
    questionMark: {
      title: t('setting_barSizeDetectionAllowedUnevenBarsPercentage_help'),
    },
    type: 'list',
    default: 10,
    min: 1,
    max: 50,
    step: 1,
    advanced: true,
    new: true,
  },
  {
    name: 'horizontalBarsClipPercentage',
    label: t('setting_horizontalBarsClipPercentage_label'),
    type: 'list',
    default: 0,
    min: 0,
    max: 40,
    step: 0.1,
    snapPoints: [
      { value: 8.7, label: 8 },
      { value: 12.3, label: 12, flip: true },
      { value: 13.5, label: 13 },
    ],
    advanced: true,
  },
  {
    name: 'verticalBarsClipPercentage',
    label: t('setting_verticalBarsClipPercentage_label'),
    type: 'list',
    default: 0,
    min: 0,
    max: 40,
    step: 0.1,
    advanced: true,
  },
  {
    name: 'horizontalBarsClipPercentageReset',
    label: t('setting_horizontalBarsClipPercentageReset_label'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'detectVideoFillScaleEnabled',
    label: t('setting_detectVideoFillScaleEnabled_label'),
    type: 'checkbox',
    default: false,
    defaultKey: 'H',
  },
  {
    type: 'section',
    label: t('setting_sectionImageAdjustmentCollapsed_label'),
    name: 'sectionImageAdjustmentCollapsed',
    default: true,
  },
  {
    name: 'brightness',
    label: t('setting_brightness_label'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
  },
  {
    name: 'contrast',
    label: t('setting_contrast_label'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    advanced: true,
  },
  {
    name: 'vibrance',
    label: t('setting_vibrance_label'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 0.1,
  },
  {
    name: 'saturation',
    label: t('setting_saturation_label'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
  },
  {
    type: 'section',
    label: t('setting_sectionHdrImageAdjustmentCollapsed_label'),
    name: 'sectionHdrImageAdjustmentCollapsed',
    default: false,
    hdr: true,
  },
  {
    name: 'hdrBrightness',
    label: t('setting_hdrBrightness_label'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    hdr: true,
  },
  {
    name: 'hdrContrast',
    label: t('setting_hdrContrast_label'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    hdr: true,
  },
  {
    name: 'hdrSaturation',
    label: t('setting_hdrSaturation_label'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    hdr: true,
  },
  {
    type: 'section',
    label: t('setting_sectionDirectionsCollapsed_label'),
    name: 'sectionDirectionsCollapsed',
    default: true,
    advanced: true,
  },
  {
    name: 'directionTopEnabled',
    label: t('setting_directionTopEnabled_label'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'directionRightEnabled',
    label: t('setting_directionRightEnabled_label'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'directionBottomEnabled',
    label: t('setting_directionBottomEnabled_label'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'directionLeftEnabled',
    label: t('setting_directionLeftEnabled_label'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    type: 'section',
    label: t('setting_sectionAmbientlightCollapsed_label'),
    name: 'sectionAmbientlightCollapsed',
    default: false,
  },
  {
    name: 'blur2',
    label: t('setting_blur2_label'),
    description: t('setting_blur2_description'),
    type: 'list',
    default: 30,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'edge',
    label: t('setting_edge_label'),
    description: t('setting_edge_description'),
    type: 'list',
    default: 12,
    min: 2,
    max: 50,
    step: 0.1,
    advanced: true,
  },
  {
    name: 'spread',
    label: t('setting_spread_label'),
    description: t('setting_spread_description'),
    type: 'list',
    default: 17,
    min: 0,
    max: 400,
    step: 0.1,
  },
  {
    name: 'spreadFadeStart',
    label: t('setting_spreadFadeStart_label'),
    type: 'list',
    default: 15,
    min: -50,
    max: 100,
    step: 0.1,
    advanced: true,
  },
  {
    name: 'spreadFadeCurve',
    label: t('setting_spreadFadeCurve_label'),
    description: t('setting_spreadFadeCurve_description'),
    type: 'list',
    default: 35,
    min: 1,
    max: 100,
    step: 1,
    advanced: true,
  },
  {
    name: 'debandingStrength',
    label: t('setting_debandingStrength_label'),
    questionMark: {
      title: t('setting_debandingStrength_help'),
      href: 'https://www.lifewire.com/what-is-dithering-4686105',
    },
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 1,
    advanced: true,
  },
  {
    name: 'frameFading',
    label: t('setting_frameFading_label'),
    description: t('setting_frameFading_description'),
    questionMark: {
      title: t('setting_frameFading_help'),
    },
    type: 'list',
    default: 0,
    min: 0,
    max: 21.2, // 15 seconds
    step: 0.02,
    manualinput: false,
  },
  {
    name: 'flickerReduction',
    label: t('setting_flickerReduction_label'),
    questionMark: {
      title: t('setting_flickerReduction_help'),
    },
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 1,
    manualinput: false,
    advanced: true,
  },
  {
    name: 'frameBlending',
    label: t('setting_frameBlending_label'),
    questionMark: {
      title: t('setting_frameBlending_help'),
      href: 'https://www.youtube.com/watch?v=m_wfO4fvH8M&t=81s',
    },
    description: t('setting_frameBlending_description'),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'frameBlendingSmoothness',
    label: t('setting_frameBlendingSmoothness_label'),
    type: 'list',
    default: 80,
    min: 0,
    max: 100,
    step: 1,
    advanced: true,
  },
  {
    name: 'fixedPosition',
    label: t('setting_fixedPosition_label'),
    description: t('setting_fixedPosition_description'),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    type: 'section',
    label: t('setting_sectionViewsCollapsed_label'),
    name: 'sectionViewsCollapsed',
    default: false,
  },
  {
    name: 'enableInViews',
    label: t('setting_enableInViews_label'),
    type: 'list',
    manualinput: false,
    default: 0,
    min: 0,
    max: 5,
    step: 1,
    snapPoints: [
      { value: 0, label: t('setting_enableInViews_value_0') },
      { value: 1, label: t('setting_enableInViews_value_1') },
      { value: 2, hiddenLabel: t('setting_enableInViews_value_2') },
      { value: 3, label: t('setting_enableInViews_value_3') },
      { value: 4, hiddenLabel: t('setting_enableInViews_value_4') },
      { value: 5, label: t('setting_enableInViews_value_5') },
    ],
  },
  {
    name: 'enableInPictureInPicture',
    label: t('setting_enableInPictureInPicture_label'),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'enableInEmbed',
    label: t('setting_enableInEmbed_label'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'enableInVRVideos',
    label: t('setting_enableInVRVideos_label'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    type: 'section',
    label: t('setting_sectionGeneralCollapsed_label'),
    name: 'sectionGeneralCollapsed',
    default: false,
  },
  {
    name: 'theme',
    label: t('setting_theme_label'),
    type: 'list',
    manualinput: false,
    default: 1,
    min: -1,
    max: 1,
    step: 1,
    snapPoints: [
      { value: -1, label: t('setting_theme_value_minus1') },
      { value: 0, label: t('setting_theme_value_0') },
      { value: 1, label: t('setting_theme_value_1') },
    ],
  },
  {
    name: 'enabled',
    label: t('setting_enabled_label'),
    type: 'checkbox',
    default: true,
    defaultKey: 'G',
  },
];

export const WebGLOnlySettings = [
  'resolution',
  'vibrance',
  'frameFading',
  'flickerReduction',
  'fixedPosition',
  'chromiumBugVideoJitterWorkaround',
];

let prepared = false;
export const prepareSettingsConfigOnce = () => {
  if (prepared) return;

  const settingsToRemove = [];
  for (const setting of SettingsConfig) {
    if (supportsWebGL()) {
      if (setting.name === 'resolution' && getBrowser() === 'Firefox') {
        setting.default = 50;
      }
    } else {
      if (WebGLOnlySettings.includes(setting.name)) {
        settingsToRemove.push(setting.name);
      }
      if (['webGL'].includes(setting.name)) {
        setting.default = false;
        setting.disabled = t('setting_webGL_disabled_webgl_unavailable');
      }
    }

    if (setting.name === 'frameSync') {
      if (!HTMLVideoElement.prototype.requestVideoFrameCallback) {
        setting.max = 1;
        setting.default = 0;
      } else if (getBrowser() === 'Firefox') {
        // FireFox workaround: requestVideoFrameCallback is limited to 24fps. Use decoded video frames by default instead
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1935256
        setting.default = 0;
      }
    }
  }

  if (getBrowser() === 'Firefox') {
    settingsToRemove.push('enableInVRVideos');
  }

  if (!supportsColorMix()) {
    settingsToRemove.push('pageBackgroundGreyness');
  }

  for (const settingName of settingsToRemove) {
    const settingIndex = SettingsConfig.findIndex(
      (setting) => setting.name === settingName
    );
    SettingsConfig.splice(settingIndex, 1);
  }

  prepared = true;
};

export default SettingsConfig;
