import * as chromeSync from '@/js/chrome-sync';
import {IMPORT_THROTTLE, kAppJson, kStyleIdPrefix, UCD} from '@/js/consts';
import {$create} from '@/js/dom';
import {animateElement, messageBox, scrollElementIntoView} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {styleJSONseemsValid, styleSectionsEqual} from '@/js/sections-util';
import {MOBILE} from '@/js/ua';
import {clipString, deepEqual, hasOwn, isEmptyObj, RX_META, t} from '@/js/util';
import {queue} from './util';

Object.assign($id('export'), {
  onclick: exportToFile,
  oncontextmenu: exportToFile,
}).on('split-btn', exportToFile);
$id('import').onclick = () => importFromFile();

Object.assign(document.body, {
  ondragover(event) {
    const hasFiles = event.dataTransfer.types.includes('Files');
    event.dataTransfer.dropEffect = hasFiles || event.target.type === 'search' ? 'copy' : 'none';
    this.classList.toggle('dropzone', hasFiles);
    if (hasFiles) {
      event.preventDefault();
      this.classList.remove('fadeout');
    }
  },
  ondragend() {
    animateElement(this, 'fadeout', 'dropzone');
  },
  ondragleave(event) {
    try {
      // in Firefox event.target could be XUL browser and hence there is no permission to access it
      if (event.target === this) {
        this.ondragend();
      }
    } catch {
      this.ondragend();
    }
  },
  ondrop(event) {
    if (event.dataTransfer.files.length) {
      event.preventDefault();
      const elOnly = $('#only-updates input');
      if (elOnly?.checked) elOnly.click();
      importFromFile(event.dataTransfer.files[0]);
    }
    /* Run import first for a while, then run fadeout which is very CPU-intensive in Chrome */
    setTimeout(() => this.ondragend(), 250);
  },
});

