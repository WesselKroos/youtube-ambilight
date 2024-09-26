<a href="https://ko-fi.com/G2G59EK8L" rel="noopener">
  <img align="right" src="https://github.com/WesselKroos/youtube-ambilight/blob/master/src/images/donate.svg?raw=true" title="Support me via a donation">
</a>

[![Ambient light for YouTube™](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/heading.png?raw=true)](https://github.com/WesselKroos/youtube-ambilight#readme)

Immerse yourself in YouTube videos with ambient light!

![Preview](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/readme/screenshot-1.jpg?raw=true)

---

# Ambient light for YouTube™

## Installation
Go to the extensions site of your browser and add the extension:

[![Google Chrome Web Store](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/browsers/Google%20Chrome.png?raw=true)](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj)

[![Microsoft Edge Store](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Microsoft%20Edge.png?raw=true)](https://microsoftedge.microsoft.com/addons/detail/cmggdjjjfembmemhleknmfpakmgggjcf)

[![Firefox Add-ons](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Firefox.png?raw=true)](https://addons.mozilla.org/en-US/firefox/addon/ambient-light-for-youtube/)

[![Opera addons](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/browsers/Opera.png?raw=true)](https://addons.opera.com/nl/extensions/details/youtube-ambilight/)

## Getting Started
### Quality
Resolution: Adjusts the resolution of the video colors from 6.25% to 400%. Default is 100%.  
Limit framerate (per second): Limits the framerate of the colors from 1fps to 60fps. Can also be left unlimited.  

### Page header
Shadow size: Adjust the shadow size of the page header from 0% to 100%.  
Shadow opacity: Adjusts the opacity of the page header shadow from 0% to 100%. Only required if shadow size is enabled.  
Images opacity: Adjusts the opacity of the page header images from 0% to 100%.

### Page content
Shadow size: Adjust the shadow size of the page content from 0% to 100%.  
Shadow opacity: Adjusts the opacity of the page content shadow from 0% to 100%. Only required if shadow size is enabled.  
Images opacity: Adjusts the opacity of the page content images from 0% to 100%.
Buttons & boxes background opacity: Adjusts the opacity of the page content buttons and boxes background from -100% to 100%.  
Background greyness: Adjusts the greyness of the background page content from 0% to 100%.  
Hide everything in theater mode: Removes the background youtube content when in theatre mode. Disabled by default.

### Video
Size: Adjusts the size of the video from 25% to 200% where 100% is the default size of a youtube video.  
Shadow size: Adjust the shadow size of the video from 0% to 100%.  
Shadow opacity: Adjusts the opacity of the video shadow from 0% to 100%. Only required if shadow size is enabled.

### Remove black & colored bars
Remove black bars[B]: Removes horizontal black bars found on the top and bottom of videos which are not the same resolution.  
Remove black sidebars[V]: Removes vertical black bars found on the sides of videos which are not the same resolution.  
Fill video to removed bars[H]: Fills the video to take up the whole screen to hide any black bars. Will result in a loss of certain amount of the original video screen.

### Filters
Colors: Adjust the intensity of the ambient light color from 0% to 200%

### Ambient light
Blur: Adjusts the intensity of the blurring of the ambient light from 0% to 100.  
Spread: Adjusts how far the ambient light spreads from the video from 0% to 400%.  
Fade in duration: Adjusts the time spent fading in between changes in the ambient light from 0 seconds to 15 seconds.  

### View modes
Enable in layouts: Adjust when the ambient light settings takes effect. Can be changed from all youtube video modes or specific ones such as theatre or fullscreen as required.

### General
Appearance (theme): Changes the look and feel of youtube from the light and dark modes.  
Enabled[G]: Enable or disable the ambient light settings.

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
