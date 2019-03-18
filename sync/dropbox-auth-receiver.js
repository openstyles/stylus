/* global chromeLocal */
'use strict';

window.onload = () => {
  const params = new URLSearchParams(new URL(location.href).hash.substr(1));
  /* it uses browser direct here because it supports just firefox yet */
  chromeLocal.setValue('dropbox_access_token', params.get('access_token'))
  .then(() => {
    window.location.href = window.location.origin + '/manage.html';
  });
}
