var dbToCloud = (function (exports) {
  'use strict';

  function ownKeys(object, enumerableOnly) {
    var keys = Object.keys(object);

    if (Object.getOwnPropertySymbols) {
      var symbols = Object.getOwnPropertySymbols(object);

      if (enumerableOnly) {
        symbols = symbols.filter(function (sym) {
          return Object.getOwnPropertyDescriptor(object, sym).enumerable;
        });
      }

      keys.push.apply(keys, symbols);
    }

    return keys;
  }

  function _objectSpread2(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i] != null ? arguments[i] : {};

      if (i % 2) {
        ownKeys(Object(source), true).forEach(function (key) {
          _defineProperty(target, key, source[key]);
        });
      } else if (Object.getOwnPropertyDescriptors) {
        Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
      } else {
        ownKeys(Object(source)).forEach(function (key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
      }
    }

    return target;
  }

  function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
      var info = gen[key](arg);
      var value = info.value;
    } catch (error) {
      reject(error);
      return;
    }

    if (info.done) {
      resolve(value);
    } else {
      Promise.resolve(value).then(_next, _throw);
    }
  }

  function _asyncToGenerator(fn) {
    return function () {
      var self = this,
          args = arguments;
      return new Promise(function (resolve, reject) {
        var gen = fn.apply(self, args);

        function _next(value) {
          asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
        }

        function _throw(err) {
          asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
        }

        _next(undefined);
      });
    };
  }

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }

    return obj;
  }

  function _objectWithoutPropertiesLoose(source, excluded) {
    if (source == null) return {};
    var target = {};
    var sourceKeys = Object.keys(source);
    var key, i;

    for (i = 0; i < sourceKeys.length; i++) {
      key = sourceKeys[i];
      if (excluded.indexOf(key) >= 0) continue;
      target[key] = source[key];
    }

    return target;
  }

  function _objectWithoutProperties(source, excluded) {
    if (source == null) return {};

    var target = _objectWithoutPropertiesLoose(source, excluded);

    var key, i;

    if (Object.getOwnPropertySymbols) {
      var sourceSymbolKeys = Object.getOwnPropertySymbols(source);

      for (i = 0; i < sourceSymbolKeys.length; i++) {
        key = sourceSymbolKeys[i];
        if (excluded.indexOf(key) >= 0) continue;
        if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
        target[key] = source[key];
      }
    }

    return target;
  }

  function _slicedToArray(arr, i) {
    return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
  }

  function _arrayWithHoles(arr) {
    if (Array.isArray(arr)) return arr;
  }

  function _iterableToArrayLimit(arr, i) {
    var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];

    if (_i == null) return;
    var _arr = [];
    var _n = true;
    var _d = false;

    var _s, _e;

    try {
      for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) {
        _arr.push(_s.value);

        if (i && _arr.length === i) break;
      }
    } catch (err) {
      _d = true;
      _e = err;
    } finally {
      try {
        if (!_n && _i["return"] != null) _i["return"]();
      } finally {
        if (_d) throw _e;
      }
    }

    return _arr;
  }

  function _unsupportedIterableToArray(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _arrayLikeToArray(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(o);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
  }

  function _arrayLikeToArray(arr, len) {
    if (len == null || len > arr.length) len = arr.length;

    for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

    return arr2;
  }

  function _nonIterableRest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }

  function _createForOfIteratorHelper(o, allowArrayLike) {
    var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"];

    if (!it) {
      if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
        if (it) o = it;
        var i = 0;

        var F = function () {};

        return {
          s: F,
          n: function () {
            if (i >= o.length) return {
              done: true
            };
            return {
              done: false,
              value: o[i++]
            };
          },
          e: function (e) {
            throw e;
          },
          f: F
        };
      }

      throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }

    var normalCompletion = true,
        didErr = false,
        err;
    return {
      s: function () {
        it = it.call(o);
      },
      n: function () {
        var step = it.next();
        normalCompletion = step.done;
        return step;
      },
      e: function (e) {
        didErr = true;
        err = e;
      },
      f: function () {
        try {
          if (!normalCompletion && it.return != null) it.return();
        } finally {
          if (didErr) throw err;
        }
      }
    };
  }

  function createLock({
    maxActiveReader = Infinity
  } = {}) {
    let firstTask;
    let lastTask;
    let activeReader = 0;
    const self = {
      read: fn => que(fn, false),
      write: fn => que(fn, true),
      length: 0
    };
    return self;

    function que(fn, block) {
      const task = createTask({
        fn,
        block
      });

      if (!lastTask) {
        firstTask = lastTask = task;
      } else {
        lastTask.next = task;
        task.prev = lastTask;
        lastTask = task;

        if (!firstTask) {
          firstTask = lastTask;
        }
      }

      self.length++;
      deque();
      return task.q.promise;
    }

    function defer() {
      const o = {};
      o.promise = new Promise((resolve, reject) => {
        o.resolve = resolve;
        o.reject = reject;
      });
      return o;
    }

    function createTask({
      fn,
      block = false,
      prev,
      next,
      q = defer(),
      q2 = fn.length ? defer() : null
    }) {
      return {
        fn,
        block,
        prev,
        next,
        q,
        q2
      };
    }

    function deque() {
      const task = firstTask;

      if (!task || task.block && task.prev || task.prev && task.prev.block || activeReader >= maxActiveReader) {
        return;
      }

      if (!task.block) {
        activeReader++;
      }

      firstTask = task.next;
      let result;

      try {
        result = task.fn(task.q2 && task.q2.resolve);
      } catch (err) {
        task.q.reject(err); // auto release with sync error
        // q2 is useless in this case

        onDone();
        return;
      }

      if (task.q2) {
        task.q2.promise.then(_onDone);
      }

      if (result && result.then) {
        const pending = result.then(task.q.resolve, task.q.reject);

        if (!task.q2) {
          pending.then(onDone);
        }
      } else {
        task.q.resolve(result);

        if (!task.q2) {
          // it's a sync function and you don't want to release it manually, why
          // do you need a lock?
          onDone();
          return;
        }
      }

      deque();

      function onDone() {
        _onDone();
      }

      function _onDone(afterDone) {
        if (task.prev) {
          task.prev.next = task.next;
        }

        if (task.next) {
          task.next.prev = task.prev;
        }

        if (lastTask === task) {
          lastTask = task.prev;
        }

        if (!task.block) {
          activeReader--;
        }

        self.length--;

        if (afterDone) {
          afterDone();
        }

        deque();
      }
    }
  }

  class LockError extends Error {
    constructor(expire) {
      super("The database is locked. Will expire at ".concat(new Date(expire).toLocaleString()));
      this.expire = expire;
      this.name = "LockError";

      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, LockError);
      }
    }

  }

  function debounced(fn) {
    let timer = 0;
    let q;
    return () => {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(run);

      if (!q) {
        q = defer();
      }

      return q.promise;
    };

    function run() {
      Promise.resolve(fn()).then(q.resolve, q.reject);
      timer = 0;
      q = null;
    }

    function defer() {
      const o = {};
      o.promise = new Promise((resolve, reject) => {
        o.resolve = resolve;
        o.reject = reject;
      });
      return o;
    }
  }

  function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }

  function buildDrive(_drive) {
    const drive = Object.create(_drive);

    drive.get = /*#__PURE__*/function () {
      var _ref = _asyncToGenerator(function* (path) {
        return JSON.parse(yield _drive.get(path));
      });

      return function (_x) {
        return _ref.apply(this, arguments);
      };
    }();

    drive.put = /*#__PURE__*/function () {
      var _ref2 = _asyncToGenerator(function* (path, data) {
        return yield _drive.put(path, JSON.stringify(data));
      });

      return function (_x2, _x3) {
        return _ref2.apply(this, arguments);
      };
    }();

    drive.post = /*#__PURE__*/function () {
      var _ref3 = _asyncToGenerator(function* (path, data) {
        return yield _drive.post(path, JSON.stringify(data));
      });

      return function (_x4, _x5) {
        return _ref3.apply(this, arguments);
      };
    }();

    drive.isInit = false;

    if (!drive.acquireLock) {
      drive.acquireLock = acquireLock;
      drive.releaseLock = releaseLock;
    }

    if (!drive.getMeta) {
      drive.getMeta = getMeta;
      drive.putMeta = putMeta;
    }

    if (!drive.peekChanges) {
      drive.peekChanges = peekChanges;
    }

    return drive;

    function acquireLock(_x6) {
      return _acquireLock.apply(this, arguments);
    }

    function _acquireLock() {
      _acquireLock = _asyncToGenerator(function* (expire) {
        try {
          yield this.post("lock.json", {
            expire: Date.now() + expire * 60 * 1000
          });
        } catch (err) {
          if (err.code !== "EEXIST") {
            throw err;
          }

          const data = yield this.get("lock.json");

          if (Date.now() > data.expire) {
            // FIXME: this may delete a different lock created by other instances
            yield this.delete("lock.json");
            throw new Error("Found expired lock, please try again");
          }

          throw new LockError(data.expire);
        }
      });
      return _acquireLock.apply(this, arguments);
    }

    function releaseLock() {
      return _releaseLock.apply(this, arguments);
    }

    function _releaseLock() {
      _releaseLock = _asyncToGenerator(function* () {
        yield this.delete("lock.json");
      });
      return _releaseLock.apply(this, arguments);
    }

    function getMeta() {
      return _getMeta.apply(this, arguments);
    }

    function _getMeta() {
      _getMeta = _asyncToGenerator(function* () {
        try {
          return yield this.get("meta.json");
        } catch (err) {
          if (err.code === "ENOENT" || err.code === 404) {
            return {};
          }

          throw err;
        }
      });
      return _getMeta.apply(this, arguments);
    }

    function putMeta(_x7) {
      return _putMeta.apply(this, arguments);
    }

    function _putMeta() {
      _putMeta = _asyncToGenerator(function* (data) {
        yield this.put("meta.json", data);
      });
      return _putMeta.apply(this, arguments);
    }

    function peekChanges(_x8) {
      return _peekChanges.apply(this, arguments);
    }

    function _peekChanges() {
      _peekChanges = _asyncToGenerator(function* (oldMeta) {
        const newMeta = yield this.getMeta();
        return newMeta.lastChange !== oldMeta.lastChange;
      });
      return _peekChanges.apply(this, arguments);
    }
  }

  function dbToCloud({
    onGet,
    onPut,
    onDelete,
    onFirstSync,
    onWarn = console.error,
    onProgress,
    compareRevision,
    getState,
    setState,
    lockExpire = 60,
    retryMaxAttempts = 5,
    retryExp = 1.5,
    retryDelay = 10
  }) {
    let _drive2;

    let state;
    let meta;
    const changeCache = new Map();
    const saveState = debounced(() => setState(_drive2, state));
    const revisionCache = new Map();
    const lock = createLock();
    return {
      use,
      init,
      uninit,
      put,
      delete: delete_,
      syncNow,
      drive: () => _drive2,
      isInit: () => Boolean(state && state.enabled)
    };

    function use(newDrive) {
      _drive2 = buildDrive(newDrive);
    }

    function init() {
      return lock.write( /*#__PURE__*/_asyncToGenerator(function* () {
        if (state && state.enabled) {
          return;
        }

        if (!_drive2) {
          throw new Error("cloud drive is undefined");
        }

        state = (yield getState(_drive2)) || {};
        state.enabled = true;

        if (!state.queue) {
          state.queue = [];
        }
      }));
    }

    function uninit() {
      return lock.write( /*#__PURE__*/_asyncToGenerator(function* () {
        if (!state || !state.enabled) {
          return;
        }

        state = meta = null;
        changeCache.clear();
        revisionCache.clear();

        if (_drive2.uninit && _drive2.isInit) {
          yield _drive2.uninit();
          _drive2.isInit = false;
        }

        yield saveState();
      }));
    }

    function syncPull() {
      return _syncPull.apply(this, arguments);
    }

    function _syncPull() {
      _syncPull = _asyncToGenerator(function* () {
        meta = yield _drive2.getMeta();

        if (!meta.lastChange || meta.lastChange === state.lastChange) {
          // nothing changes
          return;
        }

        let changes = [];

        if (!state.lastChange) {
          // pull everything
          changes = (yield _drive2.list("docs")).map(name => ({
            action: 'put',
            _id: name.slice(0, -5)
          }));
        } else {
          const end = Math.floor((meta.lastChange - 1) / 100); // inclusive end

          let i = Math.floor(state.lastChange / 100);

          while (i <= end) {
            const newChanges = yield _drive2.get("changes/".concat(i, ".json"));
            changeCache.set(i, newChanges);
            changes = changes.concat(newChanges);
            i++;
          }

          changes = changes.slice(state.lastChange % 100);
        } // merge changes


        const idx = new Map();

        var _iterator = _createForOfIteratorHelper(changes),
            _step;

        try {
          for (_iterator.s(); !(_step = _iterator.n()).done;) {
            const change = _step.value;
            idx.set(change._id, change);
          }
        } catch (err) {
          _iterator.e(err);
        } finally {
          _iterator.f();
        }

        let loaded = 0;

        var _iterator2 = _createForOfIteratorHelper(idx),
            _step2;

        try {
          for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
            const _step2$value = _slicedToArray(_step2.value, 2),
                  id = _step2$value[0],
                  change = _step2$value[1];

            let doc, _rev;

            if (onProgress) {
              onProgress({
                phase: 'pull',
                total: idx.size,
                loaded,
                change
              });
            }

            if (change.action === "delete") {
              yield onDelete(id, change._rev);
            } else if (change.action === "put") {
              try {
                var _yield$_drive2$get = yield _drive2.get("docs/".concat(id, ".json"));

                doc = _yield$_drive2$get.doc;
                _rev = _yield$_drive2$get._rev;
              } catch (err) {
                if (err.code === "ENOENT" || err.code === 404) {
                  onWarn("Cannot find ".concat(id, ". Is it deleted without updating the history?"));
                  loaded++;
                  continue;
                }

                throw err;
              }

              yield onPut(doc);
            } // record the remote revision


            const rev = change._rev || _rev;

            if (rev) {
              revisionCache.set(id, rev);
            }

            loaded++;
          }
        } catch (err) {
          _iterator2.e(err);
        } finally {
          _iterator2.f();
        }

        state.lastChange = meta.lastChange;
        yield saveState();
      });
      return _syncPull.apply(this, arguments);
    }

    function syncPush() {
      return _syncPush.apply(this, arguments);
    }

    function _syncPush() {
      _syncPush = _asyncToGenerator(function* () {
        if (!state.queue.length) {
          // nothing to push
          return;
        } // snapshot


        const changes = state.queue.slice(); // merge changes

        const idx = new Map();

        var _iterator3 = _createForOfIteratorHelper(changes),
            _step3;

        try {
          for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
            const change = _step3.value;
            idx.set(change._id, change);
          } // drop outdated change

        } catch (err) {
          _iterator3.e(err);
        } finally {
          _iterator3.f();
        }

        const newChanges = [];

        var _iterator4 = _createForOfIteratorHelper(idx.values()),
            _step4;

        try {
          for (_iterator4.s(); !(_step4 = _iterator4.n()).done;) {
            const change = _step4.value;
            // FIXME: is it safe to assume that the local doc is newer when
            // remoteRev is undefined?
            const remoteRev = revisionCache.get(change._id);

            if (remoteRev !== undefined && compareRevision(change._rev, remoteRev) <= 0) {
              continue;
            }

            newChanges.push(change);
          } // FIXME: there should be no need to push data when !newChanges.length
          // start pushing

        } catch (err) {
          _iterator4.e(err);
        } finally {
          _iterator4.f();
        }

        let loaded = 0;

        for (var _i = 0, _newChanges = newChanges; _i < _newChanges.length; _i++) {
          const change = _newChanges[_i];

          if (onProgress) {
            onProgress({
              phase: 'push',
              loaded,
              total: newChanges.length,
              change
            });
          }

          if (change.action === "delete") {
            yield _drive2.delete("docs/".concat(change._id, ".json"));
          } else if (change.action === "put") {
            const doc = yield onGet(change._id, change._rev);
            yield _drive2.put("docs/".concat(change._id, ".json"), {
              doc,
              _rev: change._rev
            });
          }

          revisionCache.set(change._id, change._rev);
          loaded++;
        } // push changes


        let lastChanges;
        let index; // meta is already pulled in syncPull

        if (meta.lastChange) {
          index = Math.floor(meta.lastChange / 100);
          const len = meta.lastChange % 100;
          lastChanges = len ? changeCache.get(index) || (yield _drive2.get("changes/".concat(index, ".json"))) : []; // it is possible that JSON data contains more records defined by
          // meta.lastChange

          lastChanges = lastChanges.slice(0, len).concat(newChanges);
        } else {
          // first sync
          index = 0;
          lastChanges = newChanges;
        }

        for (let i = 0; i * 100 < lastChanges.length; i++) {
          const window = lastChanges.slice(i * 100, (i + 1) * 100);
          yield _drive2.put("changes/".concat(index + i, ".json"), window);
          changeCache.set(index + i, window);
        }

        meta.lastChange = (meta.lastChange || 0) + newChanges.length;
        yield _drive2.putMeta(meta);
        state.queue = state.queue.slice(changes.length);
        state.lastChange = meta.lastChange;
        yield saveState();
      });
      return _syncPush.apply(this, arguments);
    }

    function sync() {
      return _sync.apply(this, arguments);
    }

    function _sync() {
      _sync = _asyncToGenerator(function* () {
        let tried = 0;
        let wait = retryDelay;
        let lastErr;

        while (true) {
          // eslint-disable-line no-constant-condition
          try {
            yield _drive2.acquireLock(lockExpire);
            break;
          } catch (err) {
            if (err.name !== "LockError") {
              throw err;
            }

            lastErr = err;
          }

          tried++;

          if (tried >= retryMaxAttempts) {
            throw lastErr;
          }

          yield delay(wait * 1000);
          wait *= retryExp;
        }

        try {
          yield syncPull();
          yield syncPush();
        } finally {
          yield _drive2.releaseLock();
        }
      });
      return _sync.apply(this, arguments);
    }

    function syncNow(peek) {
      return lock.write( /*#__PURE__*/_asyncToGenerator(function* () {
        if (!state || !state.enabled) {
          throw new Error("Cannot sync now, the sync is not enabled");
        }

        if (_drive2.init && !_drive2.isInit) {
          yield _drive2.init();
          _drive2.isInit = true;
        }

        if (state.lastChange == null) {
          yield onFirstSync();
        }

        yield _syncNow(peek);
      }));
    }

    function _syncNow() {
      return _syncNow2.apply(this, arguments);
    }

    function _syncNow2() {
      _syncNow2 = _asyncToGenerator(function* (peek = true) {
        if (onProgress) {
          onProgress({
            phase: 'start'
          });
        }

        try {
          if (!state.queue.length && peek && meta) {
            const changed = yield _drive2.peekChanges(meta);

            if (!changed) {
              return;
            }
          }

          yield sync();
        } finally {
          if (onProgress) {
            onProgress({
              phase: 'end'
            });
          }
        }
      });
      return _syncNow2.apply(this, arguments);
    }

    function put(_id, _rev) {
      if (!state || !state.enabled) {
        return;
      }

      state.queue.push({
        _id,
        _rev,
        action: "put"
      });
      saveState();
    }

    function delete_(_id, _rev) {
      if (!state || !state.enabled) {
        return;
      }

      state.queue.push({
        _id,
        _rev,
        action: "delete"
      });
      saveState();
    }
  }

  var empty = (() => {});

  function percentToByte(p) {
    return String.fromCharCode(parseInt(p.slice(1), 16));
  }

  function encode(str) {
    return btoa(encodeURIComponent(str).replace(/%[0-9A-F]{2}/g, percentToByte));
  }

  function byteToPercent(b) {
    return "%".concat("00".concat(b.charCodeAt(0).toString(16)).slice(-2));
  }

  function decode(str) {
    return decodeURIComponent(Array.from(atob(str), byteToPercent).join(""));
  }

  const _excluded$2 = ["path", "contentType", "headers", "format", "raw"];

  class RequestError extends Error {
    constructor(message, origin, code = origin && origin.status) {
      super(message);
      this.code = code;
      this.origin = origin;

      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, RequestError);
      }
    }

  }

  function createRequest({
    fetch,
    cooldown = 0,
    getAccessToken,
    username,
    password
  }) {
    const lock = createLock();
    const basicAuth = username || password ? "Basic ".concat(encode("".concat(username, ":").concat(password))) : null;
    return args => {
      return lock.write( /*#__PURE__*/function () {
        var _ref = _asyncToGenerator(function* (done) {
          try {
            return yield doRequest(args);
          } finally {
            if (!cooldown || !args.method || args.method === "GET") {
              done();
            } else {
              setTimeout(done, cooldown);
            }
          }
        });

        return function (_x) {
          return _ref.apply(this, arguments);
        };
      }());
    };

    function doRequest(_x2) {
      return _doRequest.apply(this, arguments);
    }

    function _doRequest() {
      _doRequest = _asyncToGenerator(function* (_ref2) {
        let path = _ref2.path,
            contentType = _ref2.contentType,
            _headers = _ref2.headers,
            format = _ref2.format,
            _ref2$raw = _ref2.raw,
            raw = _ref2$raw === void 0 ? false : _ref2$raw,
            args = _objectWithoutProperties(_ref2, _excluded$2);

        const headers = {};

        if (getAccessToken) {
          headers["Authorization"] = "Bearer ".concat(yield getAccessToken());
        }

        if (basicAuth) {
          headers["Authorization"] = basicAuth;
        }

        if (contentType) {
          headers["Content-Type"] = contentType;
        }

        Object.assign(headers, _headers);

        while (true) {
          // eslint-disable-line no-constant-condition
          // console.log("req", path, args, headers);
          const res = yield fetch(path, _objectSpread2({
            headers
          }, args)); // console.log("res", path, args, res.status, headers);

          if (!res.ok) {
            const retry = res.headers.get("Retry-After");

            if (retry) {
              const time = Number(retry);

              if (time) {
                yield delay(time * 1000);
                continue;
              }
            }

            const text = yield res.text();
            throw new RequestError("failed to fetch [".concat(res.status, "]: ").concat(text), res);
          }

          if (raw) {
            return res;
          }

          if (format) {
            return yield res[format]();
          }

          const resContentType = res.headers.get("Content-Type");

          if (/application\/json/.test(resContentType)) {
            return yield res.json();
          }

          return yield res.text();
        }
      });
      return _doRequest.apply(this, arguments);
    }
  }

  function createDrive$4({
    userAgent = "db-to-cloud",
    owner,
    repo,
    getAccessToken,
    fetch = (typeof self !== "undefined" ? self : global).fetch
  }) {
    const request = createRequest({
      fetch,
      getAccessToken,
      cooldown: 1000
    });
    const shaCache = new Map();
    return {
      name: "github",
      get,
      put,
      post,
      delete: delete_,
      list,
      shaCache
    };

    function requestAPI(args) {
      if (!args.headers) {
        args.headers = {};
      }

      if (!args.headers["User-Agent"]) {
        args.headers["User-Agent"] = userAgent;
      }

      if (!args.headers["Accept"]) {
        args.headers["Accept"] = "application/vnd.github.v3+json";
      }

      args.path = "https://api.github.com".concat(args.path);
      return request(args);
    }

    function list(_x) {
      return _list.apply(this, arguments);
    }

    function _list() {
      _list = _asyncToGenerator(function* (file) {
        // FIXME: This API has an upper limit of 1,000 files for a directory. If you need to retrieve more files, use the Git Trees API.
        const result = yield requestAPI({
          path: "/repos/".concat(owner, "/").concat(repo, "/contents/").concat(file)
        });
        const names = [];

        var _iterator = _createForOfIteratorHelper(result),
            _step;

        try {
          for (_iterator.s(); !(_step = _iterator.n()).done;) {
            const item = _step.value;
            names.push(item.name);
            shaCache.set(item.path, item.sha);
          }
        } catch (err) {
          _iterator.e(err);
        } finally {
          _iterator.f();
        }

        return names;
      });
      return _list.apply(this, arguments);
    }

    function get(_x2) {
      return _get.apply(this, arguments);
    }

    function _get() {
      _get = _asyncToGenerator(function* (file) {
        // FIXME: This API supports files up to 1 megabyte in size.
        const result = yield requestAPI({
          path: "/repos/".concat(owner, "/").concat(repo, "/contents/").concat(file)
        });
        shaCache.set(result.path, result.sha);
        return decode(result.content);
      });
      return _get.apply(this, arguments);
    }

    function put(_x3, _x4) {
      return _put.apply(this, arguments);
    }

    function _put() {
      _put = _asyncToGenerator(function* (file, data, overwrite = true) {
        const params = {
          message: "",
          content: encode(data)
        };

        if (overwrite && shaCache.has(file)) {
          params.sha = shaCache.get(file);
        }

        const args = {
          method: "PUT",
          path: "/repos/".concat(owner, "/").concat(repo, "/contents/").concat(file),
          contentType: "application/json",
          body: JSON.stringify(params)
        };
        let retried = false;
        let result;

        while (!result) {
          try {
            result = yield requestAPI(args);
          } catch (err) {
            if (err.code !== 422 || !err.message.includes("\\\"sha\\\" wasn't supplied")) {
              throw err;
            }

            if (!overwrite || retried) {
              err.code = "EEXIST";
              throw err;
            }

            yield get(file);
          }

          retried = true;
        }

        shaCache.set(file, result.content.sha);
      });
      return _put.apply(this, arguments);
    }

    function post(file, data) {
      return put(file, data, false);
    }

    function delete_(_x5) {
      return _delete_.apply(this, arguments);
    }

    function _delete_() {
      _delete_ = _asyncToGenerator(function* (file) {
        try {
          let sha = shaCache.get(file);

          if (!sha) {
            yield get(file);
            sha = shaCache.get(file);
          }

          yield requestAPI({
            method: "DELETE",
            path: "/repos/".concat(owner, "/").concat(repo, "/contents/").concat(file),
            body: JSON.stringify({
              message: "",
              sha
            })
          });
        } catch (err) {
          if (err.code === 404) {
            return;
          } // FIXME: do we have to handle 422 errors?


          throw err;
        }
      });
      return _delete_.apply(this, arguments);
    }
  }

  const _excluded$1 = ["path", "body"];

  function createDrive$3({
    getAccessToken,
    fetch = (typeof self !== "undefined" ? self : global).fetch
  }) {
    const request = createRequest({
      fetch,
      getAccessToken
    });
    return {
      name: "dropbox",
      get,
      put,
      post,
      delete: delete_,
      list
    };

    function requestRPC(_ref) {
      let path = _ref.path,
          body = _ref.body,
          args = _objectWithoutProperties(_ref, _excluded$1);

      return request(_objectSpread2({
        method: "POST",
        path: "https://api.dropboxapi.com/2/".concat(path),
        contentType: "application/json",
        body: JSON.stringify(body)
      }, args));
    }

    function list(_x) {
      return _list.apply(this, arguments);
    }

    function _list() {
      _list = _asyncToGenerator(function* (file) {
        const names = [];
        let result = yield requestRPC({
          path: "files/list_folder",
          body: {
            path: "/".concat(file)
          }
        });

        var _iterator = _createForOfIteratorHelper(result.entries),
            _step;

        try {
          for (_iterator.s(); !(_step = _iterator.n()).done;) {
            const entry = _step.value;
            names.push(entry.name);
          }
        } catch (err) {
          _iterator.e(err);
        } finally {
          _iterator.f();
        }

        if (!result.has_more) {
          return names;
        }

        while (result.has_more) {
          result = yield requestRPC({
            path: "files/list_folder/continue",
            body: {
              cursor: result.cursor
            }
          });

          var _iterator2 = _createForOfIteratorHelper(result.entries),
              _step2;

          try {
            for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
              const entry = _step2.value;
              names.push(entry.name);
            }
          } catch (err) {
            _iterator2.e(err);
          } finally {
            _iterator2.f();
          }
        }

        return names;
      });
      return _list.apply(this, arguments);
    }

    function stringifyParams(obj) {
      const params = new URLSearchParams();
      params.set("arg", JSON.stringify(obj));
      return params.toString();
    }

    function get(_x2) {
      return _get.apply(this, arguments);
    }

    function _get() {
      _get = _asyncToGenerator(function* (file) {
        const params = {
          path: "/".concat(file)
        };

        try {
          return yield request({
            path: "https://content.dropboxapi.com/2/files/download?".concat(stringifyParams(params)),
            format: "text"
          });
        } catch (err) {
          if (err.code === 409 && err.message.includes("not_found")) {
            err.code = "ENOENT";
          }

          throw err;
        }
      });
      return _get.apply(this, arguments);
    }

    function put(_x3, _x4) {
      return _put.apply(this, arguments);
    }

    function _put() {
      _put = _asyncToGenerator(function* (file, data, mode = "overwrite") {
        const params = {
          path: "/".concat(file),
          mode,
          autorename: false,
          mute: true
        };
        yield request({
          path: "https://content.dropboxapi.com/2/files/upload?".concat(stringifyParams(params)),
          method: "POST",
          contentType: "application/octet-stream",
          body: data
        });
      });
      return _put.apply(this, arguments);
    }

    function post(_x5, _x6) {
      return _post.apply(this, arguments);
    }

    function _post() {
      _post = _asyncToGenerator(function* (file, data) {
        try {
          return yield put(file, data, "add");
        } catch (err) {
          if (err.code === 409 && err.message.includes("conflict")) {
            err.code = "EEXIST";
          }

          throw err;
        }
      });
      return _post.apply(this, arguments);
    }

    function delete_(_x7) {
      return _delete_.apply(this, arguments);
    }

    function _delete_() {
      _delete_ = _asyncToGenerator(function* (file) {
        try {
          yield requestRPC({
            path: "files/delete_v2",
            body: {
              path: "/".concat(file)
            }
          });
        } catch (err) {
          if (err.code === 409 && err.message.includes("not_found")) {
            return;
          }

          throw err;
        }
      });
      return _delete_.apply(this, arguments);
    }
  }

  function createDrive$2({
    getAccessToken,
    fetch = (typeof self !== "undefined" ? self : global).fetch
  }) {
    const request = createRequest({
      fetch,
      getAccessToken
    });
    return {
      name: "onedrive",
      get,
      put,
      post,
      delete: delete_,
      list
    };

    function query(_x) {
      return _query.apply(this, arguments);
    }

    function _query() {
      _query = _asyncToGenerator(function* (args) {
        args.path = "https://graph.microsoft.com/v1.0/me/drive/special/approot".concat(args.path);
        return yield request(args);
      });
      return _query.apply(this, arguments);
    }

    function list(_x2) {
      return _list.apply(this, arguments);
    }

    function _list() {
      _list = _asyncToGenerator(function* (file) {
        if (file) {
          file = ":/".concat(file, ":");
        }

        let result = yield query({
          path: "".concat(file, "/children?select=name")
        });
        let files = result.value.map(i => i.name);

        while (result["@odata.nextLink"]) {
          result = yield request({
            path: result["@odata.nextLink"]
          });
          files = files.concat(result.value.map(i => i.name));
        }

        return files;
      });
      return _list.apply(this, arguments);
    }

    function get(_x3) {
      return _get.apply(this, arguments);
    }

    function _get() {
      _get = _asyncToGenerator(function* (file) {
        return yield query({
          path: ":/".concat(file, ":/content"),
          format: "text"
        });
      });
      return _get.apply(this, arguments);
    }

    function put(_x4, _x5) {
      return _put.apply(this, arguments);
    }

    function _put() {
      _put = _asyncToGenerator(function* (file, data) {
        yield query({
          method: "PUT",
          path: ":/".concat(file, ":/content"),
          headers: {
            "Content-Type": "text/plain"
          },
          body: data
        });
      });
      return _put.apply(this, arguments);
    }

    function post(_x6, _x7) {
      return _post.apply(this, arguments);
    }

    function _post() {
      _post = _asyncToGenerator(function* (file, data) {
        try {
          yield query({
            method: "PUT",
            path: ":/".concat(file, ":/content?@microsoft.graph.conflictBehavior=fail"),
            headers: {
              "Content-Type": "text/plain"
            },
            body: data
          });
        } catch (err) {
          if (err.code === 409 && err.message.includes("nameAlreadyExists")) {
            err.code = "EEXIST";
          }

          throw err;
        }
      });
      return _post.apply(this, arguments);
    }

    function delete_(_x8) {
      return _delete_.apply(this, arguments);
    }

    function _delete_() {
      _delete_ = _asyncToGenerator(function* (file) {
        try {
          yield query({
            method: "DELETE",
            path: ":/".concat(file, ":")
          });
        } catch (err) {
          if (err.code === 404) {
            return;
          }

          throw err;
        }
      });
      return _delete_.apply(this, arguments);
    }
  }

  function createDrive$1({
    getAccessToken,
    fetch = (typeof self !== "undefined" ? self : global).fetch,
    FormData = (typeof self !== "undefined" ? self : global).FormData,
    Blob = (typeof self !== "undefined" ? self : global).Blob
  }) {
    const request = createRequest({
      fetch,
      getAccessToken
    });
    const fileMetaCache = new Map();
    let lockRev;
    return {
      name: "google",
      get,
      put,
      post,
      delete: delete_,
      list,
      init,
      acquireLock,
      releaseLock,
      fileMetaCache
    };

    function revDelete(_x, _x2) {
      return _revDelete.apply(this, arguments);
    }

    function _revDelete() {
      _revDelete = _asyncToGenerator(function* (fileId, revId) {
        yield request({
          method: "DELETE",
          path: "https://www.googleapis.com/drive/v3/files/".concat(fileId, "/revisions/").concat(revId)
        });
      });
      return _revDelete.apply(this, arguments);
    }

    function acquireLock(_x3) {
      return _acquireLock.apply(this, arguments);
    }

    function _acquireLock() {
      _acquireLock = _asyncToGenerator(function* (expire) {
        const lock = fileMetaCache.get("lock.json");

        const _yield$queryPatch = yield queryPatch(lock.id, JSON.stringify({
          expire: Date.now() + expire * 60 * 1000
        })),
              headRevisionId = _yield$queryPatch.headRevisionId;

        const result = yield request({
          path: "https://www.googleapis.com/drive/v3/files/".concat(lock.id, "/revisions?fields=revisions(id)")
        });

        for (let i = 1; i < result.revisions.length; i++) {
          const revId = result.revisions[i].id;

          if (revId === headRevisionId) {
            // success
            lockRev = headRevisionId;
            return;
          }

          const rev = JSON.parse(yield request({
            path: "https://www.googleapis.com/drive/v3/files/".concat(lock.id, "/revisions/").concat(revId, "?alt=media")
          }));

          if (rev.expire > Date.now()) {
            // failed, delete the lock
            yield revDelete(lock.id, headRevisionId);
            throw new LockError(rev.expire);
          } // delete outdated lock


          yield revDelete(lock.id, revId);
        }

        throw new Error("cannot find lock revision");
      });
      return _acquireLock.apply(this, arguments);
    }

    function releaseLock() {
      return _releaseLock.apply(this, arguments);
    }

    function _releaseLock() {
      _releaseLock = _asyncToGenerator(function* () {
        const lock = fileMetaCache.get("lock.json");
        yield revDelete(lock.id, lockRev);
        lockRev = null;
      });
      return _releaseLock.apply(this, arguments);
    }

    function queryList(_x4, _x5) {
      return _queryList.apply(this, arguments);
    }

    function _queryList() {
      _queryList = _asyncToGenerator(function* (path, onPage) {
        path = "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=nextPageToken,files(id,name,headRevisionId)" + (path ? "&" + path : "");
        let result = yield request({
          path
        });
        onPage(result);

        while (result.nextPageToken) {
          result = yield request({
            path: "".concat(path, "&pageToken=").concat(result.nextPageToken)
          });
          onPage(result);
        }
      });
      return _queryList.apply(this, arguments);
    }

    function queryPatch(_x6, _x7) {
      return _queryPatch.apply(this, arguments);
    }

    function _queryPatch() {
      _queryPatch = _asyncToGenerator(function* (id, text) {
        return yield request({
          method: "PATCH",
          path: "https://www.googleapis.com/upload/drive/v3/files/".concat(id, "?uploadType=media&fields=headRevisionId"),
          headers: {
            "Content-Type": "text/plain"
          },
          body: text
        });
      });
      return _queryPatch.apply(this, arguments);
    }

    function updateMeta(_x8) {
      return _updateMeta.apply(this, arguments);
    }

    function _updateMeta() {
      _updateMeta = _asyncToGenerator(function* (query) {
        if (query) {
          query = "q=".concat(encodeURIComponent(query));
        }

        yield queryList(query, result => {
          var _iterator = _createForOfIteratorHelper(result.files),
              _step;

          try {
            for (_iterator.s(); !(_step = _iterator.n()).done;) {
              const file = _step.value;
              fileMetaCache.set(file.name, file);
            }
          } catch (err) {
            _iterator.e(err);
          } finally {
            _iterator.f();
          }
        });
      });
      return _updateMeta.apply(this, arguments);
    }

    function init() {
      return _init.apply(this, arguments);
    }

    function _init() {
      _init = _asyncToGenerator(function* () {
        yield updateMeta();

        if (!fileMetaCache.has("lock.json")) {
          yield post("lock.json", "{}");
        }

        if (!fileMetaCache.has("meta.json")) {
          yield post("meta.json", "{}");
        }
      });
      return _init.apply(this, arguments);
    }

    function list(_x9) {
      return _list.apply(this, arguments);
    }

    function _list() {
      _list = _asyncToGenerator(function* (file) {
        // FIXME: this only works if file is a single dir
        // FIXME: this only works if the list method is called right after init, use
        // queryList instead?
        return [...fileMetaCache.values()].filter(f => f.name.startsWith(file + "/")).map(f => f.name.split("/")[1]);
      });
      return _list.apply(this, arguments);
    }

    function get(_x10) {
      return _get.apply(this, arguments);
    }

    function _get() {
      _get = _asyncToGenerator(function* (file) {
        let meta = fileMetaCache.get(file);

        if (!meta) {
          yield updateMeta("name = '".concat(file, "'"));
          meta = fileMetaCache.get(file);

          if (!meta) {
            throw new RequestError("metaCache doesn't contain ".concat(file), null, "ENOENT");
          }
        }

        try {
          return yield request({
            path: "https://www.googleapis.com/drive/v3/files/".concat(meta.id, "?alt=media")
          });
        } catch (err) {
          if (err.code === 404) {
            err.code = "ENOENT";
          }

          throw err;
        }
      });
      return _get.apply(this, arguments);
    }

    function put(_x11, _x12) {
      return _put.apply(this, arguments);
    }

    function _put() {
      _put = _asyncToGenerator(function* (file, data) {
        if (!fileMetaCache.has(file)) {
          return yield post(file, data);
        }

        const meta = fileMetaCache.get(file);
        const result = yield queryPatch(meta.id, data);
        meta.headRevisionId = result.headRevisionId;
      });
      return _put.apply(this, arguments);
    }

    function post(_x13, _x14) {
      return _post.apply(this, arguments);
    }

    function _post() {
      _post = _asyncToGenerator(function* (file, data) {
        const body = new FormData();
        const meta = {
          name: file,
          parents: ["appDataFolder"]
        };
        body.append("metadata", new Blob([JSON.stringify(meta)], {
          type: "application/json; charset=UTF-8"
        }));
        body.append("media", new Blob([data], {
          type: "text/plain"
        }));
        const result = yield request({
          method: "POST",
          path: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,headRevisionId",
          body
        });
        fileMetaCache.set(result.name, result);
      });
      return _post.apply(this, arguments);
    }

    function delete_(_x15) {
      return _delete_.apply(this, arguments);
    }

    function _delete_() {
      _delete_ = _asyncToGenerator(function* (file) {
        const meta = fileMetaCache.get(file);

        if (!meta) {
          return;
        }

        try {
          yield request({
            method: "DELETE",
            path: "https://www.googleapis.com/drive/v3/files/".concat(meta.id)
          });
        } catch (err) {
          if (err.code === 404) {
            return;
          }

          throw err;
        }
      });
      return _delete_.apply(this, arguments);
    }
  }

  function dirname(path) {
    const dir = path.replace(/[/\\][^/\\]+\/?$/, "");
    if (dir === path) return ".";
    return dir;
  }

  const _excluded = ["path"];

  function arrayify(o) {
    return Array.isArray(o) ? o : [o];
  }

  function xmlToJSON(node) {
    // FIXME: xmldom doesn't support children
    const children = Array.prototype.filter.call(node.childNodes, i => i.nodeType === 1);

    if (!children.length) {
      return node.textContent;
    }

    const o = {};

    var _iterator = _createForOfIteratorHelper(children),
        _step;

    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        const c = _step.value;
        const cResult = xmlToJSON(c);

        if (!o[c.localName]) {
          o[c.localName] = cResult;
        } else if (!Array.isArray(o[c.localName])) {
          const list = [o[c.localName]];
          list.push(cResult);
          o[c.localName] = list;
        } else {
          o[c.localName].push(cResult);
        }
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }

    return o;
  }

  function createDrive({
    username,
    password,
    url,
    fetch = (typeof self !== "undefined" ? self : global).fetch,
    DOMParser = (typeof self !== "undefined" ? self : global).DOMParser
  }) {
    if (!url.endsWith("/")) {
      url += "/";
    }
    const request = createRequest({
      fetch,
      username,
      password
    });
    return {
      name: "webdav",
      get,
      put,
      post,
      delete: delete_,
      list // acquireLock,
      // releaseLock

    };

    function requestDAV(_x) {
      return _requestDAV.apply(this, arguments);
    }

    function _requestDAV() {
      _requestDAV = _asyncToGenerator(function* (_ref) {
        let path = _ref.path,
            args = _objectWithoutProperties(_ref, _excluded);

        const text = yield request(_objectSpread2({
          path: "".concat(url).concat(path)
        }, args));
        if (args.format || typeof text !== "string" || !text) return text;
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");
        const result = xmlToJSON(xml);

        if (result.error) {
          throw new Error("Failed requesting DAV at ".concat(url).concat(path, ": ").concat(JSON.stringify(result.error)));
        }

        if (result.multistatus) {
          result.multistatus.response = arrayify(result.multistatus.response);

          var _iterator2 = _createForOfIteratorHelper(result.multistatus.response),
              _step2;

          try {
            for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
              const r = _step2.value;

              if (r.error) {
                throw new Error("Failed requesting DAV at ".concat(url).concat(path, ": ").concat(r.href, " ").concat(r.error));
              }
            }
          } catch (err) {
            _iterator2.e(err);
          } finally {
            _iterator2.f();
          }
        }

        return result;
      });
      return _requestDAV.apply(this, arguments);
    }

    function list(_x2) {
      return _list.apply(this, arguments);
    }

    function _list() {
      _list = _asyncToGenerator(function* (file) {
        if (!file.endsWith("/")) {
          file += "/";
        }

        const result = yield requestDAV({
          method: "PROPFIND",
          path: file,
          contentType: "application/xml",
          body: "<?xml version=\"1.0\" encoding=\"utf-8\" ?> \n        <propfind xmlns=\"DAV:\">\n          <allprop/>\n        </propfind>",
          headers: {
            "Depth": "1"
          }
        });
        const files = [];

        var _iterator3 = _createForOfIteratorHelper(arrayify(result.multistatus.response)),
            _step3;

        try {
          for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
            const entry = _step3.value;

            if (arrayify(entry.propstat).some(s => s.prop.resourcetype && s.prop.resourcetype.collection !== undefined)) {
              continue;
            }

            const base = "".concat(url).concat(file);
            const absUrl = new URL(entry.href, base).href;
            const name = absUrl.slice(base.length);
            files.push(name);
          }
        } catch (err) {
          _iterator3.e(err);
        } finally {
          _iterator3.f();
        }

        return files;
      });
      return _list.apply(this, arguments);
    }

    function get(_x3) {
      return _get.apply(this, arguments);
    }

    function _get() {
      _get = _asyncToGenerator(function* (file) {
        return yield requestDAV({
          method: "GET",
          path: file,
          format: "text"
        });
      });
      return _get.apply(this, arguments);
    }

    function put(_x4, _x5) {
      return _put.apply(this, arguments);
    }

    function _put() {
      _put = _asyncToGenerator(function* (file, data) {
        return yield withDir(dirname(file), () => requestDAV({
          method: "PUT",
          path: file,
          contentType: "application/octet-stream",
          body: data
        }));
      });
      return _put.apply(this, arguments);
    }

    function withDir(_x6, _x7) {
      return _withDir.apply(this, arguments);
    }

    function _withDir() {
      _withDir = _asyncToGenerator(function* (dir, cb) {
        try {
          return yield cb();
        } catch (err) {
          if (err.code !== 409 && err.code !== 404 || dir === ".") {
            throw err;
          }
        }

        yield withDir(dirname(dir), () => requestDAV({
          method: "MKCOL",
          path: dir
        }));
        return yield cb();
      });
      return _withDir.apply(this, arguments);
    }

    function post(_x8, _x9) {
      return _post.apply(this, arguments);
    }

    function _post() {
      _post = _asyncToGenerator(function* (file, data) {
        try {
          return yield withDir(dirname(file), () => requestDAV({
            method: "PUT",
            path: file,
            body: data,
            contentType: "octet-stream",
            headers: {
              // FIXME: seems webdav-server doesn't support etag, what about others?
              "If-None-Match": "*"
            }
          }));
        } catch (err) {
          if (err.code === 412) {
            err.code = "EEXIST";
          }

          throw err;
        }
      });
      return _post.apply(this, arguments);
    }

    function delete_(_x10) {
      return _delete_.apply(this, arguments);
    } // async function acquireLock(mins) {
    // const r = await requestDAV({
    // method: "LOCK",
    // path: "",
    // body: 
    // `<?xml version="1.0" encoding="utf-8" ?> 
    // <lockinfo xmlns='DAV:'> 
    // <lockscope><exclusive/></lockscope> 
    // <locktype><write/></locktype> 
    // </lockinfo> `,
    // headers: {
    // "Timeout": `Second-${mins * 60}`
    // },
    // raw: true
    // });
    // lockToken = r.headers.get("Lock-Token");
    // }
    // async function releaseLock() {
    // await requestDAV({
    // method: "UNLOCK",
    // path: "",
    // headers: {
    // "Lock-Token": lockToken
    // }
    // });
    // }


    function _delete_() {
      _delete_ = _asyncToGenerator(function* (file) {
        // FIXME: support deleting collections?
        // FIXME: handle errors?
        try {
          yield requestDAV({
            method: "DELETE",
            path: file
          });
        } catch (err) {
          if (err.code === 404) return;
          throw err;
        }
      });
      return _delete_.apply(this, arguments);
    }
  }

  var index = /*#__PURE__*/Object.freeze({
    __proto__: null,
    fsDrive: empty,
    github: createDrive$4,
    dropbox: createDrive$3,
    onedrive: createDrive$2,
    google: createDrive$1,
    webdav: createDrive
  });

  exports.dbToCloud = dbToCloud;
  exports.drive = index;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

}({}));
