// eslint-disable-next-line no-unused-vars
let console;

(function() {
  const preMessage = 'Ambient light for YouTube™ |'

  const enrich = (...args) => {
    if (args.length <= 0) return args

    if(typeof args[0] === 'string') {
      const [firstArg, ...postArgs] = args
      return [`${preMessage} ${firstArg}`, ...postArgs]
    }

    return [preMessage, ...args]
  }

  console = {
    log:   (...args) => window.console.log(...enrich(...args)),
    debug: (...args) => window.console.debug(...enrich(...args)),
    warn:  (...args) => window.console.warn(...enrich(...args)),
    error: (...args) => window.console.error(...enrich(...args)),
    dir:   (...args) => window.console.dir(...args),
  }
})();