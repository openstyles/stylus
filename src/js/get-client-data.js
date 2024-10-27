import {isCssDarkScheme} from './util';

document.write(`<script src="?${new URLSearchParams({
  clientData: '',
  dark: +isCssDarkScheme(),
  url: location,
})}"></script>`);
