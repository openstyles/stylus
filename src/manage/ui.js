import {pFavicons, pFaviconsGray, pManageNewUi, pManageNewUiTargets} from '@/js/consts';
import {$$remove, $create, $toggleClasses} from '@/js/dom';
import {getCssMediaRuleByName} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import {__values, subscribe} from '@/js/prefs';
import {renderTargetIcons} from '@/js/target-icons';
import {MEDIA_OFF, MEDIA_ON} from '@/js/themer';
import {favicon} from '@/js/urls';
import {debounce} from '@/js/util';
import {createTargetsElement, favsBusy, partEntry, showStyles} from './render';
import {installed} from './util';

const MEDIA_NAME = 'table'; // from manage-table.css
export let /**@type{boolean}*/ favicons;
export let /**@type{boolean}*/ faviconsGray;
export let /**@type{boolean}*/ tableView;
export let /**@type{number}*/ targets;
let media;
let updatePending;

/** @param {StylusClientData} [init] */
export async function render(init) {
  updatePending = null;
  const tableView_ = __values[pManageNewUi];
  const favicons_ = __values[pFavicons];
  const faviconsGray_ = __values[pFaviconsGray];
  const targets_ = __values[pManageNewUiTargets];
  const enabledChanged = tableView_ !== tableView;
  const faviconsChanged = favicons_ !== favicons;
  const faviconsGrayChanged = faviconsGray_ !== faviconsGray;
  const targetsChanged = targets_ !== targets;
  if (init) {
    subscribe([pManageNewUi, pFavicons, pFaviconsGray, pManageNewUiTargets], () => {
      // throttle to coalesce multiple changes, then call with `undefined`
      updatePending ??= Promise.resolve().then(render);
    });
  } else if (!enabledChanged && !faviconsChanged && !faviconsGrayChanged && !targetsChanged) {
    return;
  }
  tableView = tableView_;
  favicons = favicons_;
  faviconsGray = faviconsGray_;
  targets = targets_;
  media ??= getCssMediaRuleByName(MEDIA_NAME);
  if (tableView !== (media[0] === MEDIA_ON))
    media.mediaText = `${tableView ? MEDIA_ON : MEDIA_OFF},${MEDIA_NAME}`;
  $toggleClasses($root, {
    newUI: tableView,
    oldUI: !tableView,
    'has-targets': !tableView || !!targets,
  });
  let iconsMissing = favicons && !$('#links img');
  if (iconsMissing) {
    for (const /**@type{HTMLAnchorElement}*/el of $$('#links a')) {
      el.prepend($create('img', {src: favicon(el.hostname)}));
    }
  } else if (!favicons && !init) {
    $$remove('#links img');
  }
  if (init) {
    return;
  }
  if (enabledChanged || iconsMissing && !favsBusy && !partEntry) {
    installed.textContent = '';
    API.styles.getCore({sections: true, size: true}).then(showStyles);
    return;
  }
  if (targetsChanged) {
    iconsMissing = renderMissingFavs() || iconsMissing;
  }
  if (iconsMissing) {
    debounce(renderTargetIcons, 0, installed);
  }
}

function renderMissingFavs() {
  let iconsMissing;
  for (const entry of installed.children) {
    entry.$('.applies-to').classList.toggle('has-more', entry._numTargets > targets);
    if (!entry._allTargetsRendered && targets > entry.$('.targets').childElementCount) {
      createTargetsElement({entry});
      iconsMissing = true;
    } else if ((+entry.style.getPropertyValue('--num-targets') || 1e9) > targets) {
      entry.style.setProperty('--num-targets', targets);
    }
  }
  return iconsMissing;
}
