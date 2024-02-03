<a href="https://ko-fi.com/G2G59EK8L" rel="noopener">
  <img align="right" src="https://github.com/WesselKroos/youtube-ambilight/blob/master/src/images/donate.svg?raw=true" title="Support me via a donation">
</a>

# Optimizing or troubleshooting performance problems
This is a performance guide that helps you get the best performance (and reduced CPU and GPU usage) in your browser.
The best way to debug troubleshoot problems is to first set the Ambient light extension settings to their optimal values and then start to optimize your browser settings.

## But first, check these things:
>  1. Make sure you are on a device with an integrated or dedicated graphics card. The ambient light effect won't run well on a device without hardware acceleration.

>  2. Because issues can suddenly appear when a browser has been updated to a new version or a graphics card has been updated to a new driver version, make sure that you aren't suffering from any known issues listed at: [Known issues and solutions](#known-issues-and-solutions)

### Index
- [Ambient light extension settings](#ambient-light-extension-settings)
- [Browser settings: Chrome / Edge / Opera / Vivaldi (Chromium browsers)](#chrome--edge--opera--vivaldi-chromium-browsers)
- [Browser settings: Firefox](#firefox)
- [Known issues and solutions](#known-issues-and-solutions)
- [Request troubleshooting assistance or report a browser bug](#request-troubleshooting-assistance-or-report-a-browser-bug)

---

# Ambient light extension settings
### Quick steps
A quick guide to get the best settings for performance:

1. Click on the `Reset all settings` arrow in the top right of the ambient light menu and then change these settings:
    - Quality > Limit framerate (per second): `30 fps` _(This reduces GPU usage in case you are watching a 60 fps video)_
    - Quality > WebGL renderer (uses less power): `On` _(If not available you need to turn on WebGL in the browser)_
    - Quality > WebGL resolution: `25%`

### Manual steps
But in case you don't want to reset all your current settings, here is a complete list of optimal settings that you can use to start from. From then on you can gradually turn up individual settings to test the limits of your device:

- Settings:
  - Advanced: `On`
- Quality
  - Synchronization: `Video framerate` __(in Firefox: `Decoded framerate`)__
  - Limit framerate (per second): `30 fps` _(This reduces GPU usage in case you are watching a 60 fps video)_
  - WebGL renderer (uses less power): `On` _(If not available you need to turn on WebGL in the browser)_
  - WebGL resolution: `25%`
  - Sync video with ambient light: `Off`
  - Smooth motion (frame blending): `Off`
- Page content
  - Shadow only on text and buttons: `On`
- Video
  - Shadow size: `0%`
- Black bars
  - Remove black bars: `Off`
  - Remove black sidebars: `Off`
- Ambient light
  - Blur: `30% or lower`
  - Spread: `30% or lower`

---

# Browser settings
For the best performance it's important to have an integrated or dedicated graphics card, so that you can enable hardware acceleration in the browser and validate that the browser is using your graphics card. These steps differ per browser.

## Chrome / Edge / Opera / Vivaldi (Chromium browsers)
### Check graphics card availability
1. Make sure that your graphics card is used by the browser:
    1. Go to the url [chrome://settings/system]() _(The browser blocks `chrome://` links, you have to manually copy and paste this url in a new tab)_
    2. Check `Use hardware acceleration when available`

2. Make sure that your graphics card is detected by the browser:
    1. Go to the url [chrome://gpu]()
    2. Check the value `GL_RENDERER: <the name of you graphics card>`

If your graphics card is not detected: `Hardware acceleration` may not be enabled or you need to assign the browser to your graphics card from the graphics control panel of 
[NVidia](https://nvidia.custhelp.com/app/answers/detail/a_id/5035/kw/preferred),
[AMD & Intel switchable](https://www.amd.com/en/support/kb/faq/dh-017)
or via the [Windows graphics settings](https://www.amd.com/en/support/kb/faq/gpu-110#faq-Customizing-Graphics-Performance-Preference-for-a-Desktop-App).

### Check graphics card features
How to check that your graphics card's features are used by the browser:
1. Go to the url [chrome://gpu]()
2. Check the values:
    - Canvas: `Hardware accelerated`
    - Compositing: `Hardware accelerated`
    - OpenGL: `Enabled`
    - Rasterization: `Hardware accelerated`
    - Skia Renderer: `Enabled`
    - Video Decode: `Hardware accelerated`
    - WebGL: `Hardware accelerated`
    - WebGL2: `Hardware accelerated` _(WebGL2 requires a DirectX 11 capable graphics card)_

If some of the values are not `Enabled` / `Hardware accelerated` you can try to enable features via certain flags in [chrome://flags]().

> ⚠️ __However there is always a chance that the browser will crash when a flag is enabled.__
> 
> In case this happens you can always launch Chrome without flags by creating a shortcut with `--no-experiments`. _(Set the shortcut target field to: `"...\chrome.exe" --no-experiments`)_

Here is a list of the flags that may fix the values in [chrome://gpu]() if necessary:
- [chrome://flags/#ignore-gpu-blocklist](): `Enabled` (& [chrome://settings/system](): `Use hardware acceleration when available`)
  - Compositing
  - OpenGL
  - Skia Renderer
  - WebGL
  - WebGL2
- [chrome://flags/#disable-accelerated-2d-canvas](): `Enabled`
  - Canvas
- [chrome://flags/#enable-gpu-rasterization](): `Enabled` (`Default` could also work)
  - Rasterization
- [chrome://flags/#disable-accelerated-video-decode](): `Enabled`
  - Video Decode

### Select the best graphics card backend
When you have hardware acceleration enabled the browser has a range of graphics backends available that you can use. You want to enable the fastest graphics backend that runs stable on your device. So be aware that not all the backends might run correctly or at all on your graphics card.
1. Go to [chrome://flags/#use-angle]() and open the dropdown
2. Enable every option in the following order from fastest to slowest: `D3D11on12 > D3D11 > D3D9 > OpenGL` And check if it works correctly by browsing a few webpages and playing some videos. If it does, this is the fastest usable backend for your graphics card.

> There is also a `Vulkan` backend, but on my device it's performance sits in the range of `OpenGL` and `D3D9` and crashes when I play a video. But you can enable it via this flag here:
>  - [chrome://flags/#enable-vulkan]() `Enabled`

---

## Firefox
### Check graphics card availability
1. How to make sure that your graphics card is used by Firefox:

   1. Go to [about:preferences]() _(The browser blocks `about:` links, you have to manually copy and paste this url in a new tab)_
   2. Scroll down to `Performance`
   3. Uncheck `Use recommended performance settings` and make sure that `Use hardware acceleration when available` is checked. 

> If `Use hardware acceleration when available` was already checked you can re-check `Use recommended performance settings`

2. How to check that your graphics card is detected by Firefox:
    1. Go to [about:support#graphics-gpu-1-tbody]()
    2. Check the values:
        - GPU #1 > Active: `Yes`
        - GPU #1 > Description: `<the name of you graphics card>`

If your graphics card is not detected: `Hardware acceleration` may not be enabled or you need to assign the browser to your graphics card from the graphics control panel of 
[NVidia](https://nvidia.custhelp.com/app/answers/detail/a_id/5035/kw/preferred),
[AMD & Intel switchable](https://www.amd.com/en/support/kb/faq/dh-017)
or via the [Windows graphics settings](https://www.amd.com/en/support/kb/faq/gpu-110#faq-Customizing-Graphics-Performance-Preference-for-a-Desktop-App).

### Check graphics card features
How to check that your graphics card's features are used by Firefox:
1. Go to [about:support#graphics]()  and check the values:
    - Compositing: `WebRender`
    - WebGL 1 Driver Renderer: `<the name of you graphics card>`
    - WebGL 1 Driver Version: `OpenGL ES 2.0.0`
    - WebGL 2 Driver Renderer: `<the name of you graphics card>`
    - WebGL 2 Driver Version: `OpenGL ES 3.0.0`
    - Direct2D: `true`

2. Go to [about:support#graphics-decisions-tbody]() and check the values:
    - HW_COMPOSITING: `available`
    - D3D11_COMPOSITING: `available`
    - DIRECT2D: `available`
    - D3D11_HW_ANGLE: `available`
    - GPU_PROCESS: `available`
    - WEBRENDER: `available`
    - WEBRENDER_QUALIFIED: `available`
    - WEBRENDER_COMPOSITOR: `available`
    - VP9_HW_DECODE: `available` _(This is important because most youtube video's are served in the VP9 codec)_

If any of the values in step 2 and 3 are incorrect you can go to [about:config]() to turn the features on. Because every device is different you'll have to match the incorrect features to the correct configuration flags. But here are at least a few configuration flags that you can try out to get the correct values:
- gfx.webrender.all: `true`
- gfx.webrender.compositor: `true`
- gfx.webrender.compositor.force-enabled: `true`
- gfx.webrender.enabled: `true`
- gfx.webrender.force-angle: `true`

> More information about enabling hardware acceleration on Firefox can be found in the Mozilla wiki: https://wiki.mozilla.org/Blocklisting/Blocked_Graphics_Drivers#How_to_force-enable_blocked_graphics_features

---

# Known issues and solutions

## 1. Video's stutter or freezes completely when there are 2 browser windows open

Chromium browsers (Chrome, Edge, Opera) have a problem with the playback of a video while in another browser window a graphical effect is being rendered. These graphical effects are often animations. For example: a loading animation, or hovering over a link that slowly changes color. This happens in some hardware (CPU and/or GPU) configurations, but doesn't happen for everyone. 

   __To workaround this issue follow these steps:__
   1. Go to chrome://flags (or edge://flags or opera://flags)
   2. Search for the flag "Hardware-accelerated video decode" with the hashtag #disable-accelerated-video-decode
   3. Set that flag to disabled
   4. Click on the relaunch button at the bottom right

If it has been fixed after that change, you were affected by this Chromium bug.
Make sure to leave your CPU and GPU configuration in this Chromium bug report so that the Chromium developers can try to fix this bug for you hardware: 
[Issue 1461254: Video playback freezes when 2 visible windows have running animations](https://bugs.chromium.org/p/chromium/issues/detail?id=1461254)

## 2. Video's in 4K and higher resolutions or 50/60fps are stuttering or dropping frames

1. Are you using a NVidia graphics card on Windows? Then you might have this issue:
   [Issue 1431590: Frame drops and jitter on 4k60fps videos when NVidia's Power management mode is set to Adaptive](https://bugs.chromium.org/p/chromium/issues/detail?id=1431590)
   
   __To workaround this issue follow these steps:__
   1. Make sure that the NVidia gpu is used for video decoding. Change your settings in Windows and/or the NVidia control panel if it is not yet used by the browser. (To see if it is being used check the usage in the graph at: Windows Task Manager > Performance > GPU > Video Decode)
   2. Then open the NVIDIA control panel and go to: 3D Settings > Manage 3D settings > Global settings (Or for example "Program settings > Google Chrome (chrome.exe)" if you have custom settings defined for Google Chrome. This can also be customized for other browsers)
   3. Change the setting: "Power management mode" to "Prefer maximum performance" and click on the Apply button.
   4. Restart your PC (Because sometimes changes in the NVIDIA control panel settings are not applied at runtime. This makes it impossible to fix this issue reliably without a restart.)
   5. Open the video url: https://www.youtube.com/watch?v=rqJDO3TWnac and set the video quality to 4K 60FPS
   6. Let the video play for at least 30 seconds to validate that there is no jitter and are no frame drops anymore.

2. Are you using multiple graphics cards? (For example: The integrated AMD/Intel GPU of your CPU and a dedicated NVidia/AMD/Intel GPU) Then try them one by one to see which one works the best. You can select a GPU per application in the settings of the operating system.
   > In Windows this setting can be found at __Settings > Graphics settings__, add the browser to the list, click on the __Options__ button, select a GPU and then restart the browser.

3. For Chromium browsers: The D3D11on12 graphics backend is more efficiënt. To enable it follow the instructions in [Select the best graphics card backend](#select-the-best-graphics-card-backend)

## 3. NVidia RTX Video Super Resolution (VSR) / NVidia RTX Video HDR does not work

   __To enable support for NVidia RTX Video follow these steps:__
   1. Open the Ambient light settings
   2. Enable the setting: Settings > Advanced
   3. Disable the setting: Settings > Video > Video artifacts workaround
   4. [Optional] Re-disable the setting: Settings > Advanced

NVidia RTX Video requires Window's Multi-Plane Overlay feature. The ambient light disables this feature by default to prevent graphical artifacts that appear for some users. For more info about these artifacts you can visit: [Issue 1155285: Occasionally checkered artifacts when using drawImage directly in the video.requestVideoFrameCallback callback](https://bugs.chromium.org/p/chromium/issues/detail?id=1155285)

---

# Request troubleshooting assistance or report a browser bug
If the above steps did not work you can report bugs or ask for help via these links:
- Firefox: [Enter a Firefox bug](https://bugzilla.mozilla.org/enter_bug.cgi)
- Chrome / Edge / Opera / Vivaldi (Chromium browsers): [Report a Chromium bug](https://bugs.chromium.org/p/chromium/issues/wizard)
- Ambient light for YouTube™: [Request troubleshooting assistance](https://github.com/WesselKroos/youtube-ambilight/issues/new?assignees=WesselKroos&labels=S%3A+Todo%2C+T%3A+Question&template=performance_issue.md)
