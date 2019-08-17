# Chrome YouTube Ambilight
This Chrome Extension adds ambilight to the videos you view on YouTube

## Installation
Go to [YouTube Ambilight on the Chrome Web Store](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj) and add the extension to Chrome

## Planned features
  - [Usability] Turn on the Ambilight extension on existing tabs after the installation. This way a refresh is not needed anymore
  
## Privacy & Security
- This Chrome Extension uses the [activeTab](https://developer.chrome.com/extensions/activeTab) permission only on urls that start with https://www.youtube.com. The extension will only activate the ambilight extension on YouTube's /watch page

The following projectfiles are inserted into that specific webpage:
- \src\scripts\youtube-ambilight.js
- \src\styles\main.css

This extension executes NO requests to any webserver, website or api.

## Report, request or contribute
Feel free to 
- contribute to the project at https://github.com/WesselKroos/chrome-youtube-ambilight
- report bugs at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
- request a feature at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
- or ask a question at https://github.com/WesselKroos/chrome-youtube-ambilight/issues

## New features: progress
- FPS counter
- Start ambilight with the MutationObserver
- Switch darkmode with the MutationObserver
- Reset to light mode (Setting is automatically enabled)
- Don't apply ambilight styling in light theme
- Hide horizontal black bars setting
- Surrounding content shadow setting
- Error reporting
- Check optimizations on a laptop like the async rendering of the canvas
- debanding (noise levels)
- Combine scale & hide horizontal black bars settings
- Group settings
- Restore VR exclusion
- Remove ambilight bleeding on the browser edges since Chrome 73
- Split shadow settings into opacity and size
x Only horizontal ambilight setting
x Resize, stop, start, other source events performance