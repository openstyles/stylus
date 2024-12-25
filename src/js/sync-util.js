import {capitalize, t} from './util';

export const connected = 'connected';
export const connecting = 'connecting';
export const disconnected = 'disconnected';
export const disconnecting = 'disconnecting';
export const pending = 'pending';

export const DRIVE_NAMES = {
  dropbox: 'Dropbox',
  google: 'Google Drive',
  onedrive: 'OneDrive',
  webdav: 'WebDAV',
};

const getPhaseText = (phase, loaded, total) =>
  t(`optionsSyncStatus${capitalize(phase)}`, total && [loaded + 1, total], false);

export const getStatusText = (status, verbose) => {
  if (status.syncing) {
    const {phase, loaded, total} = status.progress || {};
    return phase
      ? getPhaseText(phase, loaded, total) || `${phase} ${loaded} / ${total}`
      : t('optionsSyncStatusSyncing');
  }
  const {state, errorMessage} = status;
  if (errorMessage && (state === connected || state === disconnected)) {
    return errorMessage;
  }
  if (state === connected && !status.login) {
    return t('optionsSyncStatusRelogin');
  }
  return verbose && getPhaseText(state) || state;
};
