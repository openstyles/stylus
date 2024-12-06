import dropbox from 'db-to-cloud/lib/drive/dropbox';
import onedrive from 'db-to-cloud/lib/drive/onedrive';
import google from 'db-to-cloud/lib/drive/google';
import webdav from 'db-to-cloud/lib/drive/webdav';

export const cloudDrive = {dropbox, onedrive, google, webdav: !__.MV3 && webdav};
export {dbToCloud} from 'db-to-cloud/lib/db-to-cloud';
