'use strict';

var Logger = require('./logger');
class StackList {
  constructor (stacks) {
    this.stacks = stacks;
    this.stacks.forEach((stack, i) => {
      if(stack.CustomJson)
        var stackJSON = JSON.parse(stack.CustomJson);
      else
        var stackJSON = {};

      if(!stack.layers) stack.layers = [];
      stack.layers.forEach((layer, j) => {
        var layerJSON = (layer.CustomJson) ? JSON.parse(layer.CustomJson) : {};
        this.stacks[i].layers[j].custom_json  = Object.assign({}, stackJSON,layerJSON);
        this.stacks[i].layers[j].custom_json.id = {i:i,j:j};
      });
    });

  }

  applyFilters (filters) {
    Logger.debug(`Got ${this.stacks.length} stacks, applying filters`,filters);
    var seen = {};
    filters.forEach(filter => {
      var field = filter.split(':')[0];
      if(!seen[field])
        seen[field] = true;
      else {
        throw new Error("Cannot use the same filter twice.");
      }

      this.applyFilter(filter)
    });
    Logger.debug(`Got ${this.stacks.length} stacks after filters`,filters);
    return true;
  }

  applyFilter (filter) {
    var split = filter.split(':');

    if(split.length != 2)
      throw new Error("Incorrect filter (Format: name:value)");

    var field = split[0];
    var filter = split[1];
    var Regex = new RegExp('^'+filter.replace(/[^.]?\*/g,'.*')+'$');
    Logger.debug(`Filter ${filter} turned to regex ${Regex}`);

    //Stack-level filter by default
    var layerFilter = false;
    if(field == 'stack')
      field = 'Name';
    else if(field == 'region')
      field = 'Region';
    else {
      layerFilter = true;
    }

    var tmp = [];
    this.stacks.forEach(stack => {
      if(!layerFilter && stack[field] && stack[field].match(Regex))
        tmp.push(stack);
      else if(layerFilter) {
        var layers = [];
        stack.layers.forEach(layer => {
          if(field == 'layer' && layer.Shortname.match(Regex)) {
            layers.push(layer);
          } else if(layer.custom_json && layer.custom_json[field] && layer.custom_json[field].match(Regex)) {
            // It's a custom JSON filter.
            layers.push(layer)
          }
        });
        stack.layers = layers;

        //Push stack with only matching layers.
        if(stack.layers.length > 0)
          tmp.push(stack);
      }
    });

    this.stacks = tmp;
  }
}

module.exports = StackList;
