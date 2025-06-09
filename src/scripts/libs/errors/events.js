import { on } from '../generic';
import SentryReporter, { crashOptions } from './sentry-reporter';
import { AmbientlightError } from './ambient-light-error';

export class ErrorEvents {
  list = [];

  constructor() {
    on(
      window,
      'beforeunload',
      () => {
        if (!this.list.length) return;

        this.add('tab beforeunload');
        this.send();
      },
      false
    );

    on(
      window,
      'pagehide',
      () => {
        if (!this.list.length) return;

        this.add('tab pagehide');
      },
      false
    );

    on(
      document,
      'visibilitychange',
      () => {
        if (document.visibilityState !== 'hidden') return;
        if (!this.list.length) return;

        this.add('tab visibilitychange hidden');
        this.send();
      },
      false
    );
  }

  send = (message, force) => {
    const lastEvent = this.list[this.list.length - 1];
    const lastTime = lastEvent.time;
    const firstTime = this.list[0].firstTime || this.list[0].time;
    if (!force && lastTime - firstTime < 5) {
      return; // Give the site 5 seconds to load the watch page or move the video element
    }

    const firstEvent = this.list.splice(0, 1);
    const details = {
      firstEvent,
      events: this.list.reverse(),
    };
    this.list = [];

    SentryReporter.captureException(
      new AmbientlightError(
        message ?? 'Closed or hid the page with pending errors',
        details
      )
    );
  };

  add = (type, details = {}) => {
    if (!crashOptions?.technical) {
      details = undefined;
    }
    const time = Math.round(performance.now()) / 1000;

    if (this.list.length) {
      const last = this.list.slice(-1)[0];
      const {
        count: lastCount,
        time: lastTime,
        firstTime,
        type: lastType,
        ...lastDetails
      } = last;

      if (
        lastType === type &&
        JSON.stringify(lastDetails) === JSON.stringify(details)
      ) {
        last.count = lastCount ? lastCount + 1 : 2;
        last.time = time;
        last.firstTime = firstTime || lastTime;
        return;
      }
    }

    let event = {
      type,
      time,
      ...details,
    };
    event.time = time;
    this.list.push(event);
  };
}
