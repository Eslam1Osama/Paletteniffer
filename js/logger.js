// Logger: console suppression and buffering based on AppConfig
// - Reads window.AppConfig.logging to selectively disable console methods
// - Optionally buffers suppressed messages in memory for diagnostics

(function() {
  const defaultLogging = {
    suppressLog: true,
    suppressInfo: true,
    suppressWarn: true,
    suppressDebug: true,
    suppressError: false,
    captureBuffer: false,
    maxBuffer: 500
  };

  const cfg = (window.AppConfig && window.AppConfig.logging) || defaultLogging;

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
  };

  const state = {
    buffer: []
  };

  function pushToBuffer(level, args) {
    if (!cfg.captureBuffer) return;
    try {
      state.buffer.push({ level, time: Date.now(), args: Array.from(args) });
      if (state.buffer.length > (cfg.maxBuffer || 500)) {
        state.buffer.shift();
      }
    } catch (_) {}
  }

  function applyPatches() {
    console.log = cfg.suppressLog ? function() { pushToBuffer('log', arguments); } : original.log;
    console.info = cfg.suppressInfo ? function() { pushToBuffer('info', arguments); } : original.info;
    console.warn = cfg.suppressWarn ? function() { pushToBuffer('warn', arguments); } : original.warn;
    console.debug = cfg.suppressDebug ? function() { pushToBuffer('debug', arguments); } : (original.debug || original.log);
    console.error = cfg.suppressError ? function() { pushToBuffer('error', arguments); } : original.error;
  }

  function restore() {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.debug = original.debug || original.log;
    console.error = original.error;
  }

  const Logger = {
    getBuffer() { return state.buffer.slice(); },
    clearBuffer() { state.buffer.length = 0; },
    restore,
    reconfigure(newCfg) {
      Object.assign(cfg, newCfg || {});
      applyPatches();
    }
  };

  // Initial patch according to config
  applyPatches();

  // Expose for runtime adjustments
  window.Logger = Logger;
})();


