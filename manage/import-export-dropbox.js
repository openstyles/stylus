'use strict';

const DROPBOX_RECEIVER_HTML = '/dropbox-oauth.html';
const DROPBOX_API_KEY = '';
const FILENAME = 'stylus.json';
const API_ERROR_STATUS_FILE_NOT_FOUND = 409;
const HTTP_STATUS_CANCEL = 499;

/**
  * this was the only way that worked in keeping a value from page to page with location.href (oauth return)
  * tried localStorage, but didn't work :/
 */
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
  return client.filesUpload({path: '/' + FILENAME, contents: stylesText});
}

$('#sync-dropbox-export').onclick = () => {

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

    return client.filesDownload({path: '/' + FILENAME})
    .then(_ => {
      /** deletes file if user want to */
      if (!confirm(t('overwriteFileExport'))) {
        return Promise.reject({status: HTTP_STATUS_CANCEL});
      }

      return client.filesDelete({path: '/' + FILENAME});
    })
    /** file deleted with success, get styles and create a file */
    .then(_ => API.getStyles().then(styles => JSON.stringify(styles, null, '\t')))
    /** create file dropbox */
    .then(stylesText => uploadFileDropbox(client, stylesText))
    /** gives feedback to user */
    .then(_ => alert(t('exportSavedSuccess')))
    /* handle not found cases and cancel action */
    .catch(error => {
      /* saving file first time */
      if (error.status === API_ERROR_STATUS_FILE_NOT_FOUND) {

        API.getStyles()
        .then(styles => JSON.stringify(styles, null, '\t'))
        .then(stylesText => uploadFileDropbox(client, stylesText))
        .then(_ => alert(t('exportSavedSuccess')))
        .catch(err => console.error(err));

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

    return client.filesDownload({path: '/' + FILENAME})
    .then(response => {
      const fileBlob = response.fileBlob;

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
        alert(t('noFileToImport'));

        return;
      }

      console.error(error);
    });
  });
};
