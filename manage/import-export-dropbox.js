/* global messageBox */
'use strict';

const DROPBOX_API_KEY = 'uyfixgzre8v1bkg';
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
  }).then(_ => {
    document.body.style.minWidth = '';
    document.body.style.minHeight = '';
  });
}

function hasDropboxAccessToken() {
  return chromeLocal.getValue('dropbox_access_token');
}

function requestDropboxAccessToken() {
  const browserApi = typeof browser === 'undefined' ? chrome : browser;
  const client = new Dropbox.Dropbox({clientId: DROPBOX_API_KEY});
  const authUrl = client.getAuthenticationUrl(browserApi.identity.getRedirectURL());

  return browserApi.identity.launchWebAuthFlow({url: authUrl, interactive: true})
  .then(urlReturned => {
    const params = new URLSearchParams(new URL(urlReturned).hash.replace('#', '?'));

    chromeLocal.setValue('dropbox_access_token', params.get('access_token'));

    return params.get('access_token');
  });
}

function uploadFileDropbox(client, stylesText) {
  return client.filesUpload({path: '/' + DROPBOX_FILE, contents: stylesText});
}

$('#sync-dropbox-export').onclick = () => {

  messageProgressBar({title: t('bckpDropboxStyles'), text: t('connectingDropbox')});

  hasDropboxAccessToken().then(token => {
    if (typeof token === 'undefined') {
      return requestDropboxAccessToken();
    }

    return token;
  })
  .then(token => {
    const client = new Dropbox.Dropbox({
      clientId: DROPBOX_API_KEY,
      accessToken: token
    });

    return client.filesDownload({path: '/' + DROPBOX_FILE})
     .then(_ => messageBox.confirm(t('overwriteFileExport')))
    .then(ok => {
      /** deletes file if user want to */
      if (!ok) {
        return Promise.reject({status: HTTP_STATUS_CANCEL});
      }

      return client.filesDelete({path: '/' + DROPBOX_FILE});
    })
    /** file deleted with success, get styles and create a file */
    .then(_ => {
      messageProgressBar({title: t('bckpDropboxStyles'), text: t('gettingStyles') });

      return API.getStyles().then(styles => JSON.stringify(styles, null, '\t'));
    })
    /** create zip file */
    .then(stylesText => {
      messageProgressBar({title: t('bckpDropboxStyles'), text: t('compactStyles') });

      return createZipFileFromText(FILENAME_ZIP_FILE, stylesText);
    })
    /** create file dropbox */
    .then(zipedText =>{
      messageProgressBar({title: t('bckpDropboxStyles'), text: t('uploadingFile') });

      return  uploadFileDropbox(client, zipedText);
    })
    /** gives feedback to user */
    .then(_ => messageProgressBar({title: t('bckpDropboxStyles'), text: t('exportSavedSuccess') }))
    /* handle not found cases and cancel action */
    .catch(error => {
      /* saving file first time */
      if (error.status === API_ERROR_STATUS_FILE_NOT_FOUND) {

        API.getStyles()
        .then(styles => {
          messageProgressBar({title: t('bckpDropboxStyles'), text: t('gettingStyles') });

          return JSON.stringify(styles, null, '\t');
        })
        .then(stylesText => {
          messageProgressBar({title: t('bckpDropboxStyles'), text: t('compactStyles') });

          return createZipFileFromText(FILENAME_ZIP_FILE, stylesText);
        })
        .then(zipedText => {
          messageProgressBar({title: t('bckpDropboxStyles'), text: t('uploadingFile') });

          return uploadFileDropbox(client, zipedText);
        })
        .then(_ => messageProgressBar({title: t('bckpDropboxStyles'), text: t('exportSavedSuccess') }))
        .catch(err => messageBox.alert(err));

        return;
      }

      /* user cancelled the flow */
      if (error.status === HTTP_STATUS_CANCEL) {
        return;
      }

      console.error(error);
    });
  });
};

$('#sync-dropbox-import').onclick = () => {

  messageProgressBar({title: t('retrieveDropboxBckp'), text: t('connectingDropbox') });

  hasDropboxAccessToken().then(token => {
    if (typeof token === 'undefined') {
      return requestDropboxAccessToken();
    }

    return token;
  })
  .then(token => {
    const client = new Dropbox.Dropbox({
      clientId: DROPBOX_API_KEY,
      accessToken: token
    });

    return client.filesDownload({path: '/' + DROPBOX_FILE})
    .then(response => {
      messageProgressBar({title: t('retrieveDropboxBckp'), text: t('descompactStyles') });

      return readZipFileFromBlob(response.fileBlob);
    })
    .then(zipedFileBlob => {
      messageProgressBar({title: t('retrieveDropboxBckp'), text: t('readingStyles') });

      const fileBlob = zipedFileBlob;

      /* it's based on the import-export.js */
      const fReader = new FileReader();
      fReader.onloadend = event => {
        const text = event.target.result;
        const maybeUsercss = !/^[\s\r\n]*\[/.test(text) &&
          (text.includes('==UserStyle==') || /==UserStyle==/i.test(text));

        (!maybeUsercss ?
          importFromString(text) :
          getOwnTab().then(tab => {
            tab.url = URL.createObjectURL(new Blob([text], {type: 'text/css'}));
            return API.installUsercss({direct: true, tab})
              .then(() => URL.revokeObjectURL(tab.url));
          })
        );
      };
      fReader.readAsText(fileBlob, 'utf-8');
    })
    .catch(error => {
      /* no file */
      if (error.status === API_ERROR_STATUS_FILE_NOT_FOUND) {
        messageBox.alert(t('noFileToImport'));

        return;
      }

      messageBox.alert(error);
    });
  });
};
