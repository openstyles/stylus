'use strict';

const manifest = chrome.runtime.getManifest();
const allowedOrigins = [
  'https://openusercss.org',
  'https://openusercss.com'
];

const askHandshake = () => {
  // Tell the page that we exist and that it should send the handshake
  allowedOrigins.forEach(origin => {
    window.postMessage({
      'type': 'ouc-begin-handshake'
    }, origin);
  });
};

// Listen for queries by the site and respond with a callback object
const sendInstalledCallback = styleData => {
  allowedOrigins.forEach(origin => {
    window.postMessage({
      'type':  'ouc-is-installed-response',
      'style': styleData
    }, origin);
  });
};

const attachInstalledListeners = () => {
  window.addEventListener('message', event => {
    if (
      event.data
      && event.data.type === 'ouc-is-installed'
      && allowedOrigins.includes(event.origin)
    ) {
      chrome.runtime.sendMessage({
        'method':    'findUsercss',
        'name':      event.data.name,
        'namespace': event.data.namespace
      }, style => {
        if (style) {
          sendInstalledCallback({
            'installed': true,
            'enabled':   style.enabled,
            'name':      event.data.name,
            'namespace': event.data.namespace
          });
        } else {
          sendInstalledCallback({
            'installed': false,
            'name':      event.data.name,
            'namespace': event.data.namespace
          });
        }
      });
    }
  });
};

const doHandshake = () => {
  // This is a representation of features that Stylus is capable of
  const implementedFeatures = [
    'install-usercss',
    'event:install-usercss',
    'event:is-installed',
    'configure-after-install',
    'builtin-editor',
    'create-usercss',
    'edit-usercss',
    'import-moz-export',
    'export-moz-export',
    'update-manual',
    'update-auto',
    'export-json-backups',
    'import-json-backups',
    'manage-local'
  ];
  const reportedFeatures = [];

  // The handshake question includes a list of required and optional features
  // we match them with features we have implemented, and build a union array.
  event.data.featuresList.required.forEach(feature => {
    if (implementedFeatures.includes(feature)) {
      reportedFeatures.push(feature);
    }
  });

  event.data.featuresList.optional.forEach(feature => {
    if (implementedFeatures.includes(feature)) {
      reportedFeatures.push(feature);
    }
  });

  // We send the handshake response, which includes the key we got, plus some
  // additional metadata
  allowedOrigins.forEach(origin => {
    window.postMessage({
      'type':      'ouc-handshake-response',
      'key':       event.data.key,
      'extension': {
        'name':         manifest.name,
        'capabilities': reportedFeatures
      }
    }, origin);
  });
};

const attachHandshakeListeners = () => {
  // Wait for the handshake request, then start it
  window.addEventListener('message', event => {
    if (
      event.data
      && event.data.type === 'ouc-handshake-question'
      && allowedOrigins.includes(event.origin)
    ) {
      doHandshake();
    }
  });
};

const sendInstallCallback = data => {
  // Send an install callback to the site in order to let it know
  // we were able to install the theme and it may display a success message
  allowedOrigins.forEach(origin => {
    window.postMessage({
      'type': 'ouc-install-callback',
      'key':  data.key
    }, origin);
  });
};

const attachInstallListeners = () => {
  // Wait for an install event, then save the theme
  window.addEventListener('message', event => {
    if (
      event.data
      && event.data.type === 'ouc-install-usercss'
      && allowedOrigins.includes(event.origin)
    ) {
      chrome.runtime.sendMessage({
        'method':     'saveUsercss',
        'reason':     'install',
        'name':       event.data.title,
        'sourceCode': event.data.code,
      }, response => {
        sendInstallCallback({
          'enabled': response.enabled,
          'key':     event.data.key
        });
      });
    }
  });
};

(() => {
  attachHandshakeListeners();
  attachInstallListeners();
  attachInstalledListeners();
  askHandshake();
})();
