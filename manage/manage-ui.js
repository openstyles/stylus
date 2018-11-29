/*
global prefs $ $$ $create template tWordBreak
installed sorter filterAndAppend
*/
'use strict';

const UI = {
  ENTRY_ID_PREFIX_RAW: 'style-',
  ENTRY_ID_PREFIX: '#style-',

  TARGET_TYPES: ['domains', 'urls', 'urlPrefixes', 'regexps'],
  GET_FAVICON_URL: 'https://www.google.com/s2/favicons?domain=',
  OWN_ICON: chrome.runtime.getManifest().icons['16'],

  favicons: prefs.get('manage.newUI.favicons'),
  faviconsGray: prefs.get('manage.newUI.faviconsGray'),
  targets: prefs.get('manage.newUI.targets'),

  labels: {
    'usercss': {
      is: ({style}) => typeof style.usercssData !== 'undefined',
      text: 'usercss'
    },
    'disabled': {
      is: ({entry}) => !$('.entry-state-toggle', entry).checked,
      text: t('genericDisabledLabel')
    }
  },

  init: () => {
    $('.ext-version').textContent = `v${chrome.runtime.getManifest().version}`;

    // translate CSS manually
    document.head.appendChild($create('style', `
      .disabled h2::after {
        content: "${t('genericDisabledLabel')}";
      }
      #update-all-no-updates[data-skipped-edited="true"]::after {
        content: " ${t('updateAllCheckSucceededSomeEdited')}";
      }
      body.all-styles-hidden-by-filters::after {
        content: "${t('filteredStylesAllHidden')}";
      }
    `));
  },

  showStyles: (styles = [], matchUrlIds) => {
    const sorted = sorter.sort({
      styles: styles.map(style => ({
        style,
        name: (style.name || '').toLocaleLowerCase() + '\n' + style.name,
      })),
    });
    let index = 0;
    let firstRun = true;
    installed.dataset.total = styles.length;
    const scrollY = (history.state || {}).scrollY;
    const shouldRenderAll = scrollY > window.innerHeight || sessionStorage.justEditedStyleId;
    const renderBin = document.createDocumentFragment();
    if (scrollY) {
      renderStyles();
    } else {
      requestAnimationFrame(renderStyles);
    }

    function renderStyles() {
      const t0 = performance.now();
      let rendered = 0;
      while (
        index < sorted.length &&
        // eslint-disable-next-line no-unmodified-loop-condition
        (shouldRenderAll || ++rendered < 20 || performance.now() - t0 < 10)
      ) {
        const info = sorted[index++];
        const entry = UI.createStyleElement(info);
        if (matchUrlIds && !matchUrlIds.includes(info.style.id)) {
          entry.classList.add('not-matching');
          rendered--;
        }
        renderBin.appendChild(entry);
      }
      filterAndAppend({container: renderBin}).then(sorter.updateStripes);
      if (index < sorted.length) {
        requestAnimationFrame(renderStyles);
        if (firstRun) setTimeout(UI.getFaviconImgSrc);
        firstRun = false;
        return;
      }
      setTimeout(UI.getFaviconImgSrc);
      if (sessionStorage.justEditedStyleId) {
        UI.highlightEditedStyle();
      } else if ('scrollY' in (history.state || {})) {
        setTimeout(window.scrollTo, 0, 0, history.state.scrollY);
      }
    }
  },

  createStyleElement: ({style, name}) => {
    // query the sub-elements just once, then reuse the references
    if ((UI._parts || {}).UI !== UI.enabled) {
      const entry = template['style'];
      UI._parts = {
        UI: UI.enabled,
        entry,
        entryClassBase: entry.className,
        checker: $('.entry-state-toggle', entry) || {},
        nameLink: $('a.entry-name', entry),
        editLink: $('.entry-edit', entry) || {},
        editHrefBase: 'edit.html?id=',
        appliesTo: $('.entry-applies-to', entry),
        targets: $('.targets', entry),
        decorations: {
          urlPrefixesAfter: '*',
          regexpsBefore: '/',
          regexpsAfter: '/',
        },
      };
    }
    const parts = UI._parts;
    const configurable = style.usercssData && style.usercssData.vars && Object.keys(style.usercssData.vars).length > 0;

    parts.checker.checked = style.enabled;

    parts.nameLink.textContent = tWordBreak(style.name);
    parts.nameLink.href = parts.editLink.href = parts.editHrefBase + style.id;

    // clear the code to free up some memory
    // (note, style is already a deep copy)
    style.sourceCode = null;
    style.sections.forEach(section => (section.code = null));

    const entry = parts.entry.cloneNode(true);
    entry.id = UI.ENTRY_ID_PREFIX_RAW + style.id;
    entry.styleId = style.id;
    entry.styleNameLowerCase = name || style.name.toLocaleLowerCase();
    entry.styleMeta = style;
    entry.className = parts.entryClassBase + ' ' +
      (style.enabled ? 'enabled' : 'disabled') +
      (style.updateUrl ? ' updatable' : '') +
      (style.usercssData ? ' usercss' : '');

    $('.entry-id', entry).textContent = style.sortOrder || style.id;
    let el = $('.entry-homepage', entry);
    el.classList.toggle('invisible', !style.url);
    el.href = style.url || '';
    el.title = style.url ? `${t('externalHomepage')}: ${style.url}` : '';

    const support = style.usercssData && style.usercssData.supportURL || '';
    el = $('.entry-support', entry);
    el.classList.toggle('invisible', !support);
    el.href = support;
    el.title = support ? `${t('externalSupport')}: ${support}` : '';

    $('.entry-configure-usercss', entry).classList.toggle('invisible', !configurable);
    if (style.updateUrl) {
      $('.entry-actions', entry).appendChild(template.updaterIcons.cloneNode(true));
    }

    $('.entry-version', entry).textContent = style.usercssData && style.usercssData.version || '';

    let lastUpdate = style.updateDate ? new Date(style.updateDate) : '';
    lastUpdate = lastUpdate instanceof Date && isFinite(lastUpdate) ? lastUpdate.toISOString() : '';
    $('.entry-last-update', entry).textContent = lastUpdate.split('T')[0].replace(/-/g, '.');
    $('.entry-last-update', entry).title = lastUpdate;

    UI.createStyleTargetsElement({entry, style});
    UI.addLabels(entry);

    return entry;
  },


  createStyleTargetsElement: ({entry, style}) => {
    const parts = UI._parts;
    const entryTargets = $('.targets', entry);
    const targets = parts.targets.cloneNode(true);
    let container = targets;
    let numTargets = 0;
    const displayed = new Set();
    for (const type of UI.TARGET_TYPES) {
      for (const section of style.sections) {
        for (const targetValue of section[type] || []) {
          if (displayed.has(targetValue)) {
            continue;
          }
          displayed.add(targetValue);
          const element = template.appliesToTarget.cloneNode(true);
          if (numTargets === UI.targets) {
            container = container.appendChild(template.extraAppliesTo.cloneNode(true));
          }
          element.dataset.type = type;
          element.title =
            (parts.decorations[type + 'Before'] || '') +
            targetValue +
            (parts.decorations[type + 'After'] || '');
          container.appendChild(element);
          numTargets++;
        }
      }
    }
    if (numTargets > UI.targets) {
      $('.entry-applies-to', entry).classList.add('has-more');
    }
    if (numTargets) {
      entryTargets.parentElement.replaceChild(targets, entryTargets);
    } else if (!entry.classList.contains('global') ||
              !entryTargets.firstElementChild) {
      if (entryTargets.firstElementChild) {
        entryTargets.textContent = '';
      }
      entryTargets.appendChild(template.appliesToEverything.cloneNode(true));
    }
    entry.classList.toggle('global', !numTargets);
  },


  getFaviconImgSrc: (container = installed) => {
    if (!UI.favicons) return;
    const regexpRemoveNegativeLookAhead = /(\?!([^)]+\))|\(\?![\w(]+[^)]+[\w|)]+)/g;
    // replace extra characters & all but the first group entry "(abc|def|ghi)xyz" => abcxyz
    const regexpReplaceExtraCharacters = /[\\(]|((\|\w+)+\))/g;
    const regexpMatchRegExp = /[\w-]+[.(]+(com|org|co|net|im|io|edu|gov|biz|info|de|cn|uk|nl|eu|ru)\b/g;
    const regexpMatchDomain = /^.*?:\/\/([^/]+)/;
    for (const target of $$('.target', container)) {
      const type = target.dataset.type;
      const targetValue = target.title;
      if (!targetValue) continue;
      let favicon = '';
      if (type === 'domains') {
        favicon = UI.GET_FAVICON_URL + targetValue;
      } else if (targetValue.includes('chrome-extension:') || targetValue.includes('moz-extension:')) {
        favicon = UI.OWN_ICON;
      } else if (type === 'regexps') {
        favicon = targetValue
          .replace(regexpRemoveNegativeLookAhead, '')
          .replace(regexpReplaceExtraCharacters, '')
          .match(regexpMatchRegExp);
        favicon = favicon ? UI.GET_FAVICON_URL + favicon.shift() : '';
      } else {
        favicon = targetValue.includes('://') && targetValue.match(regexpMatchDomain);
        favicon = favicon ? UI.GET_FAVICON_URL + favicon[1] : '';
      }
      if (favicon) {
        const img = target.children[0];
        if (!img || img.localName !== 'img') {
          target.insertAdjacentElement('afterbegin', document.createElement('img'))
            .dataset.src = favicon;
        } else if ((img.dataset.src || img.src) !== favicon) {
          img.src = '';
          img.dataset.src = favicon;
        }
      }
    }
    handleEvent.loadFavicons();
  },

  highlightEditedStyle: () => {
    if (!sessionStorage.justEditedStyleId) return;
    const entry = $(UI.ENTRY_ID_PREFIX + sessionStorage.justEditedStyleId);
    delete sessionStorage.justEditedStyleId;
    if (entry) {
      animateElement(entry);
      requestAnimationFrame(() => scrollElementIntoView(entry));
    }
  },

  addLabels: entry => {
    const style = entry.styleMeta;
    const container = $('.entry-labels', entry);
    const label = document.createElement('span');
    const labels = document.createElement('span');
    labels.className = 'entry-labels';
    label.className = 'entry-label ';
    Object.keys(UI.labels).forEach(item => {
      if (UI.labels[item].is({entry, style})) {
        const newLabel = label.cloneNode(true);
        newLabel.dataset.label = item;
        newLabel.textContent = UI.labels[item].text;
        labels.appendChild(newLabel);
      }
    });
    container.replaceWith(labels);
  }
};
