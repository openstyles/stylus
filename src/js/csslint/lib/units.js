import Tokens, {ANGLE, FLEX, FREQUENCY, LENGTH, RESOLUTION, TIME} from './tokens';

const Units = {__proto__: null};
export const UnitTypeIds = {__proto__: null};

for (const [id, units] of [
  [ANGLE, 'deg,grad,rad,turn'],
  [FLEX, 'fr'],
  [FREQUENCY, 'hz,khz'],
  [LENGTH, 'cap,ch,em,ex,ic,lh,' +
    'rcap,rch,rem,rex,ric,rlh,' +
    'cm,mm,in,pc,pt,px,q,' +
    'cqw,cqh,cqi,cqb,cqmin,cqmax,' + // containers
    'vb,vi,vh,vw,vmin,vmax' +
    'dvb,dvi,dvh,dvw,dvmin,dvmax' +
    'lvb,lvi,lvh,lvw,lvmin,lvmax' +
    'svb,svi,svh,svw,svmin,svmax'],
  [RESOLUTION, 'dpcm,dpi,dppx,x'],
  [TIME, 'ms,s'],
]) {
  const type = Tokens[id].name.toLowerCase();
  for (const u of units.split(',')) Units[u] = type;
  UnitTypeIds[type] = id;
}

export default Units;
