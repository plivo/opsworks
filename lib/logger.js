var winston = require('winston');
var config  = require('./config');

var logger = module.exports = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      colorize: 'all',
      level: config.verbosity
    }),
    new (winston.transports.File)({
      filename: config.logfile,
      level: 'debug',
      json: false,
      options: {flags: 'w'}
    })
  ]
});
