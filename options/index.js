'use strict';

function restore () {
  chrome.runtime.getBackgroundPage(bg => {
    document.getElementById('badgeDisabled').value = bg.prefs.get('badgeDisabled');
    document.getElementById('badgeNormal').value = bg.prefs.get('badgeNormal');
    document.getElementById('updateInterval').value = bg.prefs.get('updateInterval');
  });
}

function save () {
  chrome.runtime.getBackgroundPage(bg => {
    bg.prefs.set('badgeDisabled', document.getElementById('badgeDisabled').value);
    bg.prefs.set('badgeNormal', document.getElementById('badgeNormal').value);
    bg.prefs.set(
      'updateInterval',
      Math.max(0, +document.getElementById('updateInterval').value)
    );
    // display notification
    let status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => status.textContent = '', 750);
  });
}

document.addEventListener('DOMContentLoaded', restore);
document.getElementById('save').addEventListener('click', save);

// actions
document.addEventListener('click', e => {
  let cmd = e.target.dataset.cmd;
  let total = 0, updated = 0;

  function update () {
    document.getElementById('update-counter').textContent = `${updated}/${total}`;
  }
  function done (target) {
    target.disabled = false;
    window.setTimeout(() => {
      document.getElementById('update-counter').textContent = '';
    }, 750);
  }

  if (cmd === 'open-manage') {
    chrome.tabs.query({
      url: chrome.runtime.getURL('manage.html')
    }, tabs => {
      if (tabs.length) {
        chrome.tabs.update(tabs[0].id, {
          active: true,
        }, () => {
          chrome.windows.update(tabs[0].windowId, {
            focused: true
          });
        });
      }
      else {
        chrome.tabs.create({
          url: chrome.runtime.getURL('manage.html')
        });
      }
    });
  }
  else if (cmd === 'check-updates') {
    e.target.disabled = true;
    chrome.runtime.getBackgroundPage(bg => {
      bg.update.perform((cmd, value) => {
        if (cmd === 'count') {
          total = value;
          if (!total) {
            done(e.target);
          }
        }
        else if (cmd === 'single-updated' || cmd === 'single-skipped') {
          updated += 1;
          if (total && updated === total) {
            done(e.target);
          }
        }
        update();
      });
    });
    // notify the automatic updater to reset the next automatic update accordingly
    chrome.runtime.sendMessage({
      method: 'resetInterval'
    });
  }
});
