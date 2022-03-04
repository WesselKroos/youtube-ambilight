import AmbilightSentry, { AmbilightError } from "./ambilight-sentry"
import { on } from "./generic"

export default class ErrorEvents {
  list = []
  
  constructor() {
    on(window, 'beforeunload', (e) => {
      if(!this.list.length) return
      
      this.add('tab beforeunload')
      this.send()
    }, false)
    
    on(window, 'pagehide', (e) => {
      if(!this.list.length) return
      
      this.add('tab pagehide')
    }, false)
    
    on(document, 'visibilitychange', () => {
      if(document.visibilityState !== 'hidden') return
      if(!this.list.length) return
      
      this.add('tab visibilitychange hidden')
      this.send()
    }, false)
  }

  send = () => {
    const lastEvent = this.list[this.list.length - 1]
    const lastTime = lastEvent.lastTime || lastEvent.time
    const firstTime = this.list[0].time
    if(lastTime - firstTime < 10) {
      return // Give the site 10 seconds to load the watch page or move the video element
    }

    AmbilightSentry.captureExceptionWithDetails(
      new AmbilightError('Closed or hid the webpage tab with pending errors events', this.list)
    )
    this.list = []
  }

  add = (type, details = {}) => {
    const time = Math.round(performance.now()) / 1000
  
    if(this.list.length) {
      const last = this.list.slice(-1)[0]
      const {
        count: lastCount,
        time: lastTime,
        endTime: lastEndTime,
        type: lastType,
        ...lastDetails
      } = last
  
      if(
        lastType === type && 
        JSON.stringify(lastDetails) === JSON.stringify(details)
      ) {
        last.count = last.count ? last.count + 1 : 2
        last.endTime = time
        return
      }
    }
  
    let event = {
      type,
      time,
      ...details,
    }
    event.time = time
    this.list.push(event)
  }
}