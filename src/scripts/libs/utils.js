export const getOS = () => {
  try {
    const list = [
      { match: 'window', name: 'Windows' },
      { match: 'mac', name: 'Mac' },
      { match: 'cros', name: 'Chrome+OS' },
      { match: 'ubuntu', name: 'Ubuntu+(Linux)' },
      { match: 'android', name: 'Android' },
      { match: 'ios', name: 'iOS' },
      { match: 'x11', name: 'Linux' },
    ]
    var ua = window.navigator.userAgent
    var os = list.find(os => (ua.toLowerCase().indexOf(os.match) >= 0))
    return (os) ? os.name : ua
  } catch (ex) {
    return null
  }
}

export const getBrowserName = () => {
  try {
    const list = [
      { match: 'Firefox', name: 'Firefox' },
      { match: 'OPR', name: 'Opera' },
      { match: 'Edg', name: 'Edge' },
      { match: 'Chrome', name: 'Chrome' }
    ]
    var ua = window.navigator.userAgent
    var browser = list.find(browser => (ua.indexOf(browser.match) >= 0))
    return (browser) ? browser.name : ua
  } catch (ex) {
    return null
  }
}

export const getVersion = () => {
  try {
    return (chrome.runtime.getManifest() || {}).version
  } catch (ex) {
    return null
  }
}

//Performance levels: 0 = Low | 1 = Medium | 2 = High
export const getDevicePerformance = async () => {
  try {
    const specs = {
      RAM: {
        gb: navigator.deviceMemory
      },
      CPU: {
        threads: navigator.hardwareConcurrency
      },
      GPU: {
        videoDecoding: await navigator.mediaCapabilities.decodingInfo({
          type: 'file', 
          video: {
              contentType: 'video/mp4;codecs=avc1.64001F',
              width: 2160,
              height: 3840,
              bitrate: 50000, 
              framerate: 60
          } 
        })
      }
    }
    console.log('Device performance specs:', specs)

    const levels = {
      RAM: 0,
      CPU: 0,
      GPU: 0
    }

    if(specs.RAM.gb < 4) {
      levels.RAM = 0
    } else if(specs.RAM.gb < 8) {
      levels.RAM = 1
    } else {
      levels.RAM = 2
    }

    if(specs.CPU.threads < 4) {
      levels.CPU = 0
    } else if(specs.CPU.threads < 8) {
      levels.CPU = 1
    } else {
      levels.CPU = 2
    }

    if(!specs.GPU.videoDecoding.supported) {
      levels.GPU = 0
    } else if(!specs.GPU.videoDecoding.smooth) {
      levels.GPU = 1
    } else {
      levels.GPU = 2
    }
    console.log('Device performance levels:', levels)

    const level = Math.min(...levels)
    console.log('Device performance level: ', level)
    return level
  } catch(ex) {
    return 0
  }
}