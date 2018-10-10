/* global API */
'use strict';

(() => {
  const manifest = chrome.runtime.getManifest();
  const allowedOrigins = [
    'https://openusercss.org',
    'https://openusercss.com'
  ];

  const sendPostMessage = message => {
    if (allowedOrigins.includes(location.origin)) {
      window.postMessage(message, location.origin);
    }
  };

  const askHandshake = () => {
    // Tell the page that we exist and that it should send the handshake
    sendPostMessage({
      type: 'ouc-begin-handshake'
    });
  };

  // Listen for queries by the site and respond with a callback object
  const sendInstalledCallback = styleData => {
    sendPostMessage({
      type: 'ouc-is-installed-response',
      style: styleData
    });
  };

  const installedHandler = event => {
    if (event.data
    && event.data.type === 'ouc-is-installed'
    && allowedOrigins.includes(event.origin)
    ) {
      API.findUsercss({
        name: event.data.name,
        namespace: event.data.namespace
      }).then(style => {
        const data = {event};
        const callbackObject = {
          installed: Boolean(style),
          enabled: style.enabled,
          name: data.name,
          namespace: data.namespace
        };

        sendInstalledCallback(callbackObject);
      });
    }
  };

  const attachInstalledListeners = () => {
    window.addEventListener('message', installedHandler);
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
    sendPostMessage({
      type: 'ouc-handshake-response',
      key: event.data.key,
      extension: {
        name: manifest.name,
        capabilities: reportedFeatures
      }
    });
  };

  const handshakeHandler = event => {
    if (event.data
    && event.data.type === 'ouc-handshake-question'
    && allowedOrigins.includes(event.origin)
    ) {
      doHandshake();
    }
  };

  const attachHandshakeListeners = () => {
    // Wait for the handshake request, then start it
    window.addEventListener('message', handshakeHandler);
  };

  const sendInstallCallback = data => {
    // Send an install callback to the site in order to let it know
    // we were able to install the theme and it may display a success message
    sendPostMessage({
      type: 'ouc-install-callback',
      key: data.key
    });
  };

  const installHandler = event => {
    if (event.data
    && event.data.type === 'ouc-install-usercss'
    && allowedOrigins.includes(event.origin)
    ) {
      API.installUsercss({
        name: event.data.title,
        sourceCode: event.data.code,
      }).then(style => {
        sendInstallCallback({
          enabled: style.enabled,
          key: event.data.key
        });
      });
    }
  };

  const attachInstallListeners = () => {
    // Wait for an install event, then save the theme
    window.addEventListener('message', installHandler);
  };

  const orphanCheck = () => {
    const eventName = chrome.runtime.id + '-install-hook-openusercss';
    const orphanCheckRequest = () => {
      // If we can't get the UI language, it means we are orphaned, and should
      // remove our event handlers
      if (chrome.i18n && chrome.i18n.getUILanguage()) return true;

      window.removeEventListener('message', installHandler);
      window.removeEventListener('message', handshakeHandler);
      window.removeEventListener('message', installedHandler);
      window.removeEventListener(eventName, orphanCheckRequest, true);
    };

    // Send the event before we listen for it, for other possible
    // running instances of the content script.
    dispatchEvent(new Event(eventName));
    addEventListener(eventName, orphanCheckRequest, true);
  };

  orphanCheck();

  attachHandshakeListeners();
  attachInstallListeners();
  attachInstalledListeners();
  askHandshake();
})();
