import { getOS, getVersion, getBrowser } from './libs/utils'

const scripts = [
  chrome.extension.getURL('scripts/youtube-ambilight.js')
]
scripts.forEach((path) => {
  const s = document.createElement('script')
  s.src = path
  s.onload = () => {
    s.parentNode.removeChild(s)
  }
  s.onerror = (e) => {
    console.error('Adding script failed:', e.target.src, e);
  }
  document.head.appendChild(s)
})

const setExtensionInfo = () => {
  const version = getVersion() || ''
  const os = getOS() || ''
  const browser = getBrowser() || ''

  document.querySelector('html').setAttribute('data-ambilight-version', version);
  document.querySelector('html').setAttribute('data-ambilight-os', os);
  document.querySelector('html').setAttribute('data-ambilight-browser', browser);
  document.querySelector('html').setAttribute('data-ambilight-baseurl', chrome.extension.getURL(''));
}

setExtensionInfo()