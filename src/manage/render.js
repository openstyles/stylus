import {UCD} from '@/js/consts';
import {$, toggleDataset} from '@/js/dom';
import {animateElement, scrollElementIntoView} from '@/js/dom-util';
import {breakWord, t, template} from '@/js/localization';
import {extractUsoaId} from '@/js/urls';
import {isEmptyObj, sessionStore} from '@/js/util';
import {filterAndAppend} from './filters';
import {renderFavs} from './render';
import * as sorter from './sorter';
import {
  $entry, ENTRY_ID_PREFIX_RAW, installed, newUI, padLeft, removeStyleCode, styleToDummyEntry,
} from './util';

export * from './render-favs';

const TARGET_TYPES = ['domains', 'urls', 'urlPrefixes', 'regexps'];
const AGES = [
  [24, 'h', t('dateAbbrHour', '\x01')],
  [30, 'd', t('dateAbbrDay', '\x01')],
  [12, 'm', t('dateAbbrMonth', '\x01')],
  [Infinity, 'y', t('dateAbbrYear', '\x01')],
];
const canRenderAll = CSS.supports('content-visibility', 'auto');
const groupThousands = num => `${num}`.replace(/\d(?=(\d{3})+$)/g, '$&\xA0');
const renderSize = size => groupThousands(Math.round(size / 1024)) + 'k';
const nameLengths = new Map();
const partEditHrefBase = 'edit.html?id=';
const partDecorations = {
  urlPrefixesAfter: '*',
  regexpsBefore: '/',
  regexpsAfter: '/',
};

let numStyles = 0;
export let favsBusy;
export let partEntry;
let partChecker,
  partEditLink,
  partEntryClassBase,
  partHomepage,
  partInfoAge,
  partInfoSize,
  partInfoVer,
  partNameLink,
  partNewUI,
  partOldCheckUpdate,
  partOldConfigure,
  partTargets;

function createAgeText(el, style) {
  let val = style.updateDate || style.installDate;
  if (val) {
    val = (Date.now() - val) / 3600e3; // age in hours
    for (const [max, unit, text] of AGES) {
      const rounded = Math.round(val);
      if (rounded < max) {
        el.textContent = text.replace('\x01', rounded);
        el.dataset.value = padLeft(Math.round(rounded), 2) + unit;
        break;
      }
      val /= max;
    }
  } else if (el.firstChild) {
    el.textContent = '';
    delete el.dataset.value;
  }
}

/** Performance booster: query the sub-elements just once, then reuse the references */
function createParts(isNew) {
  partNewUI = isNew;
  partEntry = template[isNew ? 'styleNewUI' : 'style'].cloneNode(true);
  partEntryClassBase = partEntry.className;
  partChecker = $('input', partEntry) || {};
  partNameLink = $('.style-name-link', partEntry);
  partEditLink = $('.style-edit-link', partEntry) || {};
  partHomepage = $('.homepage', partEntry);
  partInfoAge = $('[data-type=age]', partEntry);
  partInfoSize = $('[data-type=size]', partEntry);
  partInfoVer = $('[data-type=version]', partEntry);
  partTargets = $('.targets', partEntry);
  partOldConfigure = !isNew && $('.configure-usercss', partEntry);
  partOldCheckUpdate = !isNew && $('.check-update', partEntry);
  return partEntry;
}

