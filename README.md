# ![YouTube Ambilight](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/heading.png?raw=true)
This browser extension adds ambilight to the videos you view on YouTube

## Installation
Go to the extensions site of your browser and add the extension:

[![Google Chrome Web Store](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Google%20Chrome.png?raw=true)](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj)

[![Firefox Browser Add-ons](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Firefox.png?raw=true)](https://addons.mozilla.org/firefox/addon/youtube-ambilight/)

[![Opera addons](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Opera.png?raw=true)](https://addons.opera.com/nl/extensions/details/youtube-ambilight/)

## Privacy & Security
- This extension only runs on tabs that start with the url https://www.youtube.com. The extension will only activate the ambilight effect on YouTube's /watch page

The following projectfiles are inserted into that specific webpage:
- \src\scripts\youtube-ambilight.js
- \src\styles\youtube-ambilight.css

The only requests being sent are crash reports. If a crash occures a request is being sent to [Sentri.io](https://sentry.io). 
No other requests are sent to any webserver, website or api.

## Report, request or contribute
Feel free to 
- contribute to the project at https://github.com/WesselKroos/chrome-youtube-ambilight
- report bugs at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
- request a feature at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
- or ask a question at https://github.com/WesselKroos/chrome-youtube-ambilight/issues

## Development
1. Install [Node (LTS)](https://nodejs.org/en/download/) & [Yarn](https://yarnpkg.com/en/docs/install)
2. In the terminal/commandline enter `yarn build`. A `/dist` folder will be generated which is the source of the Chrome extension.
3. Add the extension to Chrome:
    1. In Chrome go to the url [chrome://extensions/](chrome://extensions/).
    2. Turn on the `Developer mode` toggle.
    3. Click `Load unpacked` and select the `/dist` folder.
    4. `YouTube Ambilight` has been added to the list of extensions.
4. After you've modified a file in the `/src` folder follow these steps:
    1. In the terminal/commandline enter `yarn build`
    2. In Chrome go to the url [chrome://extensions/](chrome://extensions/) and click the refresh/update button in the card of the extension.

## New features: progress
- [x] FPS counter
- [x] Start ambilight with the MutationObserver
- [x] Switch darkmode with the MutationObserver
- [x] Reset to light mode (Setting is automatically enabled)
- [x] Don't apply ambilight styling in light theme
- [x] Hide horizontal black bars setting
- [x] Surrounding content shadow setting
- [x] Error reporting
- [x] Check optimizations on a laptop like the async rendering of the canvas
- [x] debanding (noise levels)
- [x] Combine scale & hide horizontal black bars settings
- [x] Group settings
- [x] Restore VR exclusion
- [x] Remove ambilight bleeding on the browser edges since Chrome 73
- [x] Split shadow settings into opacity and size
- [x] Resize, stop, start, other source events performance
- [x] Fix styles error Sentry
- [x] Fullscreen slider knob size
- [x] Turn FPS on/off even when ambilight is turned off
- [x] Render ambilight when paused
- [x] Smooth Motion with seeking support
- [x] Fix framedrop when cutting of the black bars in version 2.27.1 vs 2.27
- [x] Make sure the new buffers dont crash Chrome on lower end devices and it's still smooth on laptops (opacity: 0; stackoverflows the gpu memory)
- [x] Temporary turn off the video sync canvas when the framerate is to low
- [x] Turn on the Ambilight extension on existing tabs after the installation. This way a refresh is not needed anymore
- [x] Ambilight directions setting (top, right, bottom, left)
- [x] Firefox: resizing and restore from inactive browser
- [ ] Add a timeout and timeoutCallback to the waitForDomElement function
- [ ] Adjust the lowest spread setting to rendering only one canvas element
- [ ] Buffer frames in video sync mode for smoother motion in the video
- [ ] Fix antialiasing in video sync mode. Example: https://youtu.be/e8SkIex2zXk?t=76 https://www.youtube.com/watch?v=PaErPyEnDvk
- [ ] Firefox: blur(100px) max workaround: Add a second element with blur(100px)