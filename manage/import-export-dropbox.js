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
  if (typeof browser !== 'undefined') { /* firefox */
    return browser.storage.local.get('dropbox_access_token')
    .then(item => {
      return item.dropbox_access_token;
    });
  } else { /* chrome */
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['dropbox_access_token'], result => {
        resolve(result.dropbox_access_token);
      });
    });
  }
}

function openDropboxOauthPage() {
  let client = new Dropbox.Dropbox({clientId: DROPBOX_API_KEY});
  let authUrl = client.getAuthenticationUrl(window.location.origin + DROPBOX_RECEIVER_HTML);

  window.location.href = authUrl;
}

function uploadFileDropbox(client, stylesText) {
  return client.filesUpload({path: '/' + FILENAME, contents: stylesText});
}


$('#sync-dropbox-export').onclick = async () => {
  let accessToken = await hasDropboxAccessToken();
  if (!accessToken) {
    openDropboxOauthPage();

    return;
  }

  let client = new Dropbox.Dropbox({
    clientId: DROPBOX_API_KEY,
    accessToken: accessToken
  });

  /**
   * check if the file exists, if exists, delete it before upload another
   */
  client.filesDownload({path: '/' + FILENAME})
  .then(responseGet => {
    /** deletes file if user want to */
    if (!confirm(t('overwriteFileExport'))) {
      return Promise.reject({status: HTTP_STATUS_CANCEL});
    }

    return client.filesDelete({path: '/' + FILENAME});
  })
  .then(responseDelete => {
    /** file deleted with success, get styles and create a file */
    return API.getStyles().then(styles => JSON.stringify(styles, null, '\t'))
  })
  .then(stylesText => {
    /** create file dropbox */
    return uploadFileDropbox(client, stylesText);
  })
  .then(responseSave => {
    alert(t('exportSavedSuccess'));
  })
  .catch(async error => {
    /* saving file first time */
    if (error.status === API_ERROR_STATUS_FILE_NOT_FOUND) {
      let stylesText = await API.getStyles().then(styles => JSON.stringify(styles, null, '\t'));

      uploadFileDropbox(client, stylesText)
      .then(response => {
        alert(t('exportSavedSuccess'));
      })
      .catch(err => {
        console.error(error);
      });

      return;
    }

    /* user cancelled the flow */
    if (error.status === HTTP_STATUS_CANCEL) {
      return;
    }

    console.error(error);

    return;
  });

};

$('#sync-dropbox-import').onclick = async () => {

  let accessToken = await hasDropboxAccessToken();
  if (!accessToken) {
    openDropboxOauthPage();

    return;
  }

  let client = new Dropbox.Dropbox({
    clientId: DROPBOX_API_KEY,
    accessToken: accessToken
  });

  client.filesDownload({path: '/' + FILENAME})
  .then(response => {
    let fileBlob = response.fileBlob;

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

    console.error(err);
  });

  return;
};
