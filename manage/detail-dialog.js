/* global messageBox makeLink makeAuthor */

'use strict';

function detailDialog(style) {
  const TYPE_NAME = {
    'urls': t('appliesUrlOption'),
    'urlPrefixes': t('appliesUrlPrefixOption'),
    'domains': t('appliesDomainOption'),
    'regexps': t('appliesRegexpOption')
  };

  return messageBox({
    title: style.name,
    className: 'detail-dialog',
    contents: buildContent(),
    buttons: [t('confirmClose')]
  });

  function buildContent() {
    return $element({
      className: 'detail-table',
      appendChild: [
        makeRow(t('detailName'), 'name'),
        makeRow(t('detailVersion'), 'version', true),
        makeRow(t('detailAuthor'), makeStyleAuthor()),
        makeRow(t('detailHomepageURL'), 'url'),
        makeRow(t('detailSupportURL'), 'supportURL', true),
        makeRow(t('detailUpdateURL'), 'updateUrl'),
        makeRow(t('appliesLabel'), makeAppliesTo())
      ]
    });
  }

  function makeRow(label, content, isUsercss) {
    if (typeof content === 'string') {
      if (isUsercss) {
        if (style.usercssData) {
          content = style.usercssData[content] || '';
        } else {
          content = '';
        }
      } else {
        content = style[content] || '';
      }
      if (/^http[\S]+$/.test(content)) {
        content = makeLink(content, content);
      }
    }
    return $element({className: 'meta', appendChild: [
      $element({className: 'meta-label', textContent: label}),
      $element({className: 'meta-value', appendChild: content})
    ]});
  }

  function makeStyleAuthor() {
    const author = style.author || style.usercssData && style.usercssData.author;
    if (!author) {
      return '';
    }
    return makeAuthor(author);
  }

  function makeAppliesTo() {
    return $element({
      'tag': 'ul',
      appendChild: getApplies().map(([type, value]) => $element({
        tag: 'li', textContent: `${type} - ${value}`
      }))
    });
  }

  function getApplies() {
    const result = [];
    for (const section of style.sections) {
      for (const type of ['urls', 'urlPrefixes', 'domains', 'regexps']) {
        if (section[type]) {
          result.push(...section[type].map(pattern => ([TYPE_NAME[type], pattern])));
        }
      }
    }
    return result;
  }
}