export function createStyleElement({styleMeta: style, styleNameLC: nameLC, styleSize: size}) {
  const ud = style[UCD];
  const {updateUrl} = style;
  const configurable = ud && ud.vars && !isEmptyObj(ud.vars);
  const name = style.customName || style.name;
  const isNew = newUI.cfg.enabled;
  if (isNew !== partNewUI) createParts(isNew);
  partChecker.checked = style.enabled;
  partNameLink.firstChild.textContent = breakWord(name);
  partNameLink.href = partEditLink.href = partEditHrefBase + style.id;
  partHomepage.href = partHomepage.title = style.url || '';
  partInfoVer.textContent = ud ? ud.version : '';
  partInfoVer.dataset.value = ud ? ud.version : '';
  // USO-raw and USO-archive version is a date for which we show the Age column
  toggleDataset(partInfoVer, 'isDate', ud && (style.md5Url || extractUsoaId(updateUrl)));
  createAgeText(partInfoAge, style);
  partInfoSize.dataset.value = Math.log10(size || 1) >> 0; // for CSS to target big/small styles
  partInfoSize.textContent = renderSize(size);
  partInfoSize.title = `${t('genericSize')}: ${groupThousands(size)} B`;
  if (!isNew) {
    partOldConfigure.classList.toggle('hidden', !configurable);
    partOldCheckUpdate.classList.toggle('hidden', !updateUrl);
  }
  removeStyleCode(style);
  // Now that we assigned the parts, we can clone the element
  const entry = partEntry.cloneNode(true);
  entry.id = ENTRY_ID_PREFIX_RAW + style.id;
  entry.styleId = style.id;
  entry.styleNameLC = nameLC;
  entry.styleMeta = style;
  entry.styleSize = size;
  entry.className = partEntryClassBase + ' ' +
    (style.enabled ? 'enabled' : 'disabled') +
    (updateUrl ? ' updatable' : '') +
    (ud ? ' usercss' : '');
  if (isNew && (updateUrl || configurable)) {
    $('.actions', entry).append(...[
      updateUrl && template.updaterIcons.cloneNode(true),
      configurable && template.configureIcon.cloneNode(true),
    ].filter(Boolean));
  }
  createTargetsElement({entry, style});
  return entry;
}

export function createTargetsElement({entry, expanded, style = entry.styleMeta}) {
  const isNew = newUI.cfg.enabled;
  const maxTargets = expanded ? 1000 : isNew ? newUI.cfg.targets : 10;
  if (!maxTargets) {
    entry._numTargets = 0;
    return;
  }
  const displayed = new Set();
  const entryTargets = $('.targets', entry);
  const expanderCls = $('.applies-to', entry).classList;
  const targets = partTargets.cloneNode(true);
  let container = targets;
  let el = entryTargets.firstElementChild;
  let numTargets = 0;
  let allTargetsRendered = true;
  for (const type of TARGET_TYPES) {
    for (const section of style.sections) {
      for (const targetValue of section[type] || []) {
        if (displayed.has(targetValue)) {
          continue;
        }
        if (++numTargets > maxTargets) {
          allTargetsRendered = expanded;
          break;
        }
        displayed.add(targetValue);
        const text =
          (partDecorations[type + 'Before'] || '') +
          targetValue +
          (partDecorations[type + 'After'] || '');
        if (el && el.dataset.type === type && el.lastChild.textContent === text) {
          const next = el.nextElementSibling;
          // TODO: collect all in a fragment and use a single container.append()
          container.appendChild(el);
          el = next;
          continue;
        }
        const element = template.appliesToTarget.cloneNode(true);
        if (!isNew) {
          if (numTargets === maxTargets) {
            container = container.appendChild(template.extraAppliesTo.cloneNode(true));
          } else if (numTargets > 1) {
            container.appendChild(template.appliesToSeparator.cloneNode(true));
          }
        }
        element.dataset.type = type;
        element.append(text);
        container.appendChild(element);
      }
    }
  }
  if (isNew && numTargets > newUI.cfg.targets) {
    expanderCls.add('has-more');
  }
  if (numTargets) {
    entryTargets.parentElement.replaceChild(targets, entryTargets);
  } else if (
    !entry.classList.contains('global') ||
    !entryTargets.firstElementChild
  ) {
    if (entryTargets.firstElementChild) {
      entryTargets.textContent = '';
    }
    entryTargets.appendChild(template.appliesToEverything.cloneNode(true));
  }
  entry.classList.toggle('global', !numTargets);
  entry._allTargetsRendered = allTargetsRendered;
  entry._numTargets = numTargets;
  if (isNew) entry.style.setProperty('--num-targets', Math.min(numTargets, newUI.cfg.targets));
}

