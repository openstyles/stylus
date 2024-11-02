import {isCssDarkScheme, makePropertyPopProxy} from './util';

self[process.env.CLIENT_DATA] = makePropertyPopProxy();
document.write(`<script src="?clientData&${new URLSearchParams({
  dark: +isCssDarkScheme(),
  url: location,
})}"></script>`);
