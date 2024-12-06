import {isCssDarkScheme, makePropertyPopProxy} from './util';

self[__.CLIENT_DATA] = makePropertyPopProxy({});
document.write(`<script src="?clientData&${new URLSearchParams({
  dark: +isCssDarkScheme(),
  url: location,
})}"></script>`);
