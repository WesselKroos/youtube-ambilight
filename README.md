# Chrome YouTube Ambilight
This Chrome Extension adds ambilight to the videos you view on YouTube

## Installation
Go to [YouTube Ambilight on the Chrome Web Store](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj) and add the extension to Chrome

## Planned features
A settings page where you can:
  - [Usability] Turn on the Ambilight on existing tabs after the installation so a refresh is not needed
  
## Privacy & Security
- This Chrome Extension uses the [activeTab](https://developer.chrome.com/extensions/activeTab) permission only on urls that start with https://www.youtube.com. The extension will only active the ambilight on YouTube's /watch page

The following projectfiles are inserted into that specific webpage:
- \src\scripts\youtube-ambilight.js
- \src\styles\main.css

This extension executes NO requests to any webserver, website or api other than YouTube's own api to play the ambilight video behind the real YouTube video.

## Report, request or contribute
Feel free to 
- contribute to the project at https://github.com/WesselKroos/chrome-youtube-ambilight
- report bugs at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
- request a feature at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
- or ask a question at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
