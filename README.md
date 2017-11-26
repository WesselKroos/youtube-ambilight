# Chrome YouTube Ambilight
This Chrome Extension adds ambilight to the videos you view on YouTube

## Installation
Go to https://chrome.google.com/?? and add the extension to Chrome

## Privacy & Security
This Chrome Extension uses the [activeTab](https://developer.chrome.com/extensions/activeTab) permission only on urls that start with https://www.youtube.com/watch
It also uses the [storage](https://developer.chrome.com/extensions/storage) persmission to store it's settings

The following projectfiles are inserted into that specific webpage:
- \src\scripts\generic.js
- \src\scripts\youtube-ambilight.js
- \src\styles\main.css

This extension executes NO requests to any webserver, website or api other than YouTube's own api to play the ambilight video behind the real YouTube video.

## Planned features
1 A settings page where you can
  - turn the ambilight on or off
  - switch between automatic/manual mode so you can disable the auto-start
  - set the immersive mode on or off at the start of the video

## Report, request or contribute
Feel free to 
- contribute to the project at https://github.com/WesselKroos/chrome-youtube-ambilight
- report bugs at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
- request a feature at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
- or ask a question at https://github.com/WesselKroos/chrome-youtube-ambilight/issues
