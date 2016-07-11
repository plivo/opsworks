var yaml_config = require('node-yaml-config');
 
var config = yaml_config.load(__dirname + '/../config/config.yml');

module.exports = config;
