import { supportsColorMix, supportsWebGL } from './generic';
import { getBrowser } from './utils';
import { getMessage } from './i18n';

const SettingsConfig = [
  {
    type: 'section',
    label: getMessage('setting_sectionSettingsCollapsed_label', 'Settings'),
    name: 'sectionSettingsCollapsed',
    default: true,
  },
  {
    name: 'advancedSettings',
    label: getMessage('setting_advancedSettings_label', 'Advanced'),
    type: 'checkbox',
    default: false,
  },
  {
    type: 'section',
    label: getMessage('setting_sectionStatsCollapsed_label', 'Stats'),
    name: 'sectionStatsCollapsed',
    default: true,
    advanced: true,
  },
  {
    name: 'showFPS',
    label: getMessage('setting_showFPS_label', 'Framerates'),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'showFrametimes',
    label: getMessage('setting_showFrametimes_label', 'Frametimes graph'),
    description: getMessage('setting_showFrametimes_desc', 'Uses: CPU power'),
    questionMark: {
      title: getMessage(
        'setting_showFrametimes_title',
        'The measured display framerate is not a reflection of the real performance.\nBecause the measurement uses an extra percentage of CPU usage.\nHowever, this statistic could be helpful to debug other issues.'
      ),
    },
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'showResolutions',
    label: getMessage(
      'setting_showResolutions_label',
      'Resolutions & drawtimes'
    ),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'showBarDetectionStats',
    label: getMessage('setting_showBarDetectionStats_label', 'Bar detection'),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    type: 'section',
    label: getMessage('setting_sectionQualityPerformanceCollapsed_label', 'Quality'),
    name: 'sectionQualityPerformanceCollapsed',
    default: true,
  },
  {
    name: 'webGL',
    label: getMessage(
      'setting_webGL_label',
      'WebGL renderer (uses less power)'
    ),
    description: getMessage(
      'setting_webGL_desc',
      'Changing this reloads the webpage'
    ),
    type: 'checkbox',
    default: true,
  },
  {
    name: 'resolution',
    label: getMessage('setting_resolution_label', 'Resolution'),
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
    label: getMessage(
      'setting_framerateLimit_label',
      'Limit framerate (per second)'
    ),
    type: 'list',
    default: 60,
    min: 0,
    max: 60,
    step: 1,
  },
  {
    name: 'frameSync',
    label: getMessage('setting_frameSync_label', 'Synchronization'),
    questionMark: {
      title: getMessage(
        'setting_frameSync_title',
        'How much energy will be spent on sychronising ambient light frames with video frames.\n\nDecoded framerate: Lowest CPU & GPU usage.\nMight result in dropped and delayed frames.\n\nDisplay framerate: Highest CPU & GPU usage.\nMight still result in delayed frames on high refreshrate monitors (120hz and higher) and higher than 1080p videos.\n\nVideo framerate: Lowest CPU & GPU usage.\nUses the newest browser technology to always keep the frames in sync.'
      ),
    },
    type: 'list',
    default: 2,
    min: 0,
    max: 2,
    step: 1,
    snapPoints: [
      {
        value: 0,
        label: getMessage('setting_frameSync_opt_decoded', 'Decoded'),
      },
      {
        value: 1,
        label: getMessage('setting_frameSync_opt_display', 'Display'),
      },
      {
        value: 2,
        label: getMessage('setting_frameSync_opt_video', 'Video'),
      },
    ],
    manualinput: false,
    advanced: true,
    experimental: true,
  },
  {
    name: 'energySaver',
    label: getMessage(
      'setting_energySaver_label',
      'Save energy on static videos'
    ),
    questionMark: {
      title: getMessage(
        'setting_energySaver_title',
        'Limits the framerate on videos with an (almost) static image\n\nStill image: 1 frame per 5 seconds\nSmall movements: 1 frame per second'
      ),
    },
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'prioritizePageLoadSpeed',
    label: getMessage(
      'setting_prioritizePageLoadSpeed_label',
      'Prioritize page load speed'
    ),
    description: getMessage(
      'setting_prioritizePageLoadSpeed_desc',
      'Loads the ambient light after the page has loaded'
    ),
    type: 'checkbox',
    default: true,
  },
  {
    name: 'layoutPerformanceImprovements',
    label: getMessage(
      'setting_layoutPerformanceImprovements_label',
      'YouTube responsiveness fixes'
    ),
    description: getMessage(
      'setting_layoutPerformanceImprovements_desc',
      'Improves the responsiveness of the webpage'
    ),
    questionMark: {
      title: getMessage(
        'setting_layoutPerformanceImprovements_title',
        `Some of the improvements on the /watch page include:
- Faster webpage resizing and scrolling (Most noticeable after you've loaded in more than 100 comments)
- Faster loadingtimes for comments and/or related videos
- Smoother timeline scrubbing (Most noticeable after you've loaded in more than 100 comments or with a livestream chat window open)
- Smoother livestream chat scrolling (and new messages will be appended quicker to the chat)
- Smoother playlist scrolling (Most noticeable in a playlist with more than 25 videos)
- Smoother dragging/re-ordering videos in a playlist (Most noticeable in a playlist with more than 25 videos)`
      ),
    },
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'debandingBlendMode',
    label: getMessage(
      'setting_debandingBlendMode_label',
      'Optimize debanding for'
    ),
    questionMark: {
      title: getMessage(
        'setting_debandingBlendMode_title',
        "The normal blend mode is usefull to fix banding in dark colors on LCD's.\nBut on OLED's it's better to use the \"overlay\" blend mode to retain pure blacks."
      ),
    },
    type: 'list',
    default: 0,
    min: 0,
    max: 1,
    step: 1,
    snapPoints: [
      {
        value: 0,
        label: getMessage('setting_debandingBlendMode_opt_lcd', 'LCD (normal)'),
      },
      {
        value: 1,
        label: getMessage('setting_debandingBlendMode_opt_oled', 'OLED (overlay)'),
      },
    ],
    manualinput: false,
    advanced: true,
    new: true,
  },
  {
    type: 'section',
    label: getMessage(
      'setting_sectionOtherPageHeaderCollapsed_label',
      'Page header'
    ),
    name: 'sectionOtherPageHeaderCollapsed',
    default: true,
  },
  {
    name: 'headerShadowSize',
    label: getMessage('setting_headerShadowSize_label', 'Shadows size'),
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'headerShadowOpacity',
    label: getMessage('setting_headerShadowOpacity_label', 'Shadows opacity'),
    type: 'list',
    default: 30,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'headerImagesOpacity',
    label: getMessage('setting_headerImagesOpacity_label', 'Images opacity'),
    type: 'list',
    default: 100,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'headerFillOpacity',
    label: getMessage('setting_headerFillOpacity_label', 'Background opacity'),
    description: getMessage(
      'setting_headerFillOpacity_desc',
      'Only applies when scrolled down'
    ),
    type: 'list',
    default: 100,
    min: -100,
    max: 100,
    step: 0.1,
    advanced: true,
  },

  {
    type: 'section',
    label: getMessage(
      'setting_sectionOtherPageContentCollapsed_label',
      'Page content'
    ),
    name: 'sectionOtherPageContentCollapsed',
    default: true,
  },
  {
    name: 'surroundingContentShadowSize',
    label: getMessage(
      'setting_surroundingContentShadowSize_label',
      'Shadows size'
    ),
    type: 'list',
    default: 15,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'surroundingContentShadowOpacity',
    label: getMessage(
      'setting_surroundingContentShadowOpacity_label',
      'Shadows opacity'
    ),
    type: 'list',
    default: 30,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'surroundingContentTextAndBtnOnly',
    label: getMessage(
      'setting_surroundingContentTextAndBtnOnly_label',
      'Shadows on texts and buttons only'
    ),
    description: getMessage(
      'setting_surroundingContentTextAndBtnOnly_desc',
      'Decreases scrolling & video stutter'
    ),
    type: 'checkbox',
    advanced: true,
    default: true,
  },
  {
    name: 'surroundingContentImagesOpacity',
    label: getMessage(
      'setting_surroundingContentImagesOpacity_label',
      'Images opacity'
    ),
    type: 'list',
    default: 100,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'surroundingContentFillOpacity',
    label: getMessage(
      'setting_surroundingContentFillOpacity_label',
      'Buttons & boxes background opacity'
    ),
    type: 'list',
    default: 10,
    min: -100,
    max: 100,
    step: 0.1,
  },
  {
    name: 'pageBackgroundGreyness',
    label: getMessage(
      'setting_pageBackgroundGreyness_label',
      'Background greyness'
    ),
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'immersiveTheaterView',
    label: getMessage(
      'setting_immersiveTheaterView_label',
      'Hide everything in theater mode'
    ),
    type: 'checkbox',
    default: false,
  },
  {
    name: 'relatedScrollbar',
    label: getMessage(
      'setting_relatedScrollbar_label',
      'Related videos as scrollable list'
    ),
    description: getMessage(
      'setting_relatedScrollbar_desc',
      'Also improves scrolling through comments'
    ),
    type: 'checkbox',
    advanced: true,
    default: false,
  },
  {
    name: 'hideScrollbar',
    label: getMessage('setting_hideScrollbar_label', 'Hide scrollbar'),
    type: 'checkbox',
    advanced: true,
    default: false,
  },
  {
    type: 'section',
    label: getMessage('setting_sectionVideoResizingCollapsed_label', 'Video'),
    name: 'sectionVideoResizingCollapsed',
    default: true,
  },
  {
    name: 'videoScale.SMALL',
    label: getMessage(
      'setting_videoScale_SMALL_label',
      'Size (in small view)'
    ),
    type: 'list',
    default: 100,
    min: 25,
    max: 200,
    step: 0.1,
    new: true,
  },
  {
    name: 'videoScale.THEATER',
    label: getMessage(
      'setting_videoScale_THEATER_label',
      'Size (in theater view)'
    ),
    type: 'list',
    default: 100,
    min: 25,
    max: 200,
    step: 0.1,
    new: true,
  },
  {
    name: 'videoScale.FULLSCREEN',
    label: getMessage(
      'setting_videoScale_FULLSCREEN_label',
      'Size (in fullscreen)'
    ),
    type: 'list',
    default: 100,
    min: 25,
    max: 200,
    step: 0.1,
    new: true,
  },
  {
    name: 'videoShadowSize',
    label: getMessage('setting_videoShadowSize_label', 'Shadow size'),
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'videoShadowOpacity',
    label: getMessage('setting_videoShadowOpacity_label', 'Shadow opacity'),
    type: 'list',
    default: 50,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'videoDebandingStrength',
    label: getMessage(
      'setting_videoDebandingStrength_label',
      'Debanding (noise)'
    ),
    questionMark: {
      title: getMessage(
        'setting_videoDebandingStrength_title',
        'Click for more information about debanding (noise /dithering).\nTip: Change the "Quality > Optimize debanding for" setting to "OLED" to retain pure blacks on OLED displays.'
      ),
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
    label: getMessage(
      'setting_videoOverlayEnabled_label',
      'Sync video with ambient light'
    ),
    questionMark: {
      title: getMessage(
        'setting_videoOverlayEnabled_title',
        'Delays the video frames according to the ambient light frametimes.\nThis makes sure that that the ambient light is never out of sync with the video,\nbut it can introduce stuttering and/or dropped frames.'
      ),
    },
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'videoOverlaySyncThreshold',
    label: getMessage(
      'setting_videoOverlaySyncThreshold_label',
      'Sync video disable threshold'
    ),
    description: getMessage(
      'setting_videoOverlaySyncThreshold_desc',
      'Disable when dropping % of frames'
    ),
    type: 'list',
    default: 5,
    min: 1,
    max: 100,
    step: 1,
    advanced: true,
  },
  {
    name: 'chromiumBugVideoJitterWorkaround',
    label: getMessage(
      'setting_chromiumBugVideoJitterWorkaround_label',
      'Video jitter workaround'
    ),
    description: getMessage(
      'setting_chromiumBugVideoJitterWorkaround_desc',
      'Uses: CPU & GPU power'
    ),
    questionMark: {
      title: getMessage(
        'setting_chromiumBugVideoJitterWorkaround_title',
        'Chromium has a bug that jitters the video playback when your display \nhas a higher framerate than 60Hz. This workaround prevents the jittering \nby forcing the browser to run at the framerate of your display instead. \nClick the questionmark for more information about this bug in Chromium browsers.'
      ),
      href: 'https://github.com/WesselKroos/youtube-ambilight/issues/166',
    },
    type: 'checkbox',
    default: false, // Should not be enabled by default because it also adds CPU & GPU overhead on 60Hz displays. (60Hz+ detection keeps toggling between off/on when VRR is enabled in the OS.)
    advanced: true,
  },
  {
    name: 'chromiumDirectVideoOverlayWorkaround',
    label: getMessage(
      'setting_chromiumDirectVideoOverlayWorkaround_label',
      'Video artifacts workaround'
    ),
    description: getMessage(
      'setting_chromiumDirectVideoOverlayWorkaround_desc',
      'This workaround must be disabled for \nNVidia RTX Virtual Super Resolution (VSR)'
    ),
    questionMark: {
      title: getMessage(
        'setting_chromiumDirectVideoOverlayWorkaround_title',
        `This workaround can fix several artifacts/bugs,
when videos are in hardware accelerated overlays (MPO).
Examples are: random black/white squares, flickering or a squeezed video.

Click on the questionmark for more and updated information about these artifacts/bugs.`
      ),
      href: 'https://github.com/WesselKroos/youtube-ambilight/blob/master/TROUBLESHOOT.md#3-nvidia-rtx-video-super-resolution-vsr--nvidia-rtx-video-hdr-does-not-work',
    },
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    type: 'section',
    label: getMessage(
      'setting_sectionHorizontalBarsCollapsed_label',
      'Remove black & colored bars'
    ),
    name: 'sectionHorizontalBarsCollapsed',
    default: true,
  },
  {
    name: 'detectHorizontalBarSizeEnabled',
    label: getMessage(
      'setting_detectHorizontalBarSizeEnabled_label',
      'Remove black bars'
    ),
    description: getMessage(
      'setting_detectHorizontalBarSizeEnabled_desc',
      'Uses: CPU power'
    ),
    type: 'checkbox',
    default: false,
    defaultKey: 'B',
  },
  {
    name: 'detectVerticalBarSizeEnabled',
    label: getMessage(
      'setting_detectVerticalBarSizeEnabled_label',
      'Remove black sidebars'
    ),
    description: getMessage(
      'setting_detectVerticalBarSizeEnabled_desc',
      'Uses: CPU power'
    ),
    type: 'checkbox',
    default: false,
    defaultKey: 'V',
  },
  {
    name: 'detectColoredHorizontalBarSizeEnabled',
    label: getMessage(
      'setting_detectColoredHorizontalBarSizeEnabled_label',
      'Detection: Remove colored bars'
    ),
    type: 'checkbox',
    default: false,
  },
  {
    name: 'detectHorizontalBarSizeOffsetPercentage',
    label: getMessage(
      'setting_detectHorizontalBarSizeOffsetPercentage_label',
      'Detection: Offset'
    ),
    type: 'list',
    default: 0,
    min: -5,
    max: 5,
    step: 0.1,
    advanced: true,
  },
  {
    name: 'barSizeDetectionAverageHistorySize',
    label: getMessage(
      'setting_barSizeDetectionAverageHistorySize_label',
      'Detection: Frames average'
    ),
    questionMark: {
      title: getMessage(
        'setting_barSizeDetectionAverageHistorySize_title',
        'The amount of video frames to detect an average bar size from. \nA lower amount of frames results in a faster detection, \nbut does also increase the amount of inaccurate detections.'
      ),
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
    label: getMessage(
      'setting_barSizeDetectionAllowedElementsPercentage_label',
      'Detection: Certainty threshold'
    ),
    questionMark: {
      title: getMessage(
        'setting_barSizeDetectionAllowedElementsPercentage_title',
        'At 10% only clear bars are removed.\nA higher percentage can also remove bars with some elements.\nAnd an even higher percentage can crop to a squared element in the center.'
      ),
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
    label: getMessage(
      'setting_barSizeDetectionAllowedUnevenBarsPercentage_label',
      'Detection: Uneven threshold'
    ),
    questionMark: {
      title: getMessage(
        'setting_barSizeDetectionAllowedUnevenBarsPercentage_title',
        'Higher percentages detect a more uneven bar.\nFor example: A bar is uneven when the top bar is smaller than the bottem bar.\nBut with a high percentage you also increase the risk that straight objects or lines are seen as bars.'
      ),
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
    label: getMessage(
      'setting_horizontalBarsClipPercentage_label',
      'Bar size'
    ),
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
    label: getMessage(
      'setting_verticalBarsClipPercentage_label',
      'Sidebars size'
    ),
    type: 'list',
    default: 0,
    min: 0,
    max: 40,
    step: 0.1,
    advanced: true,
  },
  {
    name: 'horizontalBarsClipPercentageReset',
    label: getMessage(
      'setting_horizontalBarsClipPercentageReset_label',
      'Reset bars next video'
    ),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'detectVideoFillScaleEnabled',
    label: getMessage(
      'setting_detectVideoFillScaleEnabled_label',
      'Fill video to removed bars'
    ),
    type: 'checkbox',
    default: false,
    defaultKey: 'H',
  },
  {
    type: 'section',
    label: getMessage('setting_sectionImageAdjustmentCollapsed_label', 'Filters'),
    name: 'sectionImageAdjustmentCollapsed',
    default: true,
  },
  {
    name: 'brightness',
    label: getMessage('setting_brightness_label', 'Brightness'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
  },
  {
    name: 'contrast',
    label: getMessage('setting_contrast_label', 'Contrast'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    advanced: true,
  },
  {
    name: 'vibrance',
    label: getMessage('setting_vibrance_label', 'Colors'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 0.1,
  },
  {
    name: 'saturation',
    label: getMessage('setting_saturation_label', 'Saturation'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
  },
  {
    type: 'section',
    label: getMessage(
      'setting_sectionHdrImageAdjustmentCollapsed_label',
      'HDR Filters'
    ),
    name: 'sectionHdrImageAdjustmentCollapsed',
    default: false,
    hdr: true,
  },
  {
    name: 'hdrBrightness',
    label: getMessage('setting_hdrBrightness_label', 'Brightness'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    hdr: true,
  },
  {
    name: 'hdrContrast',
    label: getMessage('setting_hdrContrast_label', 'Contrast'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    hdr: true,
  },
  {
    name: 'hdrSaturation',
    label: getMessage('setting_hdrSaturation_label', 'Saturation'),
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    hdr: true,
  },
  {
    type: 'section',
    label: getMessage('setting_sectionDirectionsCollapsed_label', 'Directions'),
    name: 'sectionDirectionsCollapsed',
    default: true,
    advanced: true,
  },
  {
    name: 'directionTopEnabled',
    label: getMessage('setting_directionTopEnabled_label', 'Top'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'directionRightEnabled',
    label: getMessage('setting_directionRightEnabled_label', 'Right'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'directionBottomEnabled',
    label: getMessage('setting_directionBottomEnabled_label', 'Bottom'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'directionLeftEnabled',
    label: getMessage('setting_directionLeftEnabled_label', 'Left'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    type: 'section',
    label: getMessage(
      'setting_sectionAmbientlightCollapsed_label',
      'Ambient light'
    ),
    name: 'sectionAmbientlightCollapsed',
    default: false,
  },
  {
    name: 'blur2',
    label: getMessage('setting_blur2_label', 'Blur'),
    description: getMessage('setting_blur2_desc', 'Uses: GPU memory'),
    type: 'list',
    default: 30,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    name: 'edge',
    label: getMessage('setting_edge_label', 'Edge size'),
    description: getMessage(
      'setting_edge_desc',
      'To better see what changes: Turn the blur to 0%'
    ),
    type: 'list',
    default: 12,
    min: 2,
    max: 50,
    step: 0.1,
    advanced: true,
  },
  {
    name: 'spread',
    label: getMessage('setting_spread_label', 'Spread'),
    description: getMessage('setting_spread_desc', 'Uses: GPU power'),
    type: 'list',
    default: 17,
    min: 0,
    max: 400,
    step: 0.1,
  },
  {
    name: 'spreadFadeStart',
    label: getMessage('setting_spreadFadeStart_label', 'Spread fade start'),
    type: 'list',
    default: 15,
    min: -50,
    max: 100,
    step: 0.1,
    advanced: true,
  },
  {
    name: 'spreadFadeCurve',
    label: getMessage('setting_spreadFadeCurve_label', 'Spread fade curve'),
    description: getMessage(
      'setting_spreadFadeCurve_desc',
      'To better see what changes: Turn the blur to 0%'
    ),
    type: 'list',
    default: 35,
    min: 1,
    max: 100,
    step: 1,
    advanced: true,
  },
  {
    name: 'debandingStrength',
    label: getMessage('setting_debandingStrength_label', 'Debanding (noise)'),
    questionMark: {
      title: getMessage(
        'setting_debandingStrength_title',
        'Click for more information about (noise /dithering).\nTip: Change the "Quality > Optimize debanding for" setting to "OLED" to retain pure blacks on OLED displays.'
      ),
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
    label: getMessage('setting_frameFading_label', 'Fade in duration'),
    description: getMessage('setting_frameFading_desc', 'Uses: GPU memory'),
    questionMark: {
      title: getMessage(
        'setting_frameFading_title',
        'Fading between changes in the ambient light'
      ),
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
    label: getMessage('setting_flickerReduction_label', 'Flicker reduction'),
    questionMark: {
      title: getMessage(
        'setting_flickerReduction_title',
        'Reduces flickering by limiting the speed at which brightness changes in the ambient light'
      ),
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
    label: getMessage(
      'setting_frameBlending_label',
      'Smooth motion (frame blending)'
    ),
    questionMark: {
      title: getMessage(
        'setting_frameBlending_title',
        'Click for more information about Frame blending'
      ),
      href: 'https://www.youtube.com/watch?v=m_wfO4fvH8M&t=81s',
    },
    description: getMessage(
      'setting_frameBlending_desc',
      'Uses: GPU power. Also works with "Sync video"'
    ),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'frameBlendingSmoothness',
    label: getMessage(
      'setting_frameBlendingSmoothness_label',
      'Smooth motion strength'
    ),
    type: 'list',
    default: 80,
    min: 0,
    max: 100,
    step: 1,
    advanced: true,
  },
  {
    name: 'fixedPosition',
    label: getMessage('setting_fixedPosition_label', 'Fixed position'),
    description: getMessage(
      'setting_fixedPosition_desc',
      'Ignores the scroll position of the page'
    ),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    type: 'section',
    label: getMessage('setting_sectionViewsCollapsed_label', 'View modes'),
    name: 'sectionViewsCollapsed',
    default: false,
  },
  {
    name: 'enableInViews',
    label: getMessage('setting_enableInViews_label', 'Enable in layouts'),
    type: 'list',
    manualinput: false,
    default: 0,
    min: 0,
    max: 5,
    step: 1,
    snapPoints: [
      {
        value: 0,
        label: getMessage('setting_enableInViews_opt_all', 'All'),
      },
      {
        value: 1,
        label: getMessage('setting_enableInViews_opt_small', 'Small'),
      },
      {
        value: 2,
        hiddenLabel: getMessage(
          'setting_enableInViews_opt_small_theater',
          'Small & Theater'
        ),
      },
      {
        value: 3,
        label: getMessage('setting_enableInViews_opt_theater', 'Theater'),
      },
      {
        value: 4,
        hiddenLabel: getMessage(
          'setting_enableInViews_opt_theater_fullscreen',
          'Theater & Fullscreen'
        ),
      },
      {
        value: 5,
        label: getMessage('setting_enableInViews_opt_fullscreen', 'Fullscreen'),
      },
    ],
  },
  {
    name: 'enableInPictureInPicture',
    label: getMessage(
      'setting_enableInPictureInPicture_label',
      'Picture in picture'
    ),
    type: 'checkbox',
    default: false,
    advanced: true,
  },
  {
    name: 'enableInEmbed',
    label: getMessage('setting_enableInEmbed_label', 'Embedded videos'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    name: 'enableInVRVideos',
    label: getMessage('setting_enableInVRVideos_label', 'VR/360 videos'),
    type: 'checkbox',
    default: true,
    advanced: true,
  },
  {
    type: 'section',
    label: getMessage('setting_sectionGeneralCollapsed_label', 'General'),
    name: 'sectionGeneralCollapsed',
    default: false,
  },
  {
    name: 'theme',
    label: getMessage('setting_theme_label', 'Appearance (theme)'),
    type: 'list',
    manualinput: false,
    default: 1,
    min: -1,
    max: 1,
    step: 1,
    snapPoints: [
      {
        value: -1,
        label: getMessage('setting_theme_opt_light', 'Light'),
      },
      {
        value: 0,
        label: getMessage('setting_theme_opt_default', 'Default'),
      },
      {
        value: 1,
        label: getMessage('setting_theme_opt_dark', 'Dark'),
      },
    ],
  },
  {
    name: 'enabled',
    label: getMessage('setting_enabled_label', 'Enabled'),
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
        setting.disabled = getMessage(
          'setting_webGL_disabled',
          'You have disabled WebGL in your browser.'
        );
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
