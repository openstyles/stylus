export default function DirtyReporter() {
  const data = new Map();
  const listeners = new Set();
  const dataListeners = new Set();
  const notifyChange = wasDirty => {
    const isDirty = data.size > 0;
    const flipped = isDirty !== wasDirty;
    if (flipped) {
      listeners.forEach(cb => cb(isDirty));
    }
    if (flipped || isDirty) {
      dataListeners.forEach(cb => cb(isDirty));
    }
  };
  /** @namespace DirtyReporter */
  return {
    add(obj, value) {
      const wasDirty = data.size > 0;
      const saved = data.get(obj);
      if (!saved) {
        data.set(obj, {type: 'add', newValue: value});
      } else if (saved.type === 'remove') {
        if (saved.savedValue === value) {
          data.delete(obj);
        } else {
          saved.newValue = value;
          saved.type = 'modify';
        }
      } else {
        return;
      }
      notifyChange(wasDirty);
    },
    clear(id) {
      if (data.size && (
        id ? data.delete(id)
          : (data.clear(), true)
      )) {
        notifyChange(true);
      }
    },
    has(key) {
      return data.has(key);
    },
    isDirty() {
      return data.size > 0;
    },
    modify(obj, oldValue, newValue) {
      const wasDirty = data.size > 0;
      const saved = data.get(obj);
      if (!saved) {
        if (oldValue !== newValue) {
          data.set(obj, {type: 'modify', savedValue: oldValue, newValue});
        } else {
          return;
        }
      } else if (saved.type === 'modify') {
        if (saved.savedValue === newValue) {
          data.delete(obj);
        } else {
          saved.newValue = newValue;
        }
      } else if (saved.type === 'add') {
        saved.newValue = newValue;
      } else {
        return;
      }
      notifyChange(wasDirty);
    },
    onChange(cb, add = true) {
      listeners[add ? 'add' : 'delete'](cb);
    },
    onDataChange(cb, add = true) {
      dataListeners[add ? 'add' : 'delete'](cb);
    },
    remove(obj, value) {
      const wasDirty = data.size > 0;
      const saved = data.get(obj);
      if (!saved) {
        data.set(obj, {type: 'remove', savedValue: value});
      } else if (saved.type === 'add') {
        data.delete(obj);
      } else if (saved.type === 'modify') {
        saved.type = 'remove';
      } else {
        return;
      }
      notifyChange(wasDirty);
    },
  };
}
