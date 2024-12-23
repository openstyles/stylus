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

export const getStatusText = status => {
  if (status.syncing) {
    const {phase, loaded, total} = status.progress || {};
    return phase
      ? t(`optionsSyncStatus${capitalize(phase)}`, [loaded + 1, total], false) ||
      `${phase} ${loaded} / ${total}`
      : t('optionsSyncStatusSyncing');
  }
  const {state, errorMessage} = status;
  if (errorMessage && (state === connected || state === disconnected)) {
    return errorMessage;
  }
  if (state === connected && !status.login) {
    return t('optionsSyncStatusRelogin');
  }
  return t(`optionsSyncStatus${capitalize(state)}`, null, false) || state;
};
