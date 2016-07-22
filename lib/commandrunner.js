'use strict';

var config    = require('./config');
var Logger    = require('./logger');
var OpsWorks  = require('./Opsworks');
var StackList = require('./StackList');
var Prompt    = require('./prompt');
var hierarchy = require('./hierarchy');

class CommandRunner {
  constructor(argv) {
    this.argv = argv;
    this.hierarchy = new hierarchy(argv);
    Logger.debug("Argv : ",this.argv);
    this.OpsWorks = new OpsWorks();

    if(argv.v) {
      Logger.transports.console.level = 'debug';
    }
  }

  /**
   * Point of entry, uses the argv of this run to determine what to do
   *
   * If a command is specified, called the associated method
   *   Ex: `stacks` calls stacks()
   * Otherwise, call runCli() to get the interactive cli
   * 
   * @return {void}
   */
  runCommand() {
    Logger.debug("Running command",this.argv);

    if(this.argv._.length > 1) {
      var err = new Error("Got more than one command : "+this.argv._.join(', '));
      Logger.error(err.message);
      throw err;
    }

    if(this.argv.command) {
      this.filters = (this.argv.f) ? this.argv.f.split(',') : [];
      return this[this.argv.command]();
    } else {
      this.filters = [];
      return this.prompt();
    }
  }

  deployments() {
    var filters = this.filters;
    Logger.debug("Getting the list of deployments");
    return this.OpsWorks.listStacks()
    .then(this.OpsWorks.fetchLayers.bind(this.OpsWorks))
    .then(function(stacks) {
      var SL = new StackList(stacks);
      filters.forEach(filter => {
        if(filter.split(':')[0] === 'layer') {
          Logger.warn("You specified a layer filter, deployments are per stack and not per layer.\nFetching deployments for stacks that match your filters.");
        }
      });
      SL.applyFilters(filters);
      return SL.stacks;
    })
    .then(this.OpsWorks.fetchDeployments.bind(this.OpsWorks))
    .then(function(stacks) {
      stacks = stacks.map(stack => { stack.layers = []; return stack; });
      return stacks;
    })
    .then(this.hierarchy.display.bind(this.hierarchy))
  }

  stacks() {
    var filters = this.filters;
    Logger.debug("Getting the list of stacks");
    return this.OpsWorks.listStacks()
    .then(this.OpsWorks.fetchLayers.bind(this.OpsWorks))
    .then(function(stacks) {
      var SL = new StackList(stacks);
      SL.applyFilters(filters);
      return SL.stacks;
    })
    .then(this.hierarchy.display.bind(this.hierarchy))
  }

  instances() {
    var self = this;
    var filters = this.filters;
    Logger.debug("Getting the list of instances");
    return this.OpsWorks.listStacks()
    .then(this.OpsWorks.fetchLayers.bind(this.OpsWorks))
    .then(function(stacks) {
      var SL = new StackList(stacks);
      SL.applyFilters(filters);
      return SL.stacks;
    })
    .then(this.OpsWorks.fetchInstances.bind(this.OpsWorks))
    .then(function(stacks) {
      if(self.argv.c) {
        return self.hierarchy.printCSV(stacks);
      } else {
        return self.hierarchy.display(stacks);
      }
    })
  }

  elbs() {
    var filters = this.filters;
    Logger.debug("Getting the list of ELBs");
    return this.OpsWorks.listStacks()
    .then(this.OpsWorks.fetchLayers.bind(this.OpsWorks))
    .then(function(stacks) {
      var SL = new StackList(stacks);
      SL.applyFilters(filters);
      return SL.stacks;
    })
    .then(this.OpsWorks.fetchElbs.bind(this.OpsWorks))
    .then(this.OpsWorks.fetchInstances.bind(this.OpsWorks))
    .then(this.OpsWorks.matchInstancesInElbs.bind(this.OpsWorks))
    .then(this.hierarchy.display.bind(this.hierarchy))
  }

  apps() {
    var filters = this.filters;
    Logger.debug("Getting the list of stacks");
    return this.OpsWorks.listStacks()
    .then(this.OpsWorks.fetchApps.bind(this.OpsWorks))
    .then(function(stacks) {
      var SL = new StackList(stacks);
      SL.applyFilters(filters);
      return SL.stacks;
    })
    .then(this.hierarchy.display.bind(this.hierarchy))
  }

  getFilteredStacks() {
    var filters = this.filters;
    Logger.debug("Getting the list of stacks");
    return this.OpsWorks.listStacks()
    .then(this.OpsWorks.fetchLayers.bind(this.OpsWorks))
    .then(function(stacks) {
      var SL = new StackList(stacks);
      SL.applyFilters(filters);
      return SL.stacks;
    });
  }

  // Commands : deploy,update,configure,setup
  update() {
    return this.getFilteredStacks()
    .then(this.askConfirmation.bind(this))
    .then(stacks => {
      return this.OpsWorks.runCommands(stacks,'update_custom_cookbooks');
    });
  }

  deploy() {
    return this.getFilteredStacks()
    .then(this.OpsWorks.fetchApps.bind(this.OpsWorks))
    .then(this.askConfirmation.bind(this))
    .then(stacks => {
      if(this.argv.u) {
        return this.OpsWorks.runCommands(stacks,'update_custom_cookbooks')
        .then(function() { return stacks; })
      } else {
        return stacks;
      }
    })
    .then(stacks => {
      return this.OpsWorks.runCommands(stacks,'deploy',this.argv.application_name);
    });
  }

  recipes() {
    var recipes = this.argv.recipes_list.split(',');
    return this.getFilteredStacks()
    .then(this.OpsWorks.fetchApps.bind(this.OpsWorks))
    .then(this.askConfirmation.bind(this))
    .then(stacks => {
      if(this.argv.u) {
        return this.OpsWorks.runCommands(stacks,'update_custom_cookbooks')
        .then(function() { return stacks; })
      } else {
        return stacks;
      }
    })
    .then(stacks => {
      return this.OpsWorks.runCommands(stacks,'execute_recipes',recipes);
    });
  }

  configure() {
    return this.getFilteredStacks()
    .then(this.askConfirmation.bind(this))
    .then(stacks => {
      if(this.argv.u) {
        return this.OpsWorks.runCommands(stacks,'update_custom_cookbooks')
        .then(function() { return stacks; })
      } else {
        return stacks;
      }
    })
    .then(stacks => {
      return this.OpsWorks.runCommands(stacks,'configure');
    });
  }

  setup() {
    return this.getFilteredStacks()
    .then(this.askConfirmation.bind(this))
    .then(stacks => {
      if(this.argv.u) {
        return this.OpsWorks.runCommands(stacks,'update_custom_cookbooks')
        .then(function() { return stacks; })
      } else {
        return stacks;
      }
    })
    .then(stacks => {
      return this.OpsWorks.runCommands(stacks,'setup');
    });
  }

  prompt() {
    var prompt = new Prompt(this);
    return prompt.start();
  }  

  askConfirmation(stacks) {
    if(this.argv.y) {
      Logger.debug("Skipping confirmation because -y was supplied");
      return stacks;
    } else {
      var prompt = new Prompt(this);
      return prompt.askConfirmation(stacks,this.argv);
    }
  }
}

module.exports = CommandRunner;
