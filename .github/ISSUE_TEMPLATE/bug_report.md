name: Bug report
description: File a bug report
title: ""
labels: ["S: Todo", "T: Bug"]
assignees: 
  - WesselKroos
body:
 - type: markdown 
   attributes:
     value: |
       Thanks for taking the time to fill out this bug report!
 - type: input
   id: description
   attributes:
     label: Bug description
     description: A concise description of the bug
     placeholder: ex. The ambient light is not visible when my browser window is smaller than 600x400 pixels
   validations:
     required: true
 - type: textarea
   id: description
   attributes:
     label: Steps to reproduce the behavior
     description: Feel free to define optional steps or multiple ways to reproduce the behavior
     placeholder: 1. Go to '...' |
       2. Click on '....' |
       3. Scroll down to '....' |
       4. See error |
   validations:
     required: true
 - type: textarea
   id: screenshots
   attributes:
     label: Screenshots
     description: If applicable, add screenshots to help explain your problem.
     placeholder: You can add screenshots by pasting them into this text field
 - type: dropdown
   id: browser
   attributes:
     label: Browser
     multiple: true
     options:
       - Chrome
       - Microsoft Edge
       - Opera
       - Firefox
 - type: dropdown
   id: os
   attributes:
     label: Operating system
     multiple: true
     options:
       - Windows
       - Apple macOS
       - Linux
       - Other
 - type: input
   id: extension-version
   attributes:
     label: Extension version
     placeholder: ex. 2.37.17
   validations:
     required: true
 - type: checkboxes
   id: checks
   attributes:
     label: The bug still happens in these conditions: 
     description: Check the statements that match your findings
     options:
       - label: The bug still persist when I disable all other extensions (ex. in incognito mode with only this extension enabled)
       - label: When I logged out of my YouTube account (ex. in incognito mode)
       - label: In incognito mode
 - type: textarea
   id: context
   attributes:
     label: Additional context
     placeholder: Add additional context in case it did not fit in any of the fields above
