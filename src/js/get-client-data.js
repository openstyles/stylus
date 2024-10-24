import {isCssDarkScheme} from './util';

document.write(`<script src="?${new URLSearchParams({
  clientData: '',
  cssSchemeDark: +isCssDarkScheme(),
  url: location,
})}"></script>`);
