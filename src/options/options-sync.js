import {kNone, pSync} from '@/js/consts';
import {$create, $toggleDataset} from '@/js/dom';
import {onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import {swController} from '@/js/msg-init';
import {clientData, set as prefsSet} from '@/js/prefs';
import {connected, disconnected, DRIVE_NAMES, getStatusText} from '@/js/sync-util';
import {t} from '@/js/util';

(async () => {
  let {sync: status, syncOpts} = __.MV3 && swController ? clientData : await clientData;
  const elSync = $('.sync-options');
  const elCloud = elSync.$('.cloud-name');
  const elToggle = elSync.$('.connect');
  const elSyncNow = elSync.$('.sync-now');
  const elStatus = elSync.$('.sync-status');
  const elLogin = elSync.$('.sync-login');
  const elDriveOptions = elSync.$$('.drive-options');
  const $$driveOptions = () => elSync.$$(`[data-drive="${elCloud.value}"] [data-option]`);
  elCloud.append(
    ...Object.entries(DRIVE_NAMES).map(([id, name]) =>
      $create('option', {value: id}, name)));
  updateButtons();
  onMessage.set(e => {
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
    for (const el of $$driveOptions()) {
      result[el.dataset.option] = el.value;
    }
    return result;
  }

  function setStatus(newStatus) {
    status = newStatus;
    updateButtons();
  }

  async function updateButtons(evt) {
    const state = status.state;
    const isConnected = state === connected;
    const off = state === disconnected;
    const drv = status.drive;
    if (drv) elCloud.value = drv;
    elCloud.disabled = !off;
    elToggle.disabled = status.syncing;
    elToggle.textContent = t(`optionsSync${off ? 'Connect' : 'Disconnect'}`);
    elToggle.dataset.cmd = off ? 'start' : 'stop';
    elSyncNow.disabled = !isConnected || status.syncing || !status.login;
    elStatus.textContent = getStatusText(status, true);
    elLogin.hidden = !isConnected || status.login;
    for (const el of elDriveOptions) {
      el.hidden = el.dataset.drive !== elCloud.value;
      el.disabled = !off;
    }
    $toggleDataset(elSync, 'enabled', !!drv || off && elCloud.value !== kNone);
    syncOpts ??= await API.sync.getDriveOptions(elCloud.value);
    for (const el of $$driveOptions()) {
      el.value = syncOpts[el.dataset.option] || '';
    }
    if (evt && !drv)
      prefsSet(pSync, kNone);
    syncOpts = null; // clearing the initial value from clientData so that next time API is called
  }
})();
