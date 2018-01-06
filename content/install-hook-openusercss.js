'use strict';

(() => {
  const manifest = chrome.runtime.getManifest();
  const allowedOrigins = [
    'https://openusercss.org',
    'https://openusercss.com'
  ];

  // Tell the page that we exist and that it should send the handshake
  allowedOrigins.forEach(origin => {
    window.postMessage({
      'type': 'ouc-begin-handshake'
    }, origin);
  });

  // Wait for the handshake
  window.addEventListener('message', event => {
    if (
      event.data
      && event.data.type === 'ouc-handshake-question'
      && allowedOrigins.includes(event.origin)
    ) {
      // This is a representation of features that Stylus is capable of
      const implementedFeatures = [
        'install-usercss',
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
    }
  });
})();
