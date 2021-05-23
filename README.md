![YouTube Ambilight](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/heading.png?raw=true)

Immersive yourself in YouTube videos with ambilight!

![Preview](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/readme/screenshot-1.jpg?raw=true)

# YouTube Ambilight

## Installation
Go to the extensions site of your browser and add the extension:

[![Google Chrome Web Store](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/browsers/Google%20Chrome.png?raw=true)](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj)

[![Firefox Browser Add-ons](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/browsers/Firefox.png?raw=true)](https://addons.mozilla.org/firefox/addon/youtube-ambilight/)

[![Opera addons](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/browsers/Opera.png?raw=true)](https://addons.opera.com/nl/extensions/details/youtube-ambilight/)

[![Microsoft Edge Store](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Microsoft%20Edge.png?raw=true)](https://microsoftedge.microsoft.com/addons/detail/cmggdjjjfembmemhleknmfpakmgggjcf)


## Minimum requirements

### Performance
A video card with a score of at least 5000 points in the PassMark Video Card Benchmark is recommended.
Check your video card's score here:

https://www.videocardbenchmark.net/gpu_list.php

With a score lower than 5000 the extension will still work but it is likely that the YouTube video page will be slow and/or stuttering.

### Browser versions
| Browser  | Version | Reason |
| -------- | ------- | ------ |
| Chromium | 69      | [OffscreenCanvas.getContext('2d')](https://caniuse.com/mdn-api_offscreencanvas_getcontext) |
| Firefox  | 69.0    | [ResizeObserver](https://caniuse.com/resizeobserver) |


## Privacy & Security
- This extension only runs on tabs that start with the url https://www.youtube.com. The extension will only activate the ambilight effect on YouTube's /watch page

The following projectfiles are inserted into that specific webpage:
- \src\scripts\youtube-ambilight.js
- \src\styles\youtube-ambilight.css

The only requests being sent are crash reports. If a crash occures a request is being sent to [Sentri.io](https://sentry.io). 
No other requests are sent to any webserver, website or api.


## Report, request or contribute
Feel free to 
- contribute to the project at https://github.com/WesselKroos/youtube-ambilight
- report bugs at https://github.com/WesselKroos/youtube-ambilight/issues
- request a feature at https://github.com/WesselKroos/youtube-ambilight/issues
- or ask a question at https://github.com/WesselKroos/youtube-ambilight/issues


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
