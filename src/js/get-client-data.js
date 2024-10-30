import {isCssDarkScheme} from './util';

window.clientData = new Proxy({}, {
  get: (obj, k, v) => ((
    (v = obj[k]),
    delete obj[k],
    v
  )),
});
document.write(`<script src="?${new URLSearchParams({
  clientData: '',
  dark: +isCssDarkScheme(),
  url: location,
})}"></script>`);
