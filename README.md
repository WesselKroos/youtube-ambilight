[![Ambient light for YouTube™](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/heading.png?raw=true)](https://github.com/WesselKroos/youtube-ambilight#readme)

Immersive yourself in YouTube videos with ambient light!

![Preview](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/readme/screenshot-1.jpg?raw=true)

# Ambient light for YouTube™

## Installation
Go to the extensions site of your browser and add the extension:

[![Google Chrome Web Store](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/browsers/Google%20Chrome.png?raw=true)](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj)

[![Microsoft Edge Store](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Microsoft%20Edge.png?raw=true)](https://microsoftedge.microsoft.com/addons/detail/cmggdjjjfembmemhleknmfpakmgggjcf)

[![Firefox Add-ons](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Firefox.png?raw=true)](https://addons.mozilla.org/en-US/firefox/addon/ambient-light-for-youtube/)

[![Opera addons](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/browsers/Opera.png?raw=true)](https://addons.opera.com/nl/extensions/details/youtube-ambilight/)


## Minimum requirements

### Performance
A video card with a score of at least 1000 points in the PassMark Video Card Benchmark is recommended.
Check your video card's score here:

https://www.videocardbenchmark.net/gpu_list.php

With a score lower than 1000 the extension will still work but it is likely that the YouTube video page will be slow and/or stuttering.
> To troubleshoot performance problems or maximze the performance you can follow the checks and steps in the [Troubleshoot guide](https://github.com/WesselKroos/youtube-ambilight/blob/master/TROUBLESHOOT.md)


### Browser versions
| Browser  | Version | Reason |
| -------- | ------- | ------ |
| Chromium | 80      | [Optional chaining operator (?.)](https://caniuse.com/mdn-javascript_operators_optional_chaining) |
| Firefox  | 74      | [Optional chaining operator (?.)](https://caniuse.com/mdn-javascript_operators_optional_chaining) |


## Privacy & Security
- This extension only runs on tabs that start with the url https://www.youtube.com. The extension will only activate the ambient light effect on YouTube's /watch page
- The only requests being sent are crash reports. (But crash reports can be turned off.) No other requests are sent to any webserver, website or api. But in case a crash occurs the report is sent to [Sentri.io](https://sentry.io) and will always be deleted after 30 days. Because the only goal of these crash reports is to fix the crash.

### Crash report data
Crash reports, and individual groups of data, can be turned off. But in case a crash report is sent it could contain:
- The url and video ID being watched at the time of the crash
- Anonymous technical data
    - Browser version
    - Operating system version
    - Display capabilities
    - Videoplayer state (Does not contain the video id or title)
    - YouTube layout state (Does not contain your YouTube account data)
- Ambient light state and error information


## Report, request or contribute
Feel free to 
- contribute to the project at [/youtube-ambilight](https://github.com/WesselKroos/youtube-ambilight)
- report bugs at [/youtube-ambilight/issues](https://github.com/WesselKroos/youtube-ambilight/issues)
- request a feature at [/youtube-ambilight/issues](https://github.com/WesselKroos/youtube-ambilight/issues)
- or ask a question at [/youtube-ambilight/issues](https://github.com/WesselKroos/youtube-ambilight/issues)


## Development
1. Install [Node (LTS)](https://nodejs.org/en/download/)
2. In the terminal/commandline enter `npm install`.
3. In the terminal/commandline enter `npm run build`. A `/dist` folder will be generated which contains all the generated files of the extension.
4. Add the extension to Chrome:
    1. In Chrome go to the url [chrome://extensions/](chrome://extensions/).
    2. Turn on the `Developer mode` toggle.
    3. Click `Load unpacked` and select the `/dist` folder.
    4. `Ambient light for YouTube™` has been added to the list of extensions.
5. After you've modified a file in the `/src` folder follow these steps:
    1. In the terminal/commandline enter `npm run build`
    2. In Chrome go to the url [chrome://extensions/](chrome://extensions/) and click the refresh/update button in the card of the extension.
