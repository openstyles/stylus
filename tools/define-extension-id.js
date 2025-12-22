'use strict';

if (!process.env.CLIENT_ID)
  process.exit(1);

const fs = require('fs');
const mj = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const isStable = mj.version.endsWith('.0');
const id = isStable
  ? 'clngdbkpkpeebahjckkjfobafhncgmne'
  : 'apmmpaebfobifelkijhaljbmpcgbjbdo';
if (!isStable) {
  mj.version = mj.version.replace(/^2\./, '3.');
  mj.name += ' (beta)';
  fs.writeFileSync('manifest.json', JSON.stringify(mj, null, 2), 'utf8');
}
fs.appendFileSync(process.env.GITHUB_ENV, `EXTENSION_ID=${id}\n`);
