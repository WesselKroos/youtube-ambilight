import { getOS, getVersion, getBrowser, insertScript } from './libs/utils'
import { html } from './libs/generic'

const scripts = [
  chrome.extension.getURL('scripts/youtube-ambilight.js')
]
scripts.forEach((path) => insertScript(path))

const setExtensionInfo = () => {
  const version = getVersion() || ''
  const os = getOS() || ''
  const browser = getBrowser() || ''

  html.setAttribute('data-ambilight-version', version);
  html.setAttribute('data-ambilight-os', os);
  html.setAttribute('data-ambilight-browser', browser);
  html.setAttribute('data-ambilight-baseurl', chrome.extension.getURL(''));
  html.setAttribute('data-ambilight-gpu-script-src', chrome.extension.getURL('scripts/gpu-browser.js'))
  html.setAttribute('data-ambilight-glfx-script-src', chrome.extension.getURL('scripts/glfx.js'))
}

setExtensionInfo()