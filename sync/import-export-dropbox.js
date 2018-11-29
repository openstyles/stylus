/* global messageBox Dropbox createZipFileFromText readZipFileFromBlob
  launchWebAuthFlow getRedirectUrlAuthFlow importFromString resolve
  $ $create t chromeLocal API getOwnTab */
'use strict';

const DROPBOX_API_KEY = 'zg52vphuapvpng9';
const FILENAME_ZIP_FILE = 'stylus.json';
const DROPBOX_FILE = 'stylus.zip';
const API_ERROR_STATUS_FILE_NOT_FOUND = 409;
const HTTP_STATUS_CANCEL = 499;

function messageProgressBar(data) {
  return messageBox({
    title: `${data.title}`,
    className: 'config-dialog',
    contents: [
      $create('p', data.text)
    ],
    buttons: [{
      textContent: t('confirmClose'),
      dataset: {cmd: 'close'},
    }],
  }).then(() => {
    document.body.style.minWidth = '';
    document.body.style.minHeight = '';
  });
}

function hasDropboxAccessToken() {
  return chromeLocal.getValue('dropbox_access_token');
}

function requestDropboxAccessToken() {
  const client = new Dropbox.Dropbox({
    clientId: DROPBOX_API_KEY,
    fetch
  });
  const authUrl = client.getAuthenticationUrl(getRedirectUrlAuthFlow());
  return launchWebAuthFlow({url: authUrl, interactive: true})
  .then(urlReturned => {
    const params = new URLSearchParams(new URL(urlReturned).hash.replace('#', ''));
    chromeLocal.setValue('dropbox_access_token', params.get('access_token'));
    return params.get('access_token');
  });
}

function uploadFileDropbox(client, stylesText) {
  return client.filesUpload({path: '/' + DROPBOX_FILE, contents: stylesText});
}

$('#sync-dropbox-export').onclick = () => {
  const mode = localStorage.installType;
  const title = t('syncDropboxStyles');
  const text = mode === 'normal' ? t('connectingDropbox') : t('connectingDropboxNotAllowed');
  messageProgressBar({title, text});
  if (mode !== 'normal') return;

  hasDropboxAccessToken()
  .then(token => token || requestDropboxAccessToken())
  .then(token => {
    const client = new Dropbox.Dropbox({
      clientId: DROPBOX_API_KEY,
      accessToken: token,
      fetch
    });
    return client.filesDownload({path: '/' + DROPBOX_FILE})
    .then(() => messageBox.confirm(t('overwriteFileExport')))
    .then(ok => {
      // deletes file if user want to
      if (!ok) {
        return Promise.reject({status: HTTP_STATUS_CANCEL});
      }
      return client.filesDelete({path: '/' + DROPBOX_FILE});
    })
    // file deleted with success, get styles and create a file
    .then(() => {
      messageProgressBar({title: title, text: t('gettingStyles')});
      return API.getAllStyles().then(styles => JSON.stringify(styles, null, '\t'));
    })
    // create zip file
    .then(stylesText => {
      messageProgressBar({title: title, text: t('zipStyles')});
      return createZipFileFromText(FILENAME_ZIP_FILE, stylesText);
    })
    // create file dropbox
    .then(zipedText => {
      messageProgressBar({title: title, text: t('uploadingFile')});
      return uploadFileDropbox(client, zipedText);
    })
    // gives feedback to user
    .then(() => messageProgressBar({title: title, text: t('exportSavedSuccess')}))
    // handle not found cases and cancel action
    .catch(error => {
      console.log(error);
      // saving file first time
      if (error.status === API_ERROR_STATUS_FILE_NOT_FOUND) {
        API.getAllStyles()
        .then(styles => {
          messageProgressBar({title: title, text: t('gettingStyles')});
          return JSON.stringify(styles, null, '\t');
        })
        .then(stylesText => {
          messageProgressBar({title: title, text: t('zipStyles')});
          return createZipFileFromText(FILENAME_ZIP_FILE, stylesText);
        })
        .then(zipedText => {
          messageProgressBar({title: title, text: t('uploadingFile')});
          return uploadFileDropbox(client, zipedText);
        })
        .then(() => messageProgressBar({title: title, text: t('exportSavedSuccess')}))
        .catch(err => messageBox.alert(err));
        return;
      }

      // user cancelled the flow
      if (error.status === HTTP_STATUS_CANCEL) {
        return;
      }

      console.error(error);
    });
  });
};

$('#sync-dropbox-import').onclick = () => {
  const mode = localStorage.installType;
  const title = t('retrieveDropboxSync');
  const text = mode === 'normal' ? t('connectingDropbox') : t('connectingDropboxNotAllowed');
  messageProgressBar({title, text});
  if (mode !== 'normal') return;

  hasDropboxAccessToken()
  .then(token => token || requestDropboxAccessToken())
  .then(token => {
    const client = new Dropbox.Dropbox({
      clientId: DROPBOX_API_KEY,
      accessToken: token,
      fetch
    });
    return client.filesDownload({path: '/' + DROPBOX_FILE})
    .then(response => {
      messageProgressBar({title: title, text: t('unzipStyles')});
      return readZipFileFromBlob(response.fileBlob);
    })
    .then(zipedFileBlob => {
      messageProgressBar({title: title, text: t('readingStyles')});
      document.body.style.cursor = 'wait';
      const fReader = new FileReader();
      fReader.onloadend = event => {
        const text = event.target.result;
        const maybeUsercss = !/^[\s\r\n]*\[/.test(text) &&
          (text.includes('==UserStyle==') || /==UserStyle==/i.test(text));
        (!maybeUsercss ?
          importFromString(text) :
          getOwnTab().then(tab => {
            tab.url = URL.createObjectURL(new Blob([text], {type: 'text/css'}));
            return API.openUsercssInstallPage({direct: true, tab})
              .then(() => URL.revokeObjectURL(tab.url));
          })
        ).then(numStyles => {
          document.body.style.cursor = '';
          resolve(numStyles);
        });
      };
      fReader.readAsText(zipedFileBlob, 'utf-8');
    })
    .catch(error => {
      // no file
      if (error.status === API_ERROR_STATUS_FILE_NOT_FOUND) {
        messageBox.alert(t('noFileToImport'));
        return;
      }
      messageBox.alert(error);
    });
  });
};
