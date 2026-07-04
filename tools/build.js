'use strict';

const {MV3, BUILD, DEV} = require('./util');
if (MV3 && BUILD !== 'chrome') {
  const chalk = require('chalk').default;
  console.error(chalk.red(`MV3 build is only supported for ${chalk.underline('chrome')} target`));
  process.exit(1);
}
const webpack = require('webpack');
const config = require('./webpack.config.js');
const compiler = webpack(config);

compiler[DEV ? 'watch' : 'run'](...[DEV && {
  aggregateTimeout: 500,
}, (err, stats) => {
  if (err) {
    console.error(err, ...[err.details].filter(Boolean));
    process.exit(1);
  } else {
    console.log(stats.toString({
      colors: true,
      modules: false,
      optimizationBailout: true,
    }));
  }
}].filter(Boolean));
