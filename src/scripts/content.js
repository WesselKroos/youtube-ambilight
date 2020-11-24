import { getOS, getVersion, getBrowser } from './libs/utils'
import { html } from './libs/generic'

const scripts = [
  chrome.extension.getURL('scripts/youtube-ambilight.js')
]
scripts.forEach((path) => {
  const s = document.createElement('script')
  s.defer = true
  s.src = path
  s.onload = () => {
    s.parentNode.removeChild(s)
  }
  s.onerror = (e) => {
    console.error('Adding script failed:', e.target.src, e);
  }
  document.body.appendChild(s)
})

const setExtensionInfo = () => {
  const version = getVersion() || ''
  const os = getOS() || ''
  const browser = getBrowser() || ''

  html.setAttribute('data-ambilight-version', version);
  html.setAttribute('data-ambilight-os', os);
  html.setAttribute('data-ambilight-browser', browser);
  html.setAttribute('data-ambilight-baseurl', chrome.extension.getURL(''));
}

setExtensionInfo()