/* exported dirtyReporter memoize clipString sectionsToMozFormat */
'use strict';

function dirtyReporter() {
  const dirty = new Map();
  const onchanges = [];

  function add(obj, value) {
    const saved = dirty.get(obj);
    if (!saved) {
      dirty.set(obj, {type: 'add', newValue: value});
    } else if (saved.type === 'remove') {
      if (saved.savedValue === value) {
        dirty.delete(obj);
      } else {
        saved.newValue = value;
        saved.type = 'modify';
      }
    }
  }

  function remove(obj, value) {
    const saved = dirty.get(obj);
    if (!saved) {
      dirty.set(obj, {type: 'remove', savedValue: value});
    } else if (saved.type === 'add') {
      dirty.delete(obj);
    } else if (saved.type === 'modify') {
      saved.type = 'remove';
    }
  }

  function modify(obj, oldValue, newValue) {
    const saved = dirty.get(obj);
    if (!saved) {
      if (oldValue !== newValue) {
        dirty.set(obj, {type: 'modify', savedValue: oldValue, newValue});
      }
    } else if (saved.type === 'modify') {
      if (saved.savedValue === newValue) {
        dirty.delete(obj);
      } else {
        saved.newValue = newValue;
      }
    } else if (saved.type === 'add') {
      saved.newValue = newValue;
    }
  }

  function clear(obj) {
    if (obj === undefined) {
      dirty.clear();
    } else {
      dirty.delete(obj);
    }
  }

  function isDirty() {
    return dirty.size > 0;
  }

  function onChange(cb) {
    // make sure the callback doesn't throw
    onchanges.push(cb);
  }

  function wrap(obj) {
    for (const key of ['add', 'remove', 'modify', 'clear']) {
      obj[key] = trackChange(obj[key]);
    }
    return obj;
  }

  function emitChange() {
    for (const cb of onchanges) {
      cb();
    }
  }

  function trackChange(fn) {
    return function () {
      const dirty = isDirty();
      const result = fn.apply(null, arguments);
      if (dirty !== isDirty()) {
        emitChange();
      }
      return result;
    };
  }

  function has(key) {
    return dirty.has(key);
  }

  return wrap({add, remove, modify, clear, isDirty, onChange, has});
}


function sectionsToMozFormat(style) {
  const propertyToCss = {
    urls:        'url',
    urlPrefixes: 'url-prefix',
    domains:     'domain',
    regexps:     'regexp',
  };
  return style.sections.map(section => {
    let cssMds = [];
    for (const i in propertyToCss) {
      if (section[i]) {
        cssMds = cssMds.concat(section[i].map(v =>
          propertyToCss[i] + '("' + v.replace(/\\/g, '\\\\') + '")'
        ));
      }
    }
    return cssMds.length ?
      '@-moz-document ' + cssMds.join(', ') + ' {\n' + section.code + '\n}' :
      section.code;
  }).join('\n\n');
}


function clipString(str, limit = 100) {
  return str.length <= limit ? str : str.substr(0, limit) + '...';
}

// this is a decorator. Cache the first call
function memoize(fn) {
  let cached = false;
  let result;
  return (...args) => {
    if (!cached) {
      result = fn(...args);
      cached = true;
    }
    return result;
  };
}
