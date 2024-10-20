import {isCssDarkScheme} from '/js/util-base';

document.write(`<script src="?${new URLSearchParams({
  clientData: '',
  cssSchemeDark: +isCssDarkScheme(),
  url: location,
})}"></script>`);
