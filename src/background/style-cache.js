/** Creates a FIFO limit-size map. */
export default function StyleCache({size = 1000, onDeleted} = {}) {
  const map = new Map();
  const buffer = Array(size);
  let index = 0;
  let lastIndex = 0;
  return {
    get(id) {
      const item = map.get(id);
      return item && item.data;
    },
    set(id, data) {
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
    },
    delete(id) {
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
    },
    clear() {
      map.clear();
      index = lastIndex = 0;
    },
    has: id => map.has(id),
    *entries() {
      for (const [id, item] of map) {
        yield [id, item.data];
      }
    },
    *values() {
      for (const item of map.values()) {
        yield item.data;
      }
    },
    get size() {
      return map.size;
    },
  };
}