async function importFromFile(file) {
  let resolve, reject;
  const el = $tag('input');
  const textPromise = new Promise((...args) => ([resolve, reject] = args));
  try {
    if (file) {
      readFile();
    } else {
      el.style.display = 'none';
      el.type = 'file';
      el.accept = kAppJson + (MOBILE ? ',text/plain'/*for GDrive-like apps*/ : '');
      el.acceptCharset = 'utf-8';
      document.body.appendChild(el);
      el.initialValue = el.value;
      el.onchange = readFile;
      el.click();
    }
    const text = await textPromise;
    el.remove();
    if (/^\s*\[/.test(text)) {
      await importFromString(text);
      setTimeout(() => queue.styles.clear(), IMPORT_THROTTLE * 2);
    } else if (RX_META.test(text)) {
      throw t('dragDropUsercssTabstrip');
    }
  } catch (err) {
    messageBox.alert(err.message || err);
  }
  function readFile() {
    if (!file) {
      if (el.value === el.initialValue) return resolve('');
      file = el.files[0];
    }
    if (file.size > 1e9) {
      return reject((file.size / 1e9).toFixed(1).replace('.0', '') +
        "GB backup? I don't believe you.");
    }
    const fr = new FileReader();
    fr.onloadend = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsText(file, 'utf-8');
  }
}

async function importFromString(jsonString) {
  const json = JSON.parse(jsonString);
  const oldStyles = Array.isArray(json) && json.length ? await API.styles.getAll() : [];
  const oldStylesById = new Map(oldStyles.map(style => [style.id, style]));
  const oldStylesByUuid = new Map(oldStyles.map(style => [style._id, style]));
  const oldStylesByName = new Map(oldStyles.map(style => [style.name.trim(), style]));
  const oldOrder = await API.styles.getOrder();
  const items = [];
  const GROUP = 30;
  const INFO = Symbol('info'); // for private props that shouldn't be transferred into API
  const stats = {
    options: {names: [], isOptions: true, legend: 'optionsHeading'},
    added: {names: [], ids: [], legend: 'importReportLegendAdded', dirty: true},
    unchanged: {names: [], ids: [], legend: 'importReportLegendIdentical'},
    metaAndCode: {names: [], ids: [], legend: 'importReportLegendUpdatedBoth', dirty: true},
    metaOnly: {names: [], ids: [], legend: 'importReportLegendUpdatedMeta', dirty: true},
    codeOnly: {names: [], ids: [], legend: 'importReportLegendUpdatedCode', dirty: true},
    invalid: {names: [], legend: 'importReportLegendInvalid'},
  };
  let order;
  await Promise.all(json.map(analyze));
  for (const group of items) {
    const styles = await API.styles.importMany(group);
    for (let j = 0; j < styles.length; j++) {
      const {style, err} = styles[j];
      const item = group[j];
      if (style) queue.styles.set(style.id, style);
      updateStats(style || item, item[INFO], err);
    }
  }
  // TODO: set each style's order during import on-the-fly
  await API.styles.setOrder(order);
  return done();

  function analyze(item, index) {
    if (item && !item.id && item[prefs.STORAGE_KEY]) {
      return analyzeStorage(item);
    }
    if (
      !item ||
      typeof item !== 'object' || (
        isEmptyObj(item[UCD])
          ? !styleJSONseemsValid(item)
          : typeof item.sourceCode !== 'string'
      )
    ) {
      stats.invalid.names.push(`#${index}: ${clipString(item && item.name || '')}`);
      return;
    }
    item.name = item.name.trim();
    const byId = oldStylesById.get(item.id);
    const byUuid = oldStylesByUuid.get(item._id);
    const byName = oldStylesByName.get(item.name);
    oldStylesByName.delete(item.name);
    let oldStyle = byUuid;
    if (!oldStyle && byId) {
      if (sameStyle(byId, item)) {
        oldStyle = byId;
      } else {
        delete item.id;
      }
    }
    if (!oldStyle && byName) {
      item.id = byName.id;
      oldStyle = byName;
    }
    const metaEqual = oldStyle && deepEqual(oldStyle, item, ['sections', 'sourceCode', '_rev']);
    const codeEqual = oldStyle && sameCode(oldStyle, item);
    if (metaEqual && codeEqual) {
      stats.unchanged.names.push(oldStyle.name);
      stats.unchanged.ids.push(oldStyle.id);
    } else {
      const i = items.length - 1;
      const group = items[i];
      (!group || group.length >= GROUP ? items[i + 1] = [] : group).push(item);
      item[INFO] = {oldStyle, metaEqual, codeEqual};
    }
  }

  async function analyzeStorage(storage) {
    analyzePrefs(storage[prefs.STORAGE_KEY], prefs.knownKeys, prefs.__values, true);
    delete storage[prefs.STORAGE_KEY];
    order = storage.order;
    delete storage.order;
    if (!isEmptyObj(storage)) {
      analyzePrefs(storage, Object.values(chromeSync.LZ_KEY), await chromeSync.getLZValues());
    }
  }

  function analyzePrefs(obj, validKeys, values, isPref) {
    for (const [key, val] of Object.entries(obj || {})) {
      const isValid = validKeys.includes(key);
      if (!isValid || !deepEqual(val, values[key])) {
        stats.options.names.push({name: key, val, isValid, isPref});
      }
    }
  }

  function sameCode(oldStyle, newStyle) {
    const d1 = oldStyle[UCD];
    const d2 = newStyle[UCD];
    return !d1 + !d2
      ? styleSectionsEqual(oldStyle, newStyle)
      : oldStyle.sourceCode === newStyle.sourceCode && deepEqual(d1.vars, d2.vars);
  }

  function sameStyle(oldStyle, newStyle) {
    return oldStyle.name.trim() === newStyle.name.trim() ||
      ['updateUrl', 'originalMd5', 'originalDigest']
        .some(field => oldStyle[field] && oldStyle[field] === newStyle[field]);
  }

  function updateStats(style, {oldStyle, metaEqual, codeEqual}, err) {
    if (err) {
      err = (Array.isArray(err) ? err : [err]).map(e => e.message || e).join(', ');
      stats.invalid.names.push(style.name + ' - ' + err);
      return;
    }
    if (!oldStyle) {
      stats.added.names.push(style.name);
      stats.added.ids.push(style.id);
      return;
    }
    if (!metaEqual && !codeEqual) {
      stats.metaAndCode.names.push(reportNameChange(oldStyle, style));
      stats.metaAndCode.ids.push(style.id);
      return;
    }
    if (!codeEqual) {
      stats.codeOnly.names.push(style.name);
      stats.codeOnly.ids.push(style.id);
      return;
    }
    stats.metaOnly.names.push(reportNameChange(oldStyle, style));
    stats.metaOnly.ids.push(style.id);
  }

  async function done() {
    scrollTo(0, 0);
    const entries = Object.entries(stats);
    const numChanged = entries.reduce((sum, [, val]) =>
      sum + (val.dirty ? val.names.length : 0), 0);
    const report = entries.map(renderStats).filter(Boolean);
    const {button} = await messageBox.show({
      title: t('importReportTitle'),
      className: 'center-dialog',
      contents: $create('#import', report.length ? report : t('importReportUnchanged')),
      buttons: [t('confirmClose'), numChanged && t('undo')],
      onshow: bindClick,
    });
    if (button === 1)
      undo();
  }

  function renderStats([id, {ids, names, legend, isOptions}]) {
    if (!names.length) return;
    let btn;
    if (isOptions && names.some(_ => _.isValid)) {
      btn = $create('button', t('importLabel'));
      importOptions.call(btn);
    }
    return (
      $create(`details[data-id=${id}]`, {open: isOptions}, [
        $create('summary',
          $create('b', (isOptions ? '' : names.length + ' ') + t(legend))),
        $create('small',
          names.map(ids ? listItemsWithId : isOptions ? listOptions : listItems, ids)),
        btn,
      ].filter(Boolean))
    );
  }

  function listOptions({name, isValid}) {
    const el = $tag(isValid ? 'div' : 'del');
    el.textContent = name + (isValid ? '' : ` (${t(stats.invalid.legend)})`);
    return el;
  }

  function listItems(name) {
    const el = $tag('div');
    el.textContent = name;
    return el;
  }

  /** @this stats.<item>.ids */
  function listItemsWithId(name, i) {
    const el = $tag('div');
    el.textContent = name;
    el.dataset.id = this[i];
    return el;
  }

  async function importOptions() {
    const oldStorage = await chromeSync.get();
    const lz = {};
    for (const {name, val, isValid, isPref} of stats.options.names) {
      if (isValid) {
        if (isPref) {
          prefs.set(name, val);
        } else {
          lz[name] = val;
        }
      }
    }
    chromeSync.setLZValues(lz);
    const label = this.textContent;
    this.textContent = t('undo');
    this.onclick = async () => {
      const curKeys = Object.keys(await chromeSync.get());
      const keysToRemove = curKeys.filter(k => !hasOwn(oldStorage, k));
      await chromeSync.set(oldStorage);
      await chromeSync.remove(keysToRemove);
      this.textContent = label;
      this.onclick = importOptions;
    };
    return this;
  }

  async function undo() {
    const newIds = [
      ...stats.metaAndCode.ids,
      ...stats.metaOnly.ids,
      ...stats.codeOnly.ids,
      ...stats.added.ids,
    ];
    await Promise.all(newIds.map(id => API.styles.remove(id)));
    await API.styles.importMany(newIds.map(id => oldStylesById.get(id)).filter(Boolean));
    await API.styles.setOrder(oldOrder);
    await messageBox.show({
      title: t('importReportUndoneTitle'),
      contents: newIds.length + ' ' + t('importReportUndone'),
      buttons: [t('confirmClose')],
    });
  }

  function bindClick() {
    const highlightElement = event => {
      const styleElement = $id(kStyleIdPrefix + event.target.dataset.id);
      if (styleElement) {
        scrollElementIntoView(styleElement);
        animateElement(styleElement);
      }
    };
    for (const block of $$('#message-box details')) {
      if (block.dataset.id !== 'invalid') {
        block.style.cursor = 'pointer';
        block.onclick = highlightElement;
      }
    }
  }

  function reportNameChange(oldStyle, newStyle) {
    return newStyle.name !== oldStyle.name
      ? oldStyle.name + ' —> ' + newStyle.name
      : oldStyle.name;
  }
}

/** @param {MouseEvent} e */
async function exportToFile(e) {
  e.preventDefault();
  const keepDupSections = e.type === 'contextmenu' || e.shiftKey || e.detail === 'compat';
  const data = [
    Object.assign({
      [prefs.STORAGE_KEY]: prefs.__values,
      order: await API.styles.getOrder(),
    }, await chromeSync.getLZValues()),
    ...(await API.styles.getAll()).map(cleanupStyle),
  ];
  const text = JSON.stringify(data, null, '  ');
  const type = kAppJson;
  $create('a', {
    href: URL.createObjectURL(new Blob([text], {type})),
    download: generateFileName(),
    type,
  }).dispatchEvent(new MouseEvent('click'));
  /** strip `sections`, `null` and empty objects */
  function cleanupStyle(style) {
    const copy = {};
    for (let [key, val] of Object.entries(style)) {
      if (key === 'sections'
        // Keeping dummy `sections` for compatibility with older Stylus
        // even in deduped backup so the user can resave/reconfigure the style to rebuild it.
          ? !style[UCD] || keepDupSections || (val = [{code: ''}])
          : typeof val !== 'object' || !isEmptyObj(val)) {
        copy[key] = val;
      }
    }
    return copy;
  }
  function generateFileName() {
    const today = new Date();
    const dd = ('0' + today.getDate()).substr(-2);
    const mm = ('0' + (today.getMonth() + 1)).substr(-2);
    const yyyy = today.getFullYear();
    return `stylus-${yyyy}-${mm}-${dd}.json`;
  }
}
