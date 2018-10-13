/* exported createCache */
'use strict';

// create a FIFO limit-size map.
function createCache({size = 1000, onDeleted} = {}) {
  const map = new Map();
  const buffer = Array(size);
  let index = 0;
  let lastIndex = 0;
  return {
    get,
    set,
    delete: delete_,
    clear,
    has: id => map.has(id),
    entries: function *() {
      for (const [id, item] of map) {
        yield [id, item.data];
      }
    },
    values: function *() {
      for (const item of map.values()) {
        yield item.data;
      }
    },
    get size() {
      return map.size;
    }
  };

  function get(id) {
    const item = map.get(id);
    return item && item.data;
  }

  function set(id, data) {
    if (map.size === size) {
      // full
      map.delete(buffer[lastIndex].id);
      if (onDeleted) {
        onDeleted(buffer[lastIndex].id, buffer[lastIndex].data);
      }
      lastIndex = (lastIndex + 1) % size;
    }
    const item = {id, data, index};
    map.set(id, item);
    buffer[index] = item;
    index = (index + 1) % size;
  }

  function delete_(id) {
    const item = map.get(id);
    if (!item) {
      return false;
    }
    map.delete(item.id);
    const lastItem = buffer[lastIndex];
    lastItem.index = item.index;
    buffer[item.index] = lastItem;
    lastIndex = (lastIndex + 1) % size;
    if (onDeleted) {
      onDeleted(item.id, item.data);
    }
    return true;
  }

  function clear() {
    map.clear();
    index = lastIndex = 0;
  }
}
