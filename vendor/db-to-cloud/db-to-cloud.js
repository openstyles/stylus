var dbToCloud = (function (exports) {
  'use strict';

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

  function ownKeys(object, enumerableOnly) {
    var keys = Object.keys(object);

    if (Object.getOwnPropertySymbols) {
      var symbols = Object.getOwnPropertySymbols(object);
      if (enumerableOnly) symbols = symbols.filter(function (sym) {
        return Object.getOwnPropertyDescriptor(object, sym).enumerable;
      });
      keys.push.apply(keys, symbols);
    }

    return keys;
  }

  function _objectSpread2(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i] != null ? arguments[i] : {};

      if (i % 2) {
        ownKeys(source, true).forEach(function (key) {
          _defineProperty(target, key, source[key]);
        });
      } else if (Object.getOwnPropertyDescriptors) {
        Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
      } else {
        ownKeys(source).forEach(function (key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
      }
    }

    return target;
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
    return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest();
  }

  function _arrayWithHoles(arr) {
    if (Array.isArray(arr)) return arr;
  }

  function _iterableToArrayLimit(arr, i) {
    if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) {
      return;
    }

    var _arr = [];
    var _n = true;
    var _d = false;
    var _e = undefined;

    try {
      for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
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

  function _nonIterableRest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance");
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

  function buildDrive(_drive) {
    const drive = Object.create(_drive);

    drive.get =
    /*#__PURE__*/
    function () {
      var _ref = _asyncToGenerator(function* (path) {
        return JSON.parse((yield _drive.get(path)));
      });

      return function (_x) {
        return _ref.apply(this, arguments);
      };
    }();

    drive.put =
    /*#__PURE__*/
    function () {
      var _ref2 = _asyncToGenerator(function* (path, data) {
        return yield _drive.put(path, JSON.stringify(data));
      });

      return function (_x2, _x3) {
        return _ref2.apply(this, arguments);
      };
    }();

    drive.post =
    /*#__PURE__*/
    function () {
      var _ref3 = _asyncToGenerator(function* (path, data) {
        return yield _drive.post(path, JSON.stringify(data));
      });

      return function (_x4, _x5) {
        return _ref3.apply(this, arguments);
      };
    }();

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
          if (err.code === "EEXIST") {
            const data = yield this.get("lock.json");

            if (Date.now() > data.expire) {
              yield this.delete("lock.json");
            }
          }

          throw err;
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
    lockExpire = 60
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
      start,
      stop,
      put,
      delete: delete_,
      syncNow,
      drive: () => _drive2,
      isInit: () => Boolean(state && state.enabled)
    };

    function use(newDrive) {
      _drive2 = buildDrive(newDrive);
    }

    function start() {
      return _start.apply(this, arguments);
    }

    function _start() {
      _start = _asyncToGenerator(function* () {
        if (state && state.enabled) {
          return;
        }

        if (!_drive2) {
          throw new Error("cloud drive is undefined");
        }

        if (_drive2.init) {
          yield _drive2.init();
        }

        state = (yield getState(_drive2)) || {};
        state.enabled = true;

        if (!state.queue) {
          state.queue = [];
        }

        if (state.lastChange == null) {
          yield onFirstSync();
        }

        yield syncNow();
      });
      return _start.apply(this, arguments);
    }

    function stop() {
      return _stop.apply(this, arguments);
    }

    function _stop() {
      _stop = _asyncToGenerator(function* () {
        if (!state || !state.enabled) {
          return;
        }

        state.enabled = false;
        yield lock.write(
        /*#__PURE__*/
        _asyncToGenerator(function* () {
          if (_drive2.uninit) {
            yield _drive2.uninit();
          }

          yield saveState();
        }));
      });
      return _stop.apply(this, arguments);
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
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = changes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            const change = _step.value;
            idx.set(change._id, change);
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return != null) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        let loaded = 0;
        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (var _iterator2 = idx[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
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
                var _ref5 = yield _drive2.get("docs/".concat(id, ".json"));

                doc = _ref5.doc;
                _rev = _ref5._rev;
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
          _didIteratorError2 = true;
          _iteratorError2 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion2 && _iterator2.return != null) {
              _iterator2.return();
            }
          } finally {
            if (_didIteratorError2) {
              throw _iteratorError2;
            }
          }
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
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = changes[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            const change = _step3.value;
            idx.set(change._id, change);
          } // drop outdated change

        } catch (err) {
          _didIteratorError3 = true;
          _iteratorError3 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion3 && _iterator3.return != null) {
              _iterator3.return();
            }
          } finally {
            if (_didIteratorError3) {
              throw _iteratorError3;
            }
          }
        }

        const newChanges = [];
        var _iteratorNormalCompletion4 = true;
        var _didIteratorError4 = false;
        var _iteratorError4 = undefined;

        try {
          for (var _iterator4 = idx.values()[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
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
          _didIteratorError4 = true;
          _iteratorError4 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion4 && _iterator4.return != null) {
              _iterator4.return();
            }
          } finally {
            if (_didIteratorError4) {
              throw _iteratorError4;
            }
          }
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
        yield _drive2.acquireLock(lockExpire);

        try {
          yield syncPull();
          yield syncPush();
        } finally {
          yield _drive2.releaseLock();
        }
      });
      return _sync.apply(this, arguments);
    }

    function syncNow() {
      return _syncNow.apply(this, arguments);
    }

    function _syncNow() {
      _syncNow = _asyncToGenerator(function* (peek = true) {
        if (!state || !state.enabled) {
          throw new Error("Cannot sync now, the sync is not enabled");
        }

        yield lock.write(
        /*#__PURE__*/
        _asyncToGenerator(function* () {
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
        }));
      });
      return _syncNow.apply(this, arguments);
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

  const _module_exports_ = {};
  Object.defineProperty(_module_exports_, "__esModule", {
    value: true
  });

  function percentToByte(p) {
    return String.fromCharCode(parseInt(p.slice(1), 16));
  }

  function encode(str) {
    return btoa(encodeURIComponent(str).replace(/%[0-9A-F]{2}/g, percentToByte));
  }

  _module_exports_.encode = encode;

  function byteToPercent(b) {
    return "%".concat("00".concat(b.charCodeAt(0).toString(16)).slice(-2));
  }

  function decode(str) {
    return decodeURIComponent(Array.from(atob(str), byteToPercent).join(""));
  }

  _module_exports_.decode = decode;

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

  function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }

  function createRequest({
    fetch,
    cooldown = 0,
    getAccessToken
  }) {
    const lock = createLock();
    return args => {
      return lock.write(
      /*#__PURE__*/
      function () {
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
            args = _objectWithoutProperties(_ref2, ["path", "contentType", "headers", "format"]);

        const headers = {
          "Authorization": "Bearer ".concat((yield getAccessToken()))
        };

        if (contentType) {
          headers["Content-Type"] = contentType;
        }

        Object.assign(headers, _headers);

        while (true) {
          // eslint-disable-line no-constant-condition
          const res = yield fetch(path, _objectSpread2({
            headers
          }, args));

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

  function createDrive({
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
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = result[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            const item = _step.value;
            names.push(item.name);
            shaCache.set(item.path, item.sha);
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return != null) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
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
        return _module_exports_.decode(result.content);
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
          content: _module_exports_.encode(data)
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

  function createDrive$1({
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
          args = _objectWithoutProperties(_ref, ["path", "body"]);

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
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = result.entries[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            const entry = _step.value;
            names.push(entry.name);
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return != null) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
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
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = result.entries[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              const entry = _step2.value;
              names.push(entry.name);
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2.return != null) {
                _iterator2.return();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
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
          autorename: false
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

        const result = yield query({
          path: "".concat(file, "/children?select=name")
        });
        return result.value.map(i => i.name);
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

  function createDrive$3({
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

        const _ref = yield queryPatch(lock.id, JSON.stringify({
          expire: Date.now() + expire * 60 * 1000
        })),
              headRevisionId = _ref.headRevisionId;

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

          const rev = JSON.parse((yield request({
            path: "https://www.googleapis.com/drive/v3/files/".concat(lock.id, "/revisions/").concat(revId, "?alt=media")
          })));

          if (rev.expire > Date.now()) {
            // failed, delete the lock
            yield revDelete(lock.id, headRevisionId);
            throw new RequestError("failed to acquire lock", null, "EEXIST");
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
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = result.files[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              const file = _step.value;
              fileMetaCache.set(file.name, file);
            }
          } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion && _iterator.return != null) {
                _iterator.return();
              }
            } finally {
              if (_didIteratorError) {
                throw _iteratorError;
              }
            }
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



  var index = /*#__PURE__*/Object.freeze({
    fsDrive: empty,
    github: createDrive,
    dropbox: createDrive$1,
    onedrive: createDrive$2,
    google: createDrive$3
  });

  exports.dbToCloud = dbToCloud;
  exports.drive = index;

  return exports;

}({}));
//# sourceMappingURL=db-to-cloud.js.map
