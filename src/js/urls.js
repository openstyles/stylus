import {CHROME} from './ua';

/** Ends with "/" */
export const ownOrigin = chrome.runtime.getURL('');
export const installUsercss = 'install-usercss.html';
export const favicon = host => `https://icons.duckduckgo.com/ip3/${host}.ico`;
/** Chrome 61.0.3161+ doesn't run content scripts on NTP https://crrev.com/2978953002/ */
export const chromeProtectsNTP = process.env.MV3 || CHROME >= 61;
export const rxGF = /^(https:\/\/)(?:update\.)?((?:greasy|sleazy)fork\.org\/scripts\/)(\d+)[^/]*\/code\/[^/]*\.user\.css$|$/;

export const uso = 'https://userstyles.org/';
export const usoApi = 'https://gateway.userstyles.org/styles/getStyle';
export const usoJson = 'https://userstyles.org/styles/chrome/';

export const usoa = 'https://uso.kkx.one/';
export const usoaRaw = [ // The newest URL first!
  'https://cdn.jsdelivr.net/gh/uso-archive/data@flomaster/data/',
  'https://raw.githubusercontent.com/uso-archive/data/flomaster/data/',
  'https://cdn.jsdelivr.net/gh/33kk/uso-archive@flomaster/data/',
  'https://raw.githubusercontent.com/33kk/uso-archive/flomaster/data/',
];

export const usw = 'https://userstyles.world/';

export const extractUsoaId = url =>
  url &&
  usoaRaw.some(u => url.startsWith(u)) &&
  +url.match(/\/(\d+)\.user\.css|$/)[1];

export const extractUswId = url =>
  url &&
  url.startsWith(usw) &&
  +url.match(/\/(\d+)\.user\.css|$/)[1];

export const makeInstallUrl = (url, id) =>
  url === 'usoa' || !id && (id = extractUsoaId(url)) ? `${usoa}style/${id}` :
    url === 'usw' || !id && (id = extractUswId(url)) ? `${usw}style/${id}` :
      url === 'gf' || !id && (id = rxGF.exec(url)) ? id[1] + id[2] + id[3] :
        '';

export const makeUpdateUrl = (url, id) =>
  url === 'usoa' || !id && (id = extractUsoaId(url))
    ? `${usoaRaw[0]}usercss/${id}.user.css` :
  url === 'usw' || !id && (id = extractUswId(url))
    ? `${usw}api/style/${id}.user.css` :
      '';

export const supported = RegExp.prototype.test.bind(new RegExp(
  `^(?:(?:ht|f)tps?:|file:|${ownOrigin}${
    !process.env.MV3 && CHROME && !chromeProtectsNTP ? '|chrome://newtab/' : ''
  })`
));

export const isLocalhost = url => /^file:|^https?:\/\/([^/]+@)?(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
