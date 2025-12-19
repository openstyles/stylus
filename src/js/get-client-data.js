import {isCssDarkScheme, makePropertyPopProxy} from './util';

self[__.CLIENT_DATA] = makePropertyPopProxy({});
document.write(`<script src="?clientData&${new URLSearchParams({
  dark: +isCssDarkScheme(),
  frameId: window === top ? 0 : 1,
  url: location,
})}"></script>`);
