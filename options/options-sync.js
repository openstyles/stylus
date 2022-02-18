/* global API msg */// msg.js
/* global t */// localization.js
/* global $ $$ toggleDataset waitForSelector */// dom.js
/* global capitalize */// toolbox.js
'use strict';

Promise.all([
  API.sync.getStatus(),
  waitForSelector('.sync-options'),
]).then(([status, elSync]) => {
  const elCloud = $('.cloud-name', elSync);
  const elToggle = $('.connect', elSync);
  const elSyncNow = $('.sync-now', elSync);
  const elStatus = $('.sync-status', elSync);
  const elLogin = $('.sync-login', elSync);
  const elDriveOptions = $$('.drive-options', elSync);
  updateButtons();
  msg.onExtension(e => {
    if (e.method === 'syncStatusUpdate') {
      setStatus(e.status);
    }
  });
  elCloud.on('change', updateButtons);
  elToggle.onclick = async () => {
    if (elToggle.dataset.cmd === 'start') {
      await API.sync.setDriveOptions(elCloud.value, getDriveOptions());
      await API.sync.start(elCloud.value);
    } else {
      await API.sync.stop();
    }
  };
  elSyncNow.onclick = API.sync.syncNow;
  elLogin.onclick = async () => {
    await API.sync.login();
    await API.sync.syncNow();
  };

  function getDriveOptions() {
    const result = {};
    for (const el of $$(`[data-drive=${elCloud.value}] [data-option]`)) {
      result[el.dataset.option] = el.value;
    }
    return result;
  }

  function setDriveOptions(options) {
    for (const el of $$(`[data-drive=${elCloud.value}] [data-option]`)) {
      el.value = options[el.dataset.option] || '';
    }
  }

  function setStatus(newStatus) {
    status = newStatus;
    updateButtons();
  }

  async function updateButtons() {
    const {state, STATES} = status;
    const isConnected = state === STATES.connected;
    const off = state === STATES.disconnected;
    if (status.currentDriveName) {
      elCloud.value = status.currentDriveName;
    }
    elCloud.disabled = !off;
    elToggle.disabled = status.syncing;
    elToggle.textContent = t(`optionsSync${off ? 'Connect' : 'Disconnect'}`);
    elToggle.dataset.cmd = off ? 'start' : 'stop';
    elSyncNow.disabled = !isConnected || status.syncing || !status.login;
    elStatus.textContent = getStatusText();
    elLogin.hidden = !isConnected || status.login;
    for (const el of elDriveOptions) {
      el.hidden = el.dataset.drive !== elCloud.value;
      el.disabled = !off;
    }
    toggleDataset(elSync, 'enabled', elCloud.value !== 'none');
    setDriveOptions(await API.sync.getDriveOptions(elCloud.value));
  }

  function getStatusText() {
    if (status.syncing) {
      const {phase, loaded, total} = status.progress || {};
      return phase
        ? t(`optionsSyncStatus${capitalize(phase)}`, [loaded + 1, total], false) ||
          `${phase} ${loaded} / ${total}`
        : t('optionsSyncStatusSyncing');
    }
    const {state, errorMessage, STATES} = status;
    if (errorMessage && (state === STATES.connected || state === STATES.disconnected)) {
      return errorMessage;
    }
    if (state === STATES.connected && !status.login) {
      return t('optionsSyncStatusRelogin');
    }
    return t(`optionsSyncStatus${capitalize(state)}`, null, false) || state;
  }
});
