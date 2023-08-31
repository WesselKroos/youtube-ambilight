const SettingsConfig = [
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
    label: 'Stats',
    name: 'sectionStatsCollapsed',
    default: true,
    advanced: true
  },
  {
    name: 'showFPS',
    label: 'Framerate stats',
    type: 'checkbox',
    default: false,
    advanced: true
  },
  {
    name: 'showFrametimes',
    label: 'Frametime stats',
    description: 'Uses: CPU power',
    questionMark: {
      title: 'The measured display framerate is not a reflection of the real performance.\nBecause the measurement uses an extra percentage of CPU usage.\nHowever, this statistic could be helpful to debug other issues.'
    },
    type: 'checkbox',
    default: false,
    advanced: true
  },
  {
    name: 'showResolutions',
    label: 'Resolution & draw time stats',
    type: 'checkbox',
    default: false,
    advanced: true
  },
  {
    type: 'section',
    label: 'Quality',
    name: 'sectionQualityPerformanceCollapsed',
    default: true
  },
  {
    name: 'webGL',
    label: 'WebGL renderer (uses less power)',
    type: 'checkbox',
    default: true,
    advanced: true
  },
  {
    name: 'resolution',
    label: 'Resolution',
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
    manualinput: false
  },
  {
    name: 'framerateLimit',
    label: 'Limit framerate (per second)',
    type: 'list',
    default: 0,
    min: 0,
    max: 60,
    step: 1
  },
  {
    name: 'frameSync',
    label: 'Synchronization',
    questionMark: {
      title: 'How much energy will be spent on sychronising ambient light frames with video frames.\n\nDecoded framerate: Lowest CPU & GPU usage.\nMight result in dropped and delayed frames.\n\nDisplay framerate: Highest CPU & GPU usage.\nMight still result in delayed frames on high refreshrate monitors (120hz and higher) and higher than 1080p videos.\n\nVideo framerate: Lowest CPU & GPU usage.\nUses the newest browser technology to always keep the frames in sync.'
    },
    type: 'list',
    default: 2,
    min: 0,
    max: 2,
    step: 1,
    manualinput: false,
    advanced: true
  },
  {
    name: 'energySaver',
    label: 'Save energy on static videos',
    questionMark: {
      title: 'Limits the framerate on videos with an (almost) static image\n\nStill image: 1 frame per 5 seconds\nSmall movements: 1 frame per second'
    },
    type: 'checkbox',
    default: false,
    advanced: true
  },
  {
    name: 'prioritizePageLoadSpeed',
    label: 'Prioritize page load speed',
    description: 'Show ambient light after the page has loaded',
    type: 'checkbox',
    default: true,
    advanced: true
  },
  {
    type: 'section',
    label: 'Page header',
    name: 'sectionOtherPageHeaderCollapsed',
    default: true
  },
  {
    name: 'headerShadowSize',
    label: 'Shadows size',
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: .1
  },
  {
    name: 'headerShadowOpacity',
    label: 'Shadows opacity',
    type: 'list',
    default: 30,
    min: 0,
    max: 100,
    step: .1
  },
  {
    name: 'headerImagesOpacity',
    label: 'Images opacity',
    type: 'list',
    default: 100,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    name: 'headerFillOpacity',
    label: 'Background opacity',
    description: 'Only applies when scrolled down',
    type: 'list',
    default: 100,
    min: -100,
    max: 100,
    step: 1,
    advanced: true
  },

  {
    type: 'section',
    label: 'Page content',
    name: 'sectionOtherPageContentCollapsed',
    default: true
  },
  {
    name: 'surroundingContentShadowSize',
    label: 'Shadows size',
    type: 'list',
    default: 15,
    min: 0,
    max: 100,
    step: .1
  },
  {
    name: 'surroundingContentShadowOpacity',
    label: 'Shadows opacity',
    type: 'list',
    default: 30,
    min: 0,
    max: 100,
    step: .1
  },
  {
    name: 'surroundingContentTextAndBtnOnly',
    label: 'Shadows on texts and buttons only',
    description: 'Decreases scrolling & video stutter',
    type: 'checkbox',
    advanced: true,
    default: true
  },
  {
    name: 'surroundingContentImagesOpacity',
    label: 'Images opacity',
    type: 'list',
    default: 100,
    min: 0,
    max: 100,
    step: 1
  },
  {
    name: 'surroundingContentFillOpacity',
    label: 'Buttons & boxes background opacity',
    type: 'list',
    default: 10,
    min: -100,
    max: 100,
    step: 1
  },
  {
    name: 'pageBackgroundGreyness',
    label: 'Background greyness',
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: .1,
    new: true
  },
  {
    name: 'immersiveTheaterView',
    label: 'Hide everything in theater mode',
    type: 'checkbox',
    default: false
  },
  {
    name: 'relatedScrollbar',
    label: 'Related videos as scrollable list',
    description: 'Also improves scrolling through comments',
    type: 'checkbox',
    advanced: true,
    default: false
  },
  {
    name: 'hideScrollbar',
    label: 'Hide scrollbar',
    type: 'checkbox',
    advanced: true,
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
    name: 'videoDebandingStrength',
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
    advanced: true,
    new: true
  },
  {
    name: 'videoOverlayEnabled',
    label: 'Sync video with ambient light',
    questionMark: {
      title: 'Delays the video frames according to the ambient light frametimes.\nThis makes sure that that the ambient light is never out of sync with the video,\nbut it can introduce stuttering and/or dropped frames.'
    },
    type: 'checkbox',
    default: false,
    advanced: true
  },
  {
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
    name: 'chromiumBugVideoJitterWorkaround',
    label: 'Video jitter workaround',
    description: 'Only required for monitors above 60Hz',
    questionMark: {
      title: 'Click for more information about this bug in Chromium browsers',
      href: 'https://github.com/WesselKroos/youtube-ambilight/issues/166'
    },
    type: 'checkbox',
    default: true,
    advanced: true,
    experimental: true
  },
  {
    type: 'section',
    label: 'Remove black & colored bars',
    name: 'sectionHorizontalBarsCollapsed',
    default: true
  },
  {
    name: 'detectHorizontalBarSizeEnabled',
    label: 'Remove black bars',
    description: 'Uses: CPU power',
    type: 'checkbox',
    default: false,
    defaultKey: 'B'
  },
  {
    name: 'detectVerticalBarSizeEnabled',
    label: 'Remove black sidebars',
    description: 'Uses: CPU power',
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
    name: 'barSizeDetectionAverageHistorySize',
    label: 'Bar detection average',
    questionMark: {
      title: 'The amount of video frames to detect an average bar size from. \nA lower amount of frames results in a faster detection, \nbut does also increase the amount of inaccurate detections.'
    },
    type: 'list',
    default: 4,
    min: 1,
    max: 30,
    step: 1,
    advanced: true
  },
  {
    name: 'detectHorizontalBarSizeOffsetPercentage',
    label: 'Bar detection offset',
    type: 'list',
    default: 0,
    min: -5,
    max: 5,
    step: 0.1,
    advanced: true
  },
  {
    name: 'horizontalBarsClipPercentage',
    label: 'Bar size',
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
    label: 'Sidebars size',
    type: 'list',
    default: 0,
    min: 0,
    max: 40,
    step: 0.1,
    advanced: true
  },
  {
    name: 'horizontalBarsClipPercentageReset',
    label: 'Reset bars next video',
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
    name: 'sectionImageAdjustmentCollapsed',
    default: true
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
    name: 'vibrance',
    label: 'Colors',
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 0.1
  },
  {
    name: 'saturation',
    label: 'Saturation',
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1
  },
  {
    type: 'section',
    label: 'HDR Filters',
    name: 'sectionHdrImageAdjustmentCollapsed',
    default: false,
    hdr: true
  },
  {
    name: 'hdrBrightness',
    label: 'Brightness',
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    hdr: true
  },
  {
    name: 'hdrContrast',
    label: 'Contrast',
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    hdr: true
  },
  {
    name: 'hdrSaturation',
    label: 'Saturation',
    type: 'list',
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    hdr: true
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
    name: 'sectionAmbientlightCollapsed',
    default: false
  },
  {
    name: 'blur2',
    label: 'Blur',
    description: 'Uses: GPU memory',
    type: 'list',
    default: 30,
    min: 0,
    max: 100,
    step: .1
  },
  {
    name: 'edge',
    label: 'Edge size',
    description: 'To better see what changes: Turn the blur to 0%',
    type: 'list',
    default: 12,
    min: 2,
    max: 50,
    step: .1,
    advanced: true
  },
  {
    name: 'spread',
    label: 'Spread',
    description: 'Uses: GPU power',
    type: 'list',
    default: 17,
    min: 0,
    max: 400,
    step: .1
  },
  {
    name: 'spreadFadeStart',
    label: 'Spread fade start',
    type: 'list',
    default: 15,
    min: -50,
    max: 100,
    step: .1,
    advanced: true
  },
  {
    name: 'spreadFadeCurve',
    label: 'Spread fade curve',
    description: 'To better see what changes: Turn the blur to 0%',
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
    name: 'frameFading',
    label: 'Fade in duration',
    description: 'Uses: GPU memory',
    questionMark: {
      title: 'Fading between changes in the ambient light'
    },
    type: 'list',
    default: 0,
    min: 0,
    max: 21.2, // 15 seconds
    step: .02,
    manualinput: false
  },
  {
    name: 'flickerReduction',
    label: 'Flicker reduction',
    questionMark: {
      title: 'Reduces flickering by limiting the speed at which brightness changes in the ambient light'
    },
    type: 'list',
    default: 0,
    min: 0,
    max: 100,
    step: 1,
    manualinput: false,
    advanced: true,
    new: true
  },
  {
    name: 'frameBlending',
    label: 'Smooth motion (frame blending)',
    questionMark: {
      title: 'Click for more information about Frame blending',
      href: 'https://www.youtube.com/watch?v=m_wfO4fvH8M&t=81s'
    },
    description: 'Uses: GPU power. Also works with "Sync video"',
    type: 'checkbox',
    default: false,
    advanced: true
  },
  {
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
    name: 'fixedPosition',
    label: 'Fixed position',
    description: 'Ignores the scroll position of the page',
    type: 'checkbox',
    default: false,
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
    name: 'enableInPictureInPicture',
    label: 'Enable in Picture-in-picture mode',
    type: 'checkbox',
    default: false,
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

export default SettingsConfig