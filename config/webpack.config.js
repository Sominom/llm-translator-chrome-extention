'use strict';

const { merge } = require('webpack-merge');

const common = require('./webpack.common.js');
const PATHS = require('./paths');

const config = (env, argv) =>
  merge(common, {
    entry: {
      background: PATHS.src + '/js/background.js',
      sidepanel: PATHS.src + '/js/sidepanel.js',
      api: PATHS.src + '/js/api.js',
      tooltip: PATHS.src + '/js/tooltip.js',
      welcome: PATHS.src + '/js/welcome.js',
    },
    devtool: argv.mode === 'production' ? false : 'source-map',
  });

module.exports = config;
