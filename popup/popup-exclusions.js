/*
global messageBox
global exclusions
*/
'use strict';

const popupExclusions = (() => {

  const popupWidth = '400px';

  // return matches on url ending to prevent duplicates in the exclusion list
  // e.g. http://test.com and http://test.com/* are equivalent
  // this function would return ['', '/*']
  function exclusionExists(array, value) {
    const match = [];
    ['', '*', '/', '/*'].forEach(ending => {
      if (array.includes(value + ending)) {
        match.push(ending);
      }
    });
    return match;
  }

  /* Modal in Popup.html */
  function createPopupContent(url) {
    const results = [];
    const protocol = url.match(/\w+:\/\//);
    const parts = url.replace(/(\w+:\/\/|[#?].*$)/g, '').split('/');
    const domain = parts[0].split('.');
    /*
    Domain: a.b.com
    Domain: b.com
    Prefix: https://a.b.com
    Prefix: https://a.b.com/current
    Prefix: https://a.b.com/current/page
    */
    while (parts.length > 1) {
      results.push([t('excludedPrefix'), protocol + parts.join('/')]);
      parts.pop();
    }
    while (domain.length > 1) {
      results.push([t('excludedDomain'), domain.join('.')]);
      domain.shift();
    }
    return [
      $create('h2', {textContent: t('exclusionsEditTitle')}),
      $create('select', {
        id: 'popup-exclusions',
        size: results.length,
        multiple: 'true',
        value: ''
      }, [
        ...results.reverse().map(link => $create('option', {
          value: link[1],
          title: link[1],
          textContent: `${link[0]}: ${link[1]}`
        }))
      ])
    ];
  }

  function openPopupDialog(style, tabURL) {
    const msgBox = messageBox({
      title: style.name,
      className: 'center content-left',
      contents: createPopupContent(tabURL),
      buttons: [t('confirmOK'), t('confirmCancel')],
      onshow: box => {
        const contents = box.firstElementChild;
        contents.style = `max-width: calc(${popupWidth} - 20px); max-height: none;`;
        document.body.style.minWidth = popupWidth;
        document.body.style.minHeight = popupWidth;
        const select = $('select', messageBox.element);
        const exclusions = Object.keys(style.exclusions || {});
        [...select.children].forEach(option => {
          if (exclusionExists(exclusions, option.value).length) {
            option.selected = true;
          }
        }, []);
        $('#message-box-buttons button', messageBox.element).onclick = function () {
          handlePopupSave(style, this);
        };
      }
    })
    .then(() => {
      document.body.style.minWidth = '';
      document.body.style.minHeight = '';
    });
    return msgBox;
  }

  function handlePopupSave(style, button) {
    const current = Object.keys(style.exclusions);
    const select = $('#popup-exclusions', messageBox.element);
    const all = exclusions.getMultiOptions({select});
    const selected = exclusions.getMultiOptions({select, selectedOnly: true});
    // Add exclusions
    selected.forEach(value => {
      let exists = exclusionExists(current, value);
      if (!exists.length) {
        style.exclusions[value] = exclusions.createRegExp(value);
        exists = [''];
      }
      exists.forEach(ending => {
        const index = all.indexOf(value + ending);
        if (index > -1) {
          all.splice(index, 1);
        }
      });
    });
    // Remove exclusions (unselected in popup modal)
    all.forEach(value => {
      exclusionExists(current, value).forEach(ending => {
        delete style.exclusions[value + ending];
      });
    });
    exclusions.save(style);
    messageBox.listeners.button.apply(button);
  }

  return {openPopupDialog};

})();
