[English](README.md) | **繁體中文**

[![Google Chrome Web 評分](https://img.shields.io/chrome-web-store/rating/paponcgjfojgemddooebbgniglhkajkj?logo=googlechrome&color=brightgreen)](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj) [![Google Chrome 使用者數](https://img.shields.io/chrome-web-store/users/paponcgjfojgemddooebbgniglhkajkj?logo=googlechrome&color=blue)](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj) &nbsp; [![Microsoft Edge 評分](https://img.shields.io/badge/dynamic/json?label=rating&suffix=/5&query=%24.averageRating&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fcmggdjjjfembmemhleknmfpakmgggjcf&logo=embarcadero&color=brightgreen)](https://microsoftedge.microsoft.com/addons/detail/cmggdjjjfembmemhleknmfpakmgggjcf) [![Microsoft Edge 使用者數](https://img.shields.io/badge/dynamic/json?label=users&query=%24.activeInstallCount&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fcmggdjjjfembmemhleknmfpakmgggjcf&logo=embarcadero&color=blue)](https://microsoftedge.microsoft.com/addons/detail/cmggdjjjfembmemhleknmfpakmgggjcf) &nbsp; [![Firefox 評分](https://img.shields.io/amo/rating/ambient-light-for-youtube?logo=firefoxbrowser)](https://addons.mozilla.org/en-US/firefox/addon/ambient-light-for-youtube/) [![Firefox 使用者數](https://img.shields.io/amo/users/ambient-light-for-youtube?logo=firefoxbrowser&color=blue)](https://addons.mozilla.org/en-US/firefox/addon/ambient-light-for-youtube/) &nbsp; [![Opera 評分](https://img.shields.io/badge/rating-4.4/5-brightgreen?logo=opera)](https://addons.opera.com/nl/extensions/details/youtube-ambilight/) [![Opera 下載次數](https://img.shields.io/badge/downloads-20k-blue?logo=opera)](https://addons.opera.com/nl/extensions/details/youtube-ambilight/)

<a href="https://ko-fi.com/G2G59EK8L" rel="noopener">
  <img align="right" src="https://github.com/WesselKroos/youtube-ambilight/blob/master/src/images/donate.svg?raw=true" title="透過捐款支持我">
</a>

[![Ambient light for YouTube™](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/heading.png?raw=true)](https://github.com/WesselKroos/youtube-ambilight#readme)

![預覽](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/readme/screenshot-1.jpg?raw=true)


# Ambient light for YouTube™
透過環境光效果，讓自己沉浸在 YouTube 影片中！

## 安裝
前往瀏覽器的擴充功能商店，安裝本擴充功能：

[![Google Chrome 線上應用程式商店](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/browsers/Google%20Chrome.png?raw=true)](https://chrome.google.com/webstore/detail/youtube-ambilight/paponcgjfojgemddooebbgniglhkajkj)

[![Microsoft Edge 擴充功能商店](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Microsoft%20Edge.png?raw=true)](https://microsoftedge.microsoft.com/addons/detail/cmggdjjjfembmemhleknmfpakmgggjcf)

[![Firefox 附加元件](https://github.com/WesselKroos/chrome-youtube-ambilight/blob/master/assets/browsers/Firefox.png?raw=true)](https://addons.mozilla.org/en-US/firefox/addon/ambient-light-for-youtube/)

[![Opera 擴充功能](https://github.com/WesselKroos/youtube-ambilight/blob/master/assets/browsers/Opera.png?raw=true)](https://addons.opera.com/nl/extensions/details/youtube-ambilight/)


## 最低需求

### 效能
建議使用在 PassMark 顯示卡效能測試中得分至少 1000 分的顯示卡。
可在此查詢顯示卡分數：

https://www.videocardbenchmark.net/gpu_list.php

即使分數低於 1000，本擴充功能仍可運作，但 YouTube 影片頁面可能會變慢或播放不順。
> 若要排查效能問題或改善效能，請參閱[疑難排解指南](https://github.com/WesselKroos/youtube-ambilight/blob/master/TROUBLESHOOT.md)中的檢查項目與步驟。


### 瀏覽器版本
| 瀏覽器 | 版本 | 原因 |
| -------- | ------- | ------ |
| Chromium | 80 | [可選串連運算子 (?.)](https://caniuse.com/mdn-javascript_operators_optional_chaining) |
| Firefox | 74 | [可選串連運算子 (?.)](https://caniuse.com/mdn-javascript_operators_optional_chaining) |


## 隱私與安全性
請閱讀[隱私權政策](/PRIVACY-POLICY.md)。


## 回報問題、提出需求或參與開發
歡迎你：
- 到 [/youtube-ambilight](https://github.com/WesselKroos/youtube-ambilight) 參與專案開發
- 到 [/youtube-ambilight/issues](https://github.com/WesselKroos/youtube-ambilight/issues) 回報錯誤
- 到 [/youtube-ambilight/issues](https://github.com/WesselKroos/youtube-ambilight/issues) 提出功能需求
- 到 [/youtube-ambilight/issues](https://github.com/WesselKroos/youtube-ambilight/issues) 提問


## 支持我
[![透過捐款支持我](https://github.com/WesselKroos/youtube-ambilight/blob/master/src/images/donate.svg?raw=true)](https://ko-fi.com/G2G59EK8L)


## 開發
1. 安裝 [Node (LTS)](https://nodejs.org/en/download/)。
2. 在終端機或命令列輸入 `npm install`。
3. 在終端機或命令列輸入 `npm run build`。建置後會產生 `/dist` 資料夾，其中包含擴充功能所需的全部檔案。
4. 將擴充功能加入 Chrome：
    1. 在 Chrome 前往 [chrome://extensions/](chrome://extensions/)。
    2. 開啟 `Developer mode`（開發人員模式）。
    3. 點選 `Load unpacked`（載入未封裝項目），並選取 `/dist` 資料夾。
    4. `Ambient light for YouTube™` 會出現在擴充功能清單中。
5. 修改 `/src` 資料夾中的檔案後，請依照下列步驟更新擴充功能：
    1. 在終端機或命令列輸入 `npm run build`。
    2. 在 Chrome 前往 [chrome://extensions/](chrome://extensions/)，然後點選擴充功能卡片上的重新整理／更新按鈕。

## 翻譯

擴充功能預設使用瀏覽器的介面語言。你也可以在 YouTube 影片播放器的環境光設定選單中，透過語言下拉選單切換語言。目前提供 English 和繁體中文；自動偵測會將 `zh-TW`、`zh-Hant`、`zh-HK` 及 `zh-MO` 設為繁體中文。切換語言後，播放器設定選單與已開啟的說明／選項頁都會更新。選擇「預設」後，請重新整理已開啟的 YouTube 分頁。

擴充功能的名稱與描述位於 `src/_locales`。播放器內的設定名稱及說明文字位於 `src/scripts/libs/locales/zh-TW.js`。設定名稱與數值是儲存資料所用的鍵值，請勿變更。修改翻譯後，執行 `npm run build`，再重新載入未封裝的擴充功能與 YouTube 頁面。

語言下拉選單的選項來自 `src/scripts/libs/i18n.js` 中的語系登錄表。將新譯文註冊於該檔案，即可供使用者選擇。