function highlightEditedStyle() {
  if (!sessionStore.justEditedStyleId) return;
  const entry = $entry(sessionStore.justEditedStyleId);
  delete sessionStore.justEditedStyleId;
  if (entry) {
    animateElement(entry);
    requestAnimationFrame(() => scrollElementIntoView(entry));
  }
}

export function fitNameColumn(styles, style) {
  if (style) calcNameLenKey(style);
  styles = styles ? styles.map(calcNameLenKey) : [...nameLengths.values()];
  const pick = sorter.columns > 1 ? .8 : .95; // quotient of entries in single line
  const extras = 5; // average for optional extras like " UC ", "v1.0.0"
  const res = nameLengths.res = styles.sort()[nameLengths.size * pick | 0] + extras - 1e9;
  $.root.style.setProperty('--name-width', res + 'ch');
}

function calcNameLenKey(style) {
  const name = style.displayName || style.name || '';
  const len = 1e9 + // aligning the key for sort() which uses string comparison
    (style.enabled ? 1.05/*bold factor*/ : 1) *
    (name.length + name.replace(/[^\u3000-\uFE00]+/g, '').length/*CJK glyph is 2x wide*/) | 0;
  nameLengths.set(style.id, len);
  return len;
}

export function fitSizeColumn(entries = installed.children, entry) {
  let res = entry && renderSize(entry.styleSize).length || 0;
  if (!res) {
    for (const e of entries) res = Math.max(res, e.styleSize);
    res = renderSize(res).length;
  } else if (res <= parseInt($.root.style.getPropertyValue('--size-width'))) {
    return;
  }
  $.root.style.setProperty('--size-width', res + 'ch');
}

export function showStyles(styles = [], matchUrlIds) {
  const dummies = styles.map(styleToDummyEntry);
  const sorted = sorter.sort(dummies);
  let index = 0;
  let firstRun = true;
  const scrollY = history.state?.scrollY;
  const shouldRenderAll = scrollY > window.innerHeight
    || sessionStore.justEditedStyleId
    || canRenderAll;
  const renderBin = document.createDocumentFragment();
  favsBusy = newUI.hasFavs();
  fitNameColumn(styles);
  fitSizeColumn(dummies);
  renderStyles();
  updateTotal(styles.length);

  function renderStyles() {
    const t0 = !shouldRenderAll && performance.now();
    while (index < sorted.length && (
      shouldRenderAll ||
      (index & 7) < 7 ||
      performance.now() - t0 < 50
    )) {
      const entry = createStyleElement(sorted[index++]);
      if (matchUrlIds && !matchUrlIds.includes(entry.styleMeta.id)) {
        entry.classList.add('not-matching');
      }
      renderBin.appendChild(entry);
    }
    filterAndAppend({container: renderBin}).then(sorter.updateStripes);
    if (index < sorted.length) {
      requestAnimationFrame(renderStyles);
      if (firstRun && favsBusy) renderFavs();
      firstRun = false;
      return;
    }
    if (favsBusy) {
      renderFavs().then(() => (favsBusy = false));
    }
    if (sessionStore.justEditedStyleId) {
      setTimeout(highlightEditedStyle); // delaying to avoid forced layout
    }
  }
}

export function updateTotal(delta) {
  if (delta) numStyles += delta;
  if (+installed.dataset.total === numStyles) {
    return;
  }
  installed.dataset.total = numStyles;
  let el = $('#links-empty');
  if (numStyles && el) {
    el.remove();
  } else if (!numStyles && !el) {
    el = $('#links main').cloneNode(true);
    el.id = 'links-empty';
    installed.after(el);
  } else {
    return;
  }
  $.rootCL.toggle('empty', !numStyles);
}
