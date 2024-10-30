import {isCssDarkScheme, makePropertyPopProxy} from './util';

if (/#\d+$/.test(location.hash)) { // redirected from devtools -> "open in a new tab"
  history.replaceState(history.state, '',
    `${location.href.split('#')[0]}?id=${location.hash.slice(1)}`);
}

self[process.env.CLIENT_DATA] = makePropertyPopProxy();
document.write(`<script src="?clientData&${new URLSearchParams({
  dark: +isCssDarkScheme(),
  url: location,
})}"></script>`);
