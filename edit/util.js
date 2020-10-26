/* global
  $create
  CodeMirror
  prefs
*/
'use strict';

/* exported DirtyReporter */
class DirtyReporter {
  constructor() {
    this._dirty = new Map();
    this._onchange = new Set();
  }

  add(obj, value) {
    const wasDirty = this.isDirty();
    const saved = this._dirty.get(obj);
    if (!saved) {
      this._dirty.set(obj, {type: 'add', newValue: value});
    } else if (saved.type === 'remove') {
      if (saved.savedValue === value) {
        this._dirty.delete(obj);
      } else {
        saved.newValue = value;
        saved.type = 'modify';
      }
    }
    this.notifyChange(wasDirty);
  }

  remove(obj, value) {
    const wasDirty = this.isDirty();
    const saved = this._dirty.get(obj);
    if (!saved) {
      this._dirty.set(obj, {type: 'remove', savedValue: value});
    } else if (saved.type === 'add') {
      this._dirty.delete(obj);
    } else if (saved.type === 'modify') {
      saved.type = 'remove';
    }
    this.notifyChange(wasDirty);
  }

  modify(obj, oldValue, newValue) {
    const wasDirty = this.isDirty();
    const saved = this._dirty.get(obj);
    if (!saved) {
      if (oldValue !== newValue) {
        this._dirty.set(obj, {type: 'modify', savedValue: oldValue, newValue});
      }
    } else if (saved.type === 'modify') {
      if (saved.savedValue === newValue) {
        this._dirty.delete(obj);
      } else {
        saved.newValue = newValue;
      }
    } else if (saved.type === 'add') {
      saved.newValue = newValue;
    }
    this.notifyChange(wasDirty);
  }

  clear(obj) {
    const wasDirty = this.isDirty();
    if (obj === undefined) {
      this._dirty.clear();
    } else {
      this._dirty.delete(obj);
    }
    this.notifyChange(wasDirty);
  }

  isDirty() {
    return this._dirty.size > 0;
  }

  onChange(cb, add = true) {
    this._onchange[add ? 'add' : 'delete'](cb);
  }

  notifyChange(wasDirty) {
    if (wasDirty !== this.isDirty()) {
      this._onchange.forEach(cb => cb());
    }
  }

  has(key) {
    return this._dirty.has(key);
  }
}

/* exported DocFuncMapper */
const DocFuncMapper = {
  TO_CSS: {
    urls: 'url',
    urlPrefixes: 'url-prefix',
    domains: 'domain',
    regexps: 'regexp',
  },
  FROM_CSS: {
    'url': 'urls',
    'url-prefix': 'urlPrefixes',
    'domain': 'domains',
    'regexp': 'regexps',
  },
  /**
   * @param {Object} section
   * @param {function(func:string, value:string)} fn
   */
  forEachProp(section, fn) {
    for (const [propName, func] of Object.entries(DocFuncMapper.TO_CSS)) {
      const props = section[propName];
      if (props) props.forEach(value => fn(func, value));
    }
  },
  /**
   * @param {Array<?[type,value]>} funcItems
   * @param {?Object} [section]
   * @returns {Object} section
   */
  toSection(funcItems, section = {}) {
    for (const item of funcItems) {
      const [func, value] = item || [];
      const propName = DocFuncMapper.FROM_CSS[func];
      if (propName) {
        const props = section[propName] || (section[propName] = []);
        if (Array.isArray(value)) props.push(...value);
        else props.push(value);
      }
    }
    return section;
  },
};

/* exported sectionsToMozFormat */
function sectionsToMozFormat(style) {
  return style.sections.map(section => {
    const cssFuncs = [];
    DocFuncMapper.forEachProp(section, (type, value) =>
      cssFuncs.push(`${type}("${value.replace(/\\/g, '\\\\')}")`));
    return cssFuncs.length ?
      `@-moz-document ${cssFuncs.join(', ')} {\n${section.code}\n}` :
      section.code;
  }).join('\n\n');
}

/* exported trimCommentLabel */
function trimCommentLabel(str, limit = 1000) {
  // stripping /*** foo ***/ to foo
  return clipString(str.replace(/^[!-/:;=\s]*|[-#$&(+,./:;<=>\s*]*$/g, ''), limit);
}

/* exported clipString */
function clipString(str, limit = 100) {
  return str.length <= limit ? str : str.substr(0, limit) + '...';
}

/* exported memoize */
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

/* exported createHotkeyInput */
/**
 * @param {!string} prefId
 * @param {?function(isEnter:boolean)} onDone
 */
function createHotkeyInput(prefId, onDone = () => {}) {
  return $create('input', {
    type: 'search',
    spellcheck: false,
    value: prefs.get(prefId),
    onkeydown(event) {
      const key = CodeMirror.keyName(event);
      if (key === 'Tab' || key === 'Shift-Tab') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      switch (key) {
        case 'Enter':
          if (this.checkValidity()) onDone(true);
          return;
        case 'Esc':
          onDone(false);
          return;
        default:
          // disallow: [Shift?] characters, modifiers-only, [modifiers?] + Esc, Tab, nav keys
          if (!key || new RegExp('^(' + [
            '(Back)?Space',
            '(Shift-)?.', // a single character
            '(Shift-?|Ctrl-?|Alt-?|Cmd-?){0,2}(|Esc|Tab|(Page)?(Up|Down)|Left|Right|Home|End|Insert|Delete)',
          ].join('|') + ')$', 'i').test(key)) {
            this.value = key || this.value;
            this.setCustomValidity('Not allowed');
            return;
          }
      }
      this.value = key;
      this.setCustomValidity('');
      prefs.set(prefId, key);
    },
    oninput() {
      // fired on pressing "x" to clear the field
      prefs.set(prefId, '');
    },
    onpaste(event) {
      event.preventDefault();
    }
  });
}
