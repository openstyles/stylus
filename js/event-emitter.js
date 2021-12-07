/* exported EventEmitter */
'use strict';

function EventEmitter() {
  const listeners = new Map();
  return {
    on(ev, cb, opt) {
      if (!listeners.has(ev)) {
        listeners.set(ev, new Map());
      }
      listeners.get(ev).set(cb, opt);
      if (opt && opt.runNow) {
        cb();
      }
    },
    off(ev, cb) {
      const cbs = listeners.get(ev);
      if (cbs) {
        cbs.delete(cb);
      }
    },
    emit(ev, ...args) {
      const cbs = listeners.get(ev);
      if (!cbs) return;
      for (const [cb, opt] of cbs.entries()) {
        try {
          cb(...args);
        } catch (err) {
          console.error(err);
        }
        if (opt && opt.once) {
          cbs.delete(cb);
        }
      }
    },
  };
}
