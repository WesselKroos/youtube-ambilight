import { getOS, getBrowser, getBrowserVersion } from './libs/utils'
import { html } from './libs/generic'

const getVersion = () => {
  try {
    return (chrome.runtime.getManifest() || {}).version
  } catch (ex) {
    return null
  }
}

const scripts = [
  chrome.extension.getURL('scripts/youtube-ambilight.js')
]
scripts.forEach((path) => {
  const s = document.createElement('script')
  s.defer = true
  s.src = path
  s.setAttribute('data-version', getVersion() || '')
  s.setAttribute('data-base-url', chrome.extension.getURL('') || '')
  s.onload = () => {
    s.parentNode.removeChild(s)
  }
  s.onerror = (e) => {
    console.error('Adding script failed:', e.target.src, e);
  }
  document.body.appendChild(s)
})