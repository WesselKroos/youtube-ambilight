[![Google Chrome Web rating](https://img.shields.io/chrome-web-store/rating/paponcgjfojgemddooebbgniglhkajkj?logo=googlechrome&color=brightgreen)](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj) [![Google Chrome users](https://img.shields.io/chrome-web-store/users/paponcgjfojgemddooebbgniglhkajkj?logo=googlechrome&color=blue)](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj) &nbsp; [![Microsoft Edge rating](https://img.shields.io/badge/dynamic/json?label=rating&suffix=/5&query=%24.averageRating&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fcmggdjjjfembmemhleknmfpakmgggjcf&logo=embarcadero&color=brightgreen)](https://microsoftedge.microsoft.com/addons/detail/cmggdjjjfembmemhleknmfpakmgggjcf) [![Microsoft Edge users](https://img.shields.io/badge/dynamic/json?label=users&query=%24.activeInstallCount&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fcmggdjjjfembmemhleknmfpakmgggjcf&logo=embarcadero&color=blue)](https://microsoftedge.microsoft.com/addons/detail/cmggdjjjfembmemhleknmfpakmgggjcf) &nbsp; [![Firefox rating](https://img.shields.io/amo/rating/ambient-light-for-youtube?logo=firefoxbrowser)](https://addons.mozilla.org/en-US/firefox/addon/ambient-light-for-youtube/) [![Firefox users](https://img.shields.io/amo/users/ambient-light-for-youtube?logo=firefoxbrowser&color=blue)](https://addons.mozilla.org/en-US/firefox/addon/ambient-light-for-youtube/) &nbsp; [![Opera rating](https://img.shields.io/badge/rating-4.4/5-brightgreen?logo=opera)](https://addons.opera.com/nl/extensions/details/youtube-ambilight/) [![Opera users](https://img.shields.io/badge/downloads-20k-blue?logo=opera)](https://addons.opera.com/nl/extensions/details/youtube-ambilight/)

<a href="https://ko-fi.com/G2G59EK8L" rel="noopener">
  <img align="right" src="https://github.com/WesselKroos/youtube-ambilight/blob/master/src/images/donate.svg?raw=true" title="Support me via a donation">
</a>

[![Ambient light for YouTube™](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/heading.png?raw=true)](https://github.com/WesselKroos/youtube-ambilight#readme)

![Preview](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/readme/screenshot-1.jpg?raw=true)


# Ambient light for YouTube™
Immerse yourself in YouTube videos with ambient light!

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
> To troubleshoot performance problems or maximize the performance you can follow the checks and steps in the [Troubleshoot guide](https://github.com/WesselKroos/youtube-ambilight/blob/master/TROUBLESHOOT.md)


### Browser versions
| Browser  | Version | Reason |
| -------- | ------- | ------ |
| Chromium | 80      | [Optional chaining operator (?.)](https://caniuse.com/mdn-javascript_operators_optional_chaining) |
| Firefox  | 74      | [Optional chaining operator (?.)](https://caniuse.com/mdn-javascript_operators_optional_chaining) |
| Safari   | 15.4    | [Safari Web Extensions & ES module support](https://developer.apple.com/documentation/safariservices/safari_web_extensions) |


## Privacy & Security
Read the [privacy policy](/PRIVACY-POLICY.md)


## Report, request or contribute
Feel free to 
- contribute to the project at [/youtube-ambilight](https://github.com/WesselKroos/youtube-ambilight)
- report bugs at [/youtube-ambilight/issues](https://github.com/WesselKroos/youtube-ambilight/issues)
- request a feature at [/youtube-ambilight/issues](https://github.com/WesselKroos/youtube-ambilight/issues)
- or ask a question at [/youtube-ambilight/issues](https://github.com/WesselKroos/youtube-ambilight/issues)


## Support me
[![Support me via a donation](https://github.com/WesselKroos/youtube-ambilight/blob/master/src/images/donate.svg?raw=true)](https://ko-fi.com/G2G59EK8L)


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

## Safari Web Extension (macOS)

### Building and Running on Safari

1. **Prerequisites**: macOS 12.0+ and Xcode 14+ installed.
2. **Build Web Extension & Xcode Project**:
   ```bash
   npm install
   npm run build:safari
   ```
   Or build the web resources only:
   ```bash
   npm run build
   ```
3. **Open in Xcode**:
   Open `Xcode/YouTubeAmbilight.xcodeproj` in Xcode.
4. **Enable Developer Menu in Safari**:
   - Open Safari.
   - Go to **Safari > Settings** (or **Preferences**) > **Advanced**.
   - Check **Show features for web developers** (or **Show Develop menu in menu bar**).
5. **Allow Unsigned Extensions**:
   - In Safari's menu bar, click the **Develop** menu.
   - Check **Allow Unsigned Extensions** (enter your macOS administrator password when prompted).
   *(Note: This setting resets each time Safari is completely quit and restarted).*
6. **Run the Host Application from Xcode**:
   - In Xcode, select the `YouTubeAmbilight` scheme and `My Mac` destination.
   - Click **Run** (or press `Cmd + R`).
   - The YouTube Ambilight host application will launch and check extension status. Click **Quit and Open Safari Extensions Preferences…**.
7. **Enable Extension in Safari**:
   - In Safari Settings > **Extensions**, check the box next to **YouTube Ambilight**.
   - Grant permission for `youtube.com` when prompted.
8. **Test on YouTube**:
   - Navigate to `https://www.youtube.com` and play any video.
   - The Ambilight engine will initialize with WebGL (or Canvas 2D fallback).

### Safari-specific Notes & Architecture
- **Unsigned Extensions**: During local development without an Apple Developer certificate, "Allow Unsigned Extensions" must be checked in Safari's Develop menu.
- **Automatic Resource Updates**: Running `npm run build` updates the `dist/` folder, which is directly referenced by the Xcode extension target. Re-running the app in Xcode immediately deploys the latest scripts, styles, and manifest without manual file copying.
- **Isolated & Page World Messaging**: Uses WebKit-standard DOM CustomEvent (`ytal-message`) dispatch between the isolated content script world and the main page world.

