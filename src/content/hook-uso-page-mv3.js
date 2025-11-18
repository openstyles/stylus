import hookUsoPage from './hook-uso-page';

addEventListener('stylus-uso*', e => hookUsoPage(e.detail), {once: true});
dispatchEvent(new Event('stylus-uso'));
