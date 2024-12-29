import {UCD} from '@/js/consts';
import {$create} from '@/js/dom';
import {animateElement} from '@/js/dom-util';
import {formatDate, formatRelativeDate} from '@/js/localization';
import {CHROME} from '@/js/ua';
import {debounce, t} from '@/js/util';
import InjectionOrder from './injection-order';
import * as router from './router';
import UpdateHistory from './updater-ui';
import {installed} from './util';
import './events';
import './import-export';
import './incremental-search';

installed.on('mouseover', lazyAddEntryTitle, {passive: true});
installed.on('mouseout', lazyAddEntryTitle, {passive: true});

router.makeToggle('#manage-options-button, #sync-styles', 'stylus-options', toggleEmbeddedOptions);
router.makeToggle('#injection-order-button', 'injection-order', InjectionOrder);
router.makeToggle('#update-history-button', 'update-history', UpdateHistory);
router.update();

if (!__.MV3 && __.BUILD !== 'firefox' && CHROME >= 80 && CHROME <= 88) {
  // Wrong checkboxes are randomly checked after going back in history, https://crbug.com/1138598
  window.on('pagehide', () => {
    $$('input[type=checkbox]').forEach((el, i) => (el.name = `bug${i}`));
  });
}

function addEntryTitle(link) {
  const style = link.closest('.entry').styleMeta;
  const {installDate: dIns, updateDate: dUpd, [UCD]: ucd} = style;
  link.title = [
    dUpd || dIns ? `${formatRelativeDate(dUpd || dIns)}` : '',
    `${t('dateInstalled')}: ${formatDate(dIns, true) || '—'}`,
    `${t('dateUpdated')}: ${formatDate(dUpd, true) || '—'}`,
    ucd ? `UserCSS, v.${ucd.version}` : '',
  ].filter(Boolean).join('\n');
}

function lazyAddEntryTitle({type, target}) {
  const cell = target.closest('h2.style-name, [data-type=age]');
  if (cell) {
    const link = cell.$('.style-name-link') || cell;
    if (type === 'mouseover' && !link.title) {
      debounce(addEntryTitle, 50, link);
    } else {
      debounce.unregister(addEntryTitle);
    }
  }
}

async function toggleEmbeddedOptions(show, el, selector, toggler) {
  document.title = t(show ? 'optionsHeading' : 'styleManager');
  // TODO: use messageBox() or a dockable sidepanel or the chrome.sidePanel API
  if (show) {
    el = $root.appendChild($create('iframe' + selector));
    el.focus();
    // Chrome bug workaround. TODO: use `src` on the element when minimum_chrome_version>79
    el.contentWindow.location = '/options.html#' + toggler.id;
    await new Promise(resolve => (window.closeOptions = resolve));
  } else {
    await animateElement(el, 'fadeout');
    el.remove();
  }
}
