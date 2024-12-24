import {$, $$, $create, toggleDataset} from '@/js/dom';
import {template} from '@/js/localization';
import {API, onExtension} from '@/js/msg';
import {clientData} from '@/js/prefs';
import {connected, disconnected, DRIVE_NAMES, getStatusText} from '@/js/sync-util';
import {t} from '@/js/util';

(async () => {
  let {sync: status, syncOpts} = __.MV3 ? clientData : await clientData;
  const elSync = $('.sync-options', template.body);
  const elCloud = $('.cloud-name', elSync);
  const elToggle = $('.connect', elSync);
  const elSyncNow = $('.sync-now', elSync);
  const elStatus = $('.sync-status', elSync);
  const elLogin = $('.sync-login', elSync);
  const elDriveOptions = $$('.drive-options', elSync);
  const $$driveOptions = () => $$(`[data-drive="${elCloud.value}"] [data-option]`, elSync);
  elCloud.append(
    ...Object.entries(DRIVE_NAMES).map(([id, name]) =>
      $create('option', {value: id}, name)));
  updateButtons();
  onExtension(e => {
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

  async function updateButtons() {
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
    elStatus.textContent = getStatusText(status);
    elLogin.hidden = !isConnected || status.login;
    for (const el of elDriveOptions) {
      el.hidden = el.dataset.drive !== elCloud.value;
      el.disabled = !off;
    }
    toggleDataset(elSync, 'enabled', elCloud.value !== 'none');
    syncOpts ??= await API.sync.getDriveOptions(elCloud.value);
    for (const el of $$driveOptions()) {
      el.value = syncOpts[el.dataset.option] || '';
    }
    syncOpts = null; // clearing the initial value from clientData so that next time API is called
  }
})();
