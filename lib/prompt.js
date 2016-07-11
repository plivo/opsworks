'use strict';

var config    = require('./config');
var Logger    = require('./logger');
var OpsWorks  = require('./Opsworks');
var StackList = require('./StackList');
var inquirer  = require('inquirer');

var colors    = require('colors');

class Prompt {
  constructor(CommandRunner) {
    this.CommandRunner = CommandRunner;
    this.OpsWorks = new OpsWorks();
  }

  start() {
    var self = this;

    return inquirer.prompt([
      {
        type: 'list',
        name: 'command',
        message: 'What do you want to do?',
        choices: [
          {name: 'List stacks', value: 'stacks'},
          {name: 'List instances', value: 'instances'},
          {name: 'Inspect ELBs', value: 'elbs'},
          {name: 'Update cookbooks', value: 'update_custom_cookbooks'},
          {name: 'Deploy code', value: 'deploy'},
          {name: 'Run Configure', value: 'configure'},
          {name: 'Run Setup', value: 'setup'}
        ]
      }
    ]).then(function (answer) {
      switch(answer.command) {
        case 'stacks':
        return self.CommandRunner.stacks();

        case 'instances':
        return self.pickStack(answer)
        .then(answers => {
          self.CommandRunner.argv.command = 'instances';
          self.CommandRunner.filters = [`stack:${answers.stack.Name}`];
          return self.CommandRunner.instances();
        });

        case 'elbs':
        return self.pickStack(answer)
        .then(answers => {
          self.CommandRunner.argv.command = 'elbs';
          self.CommandRunner.filters = [`stack:${answers.stack.Name}`];
          return self.CommandRunner.elbs();
        });

        case 'deploy':
        return self.pickStack(answer)
        .then(self.pickApp.bind(self))
        .then(self.pickLayers.bind(self))
        .then(answers => {
          return self.OpsWorks.runCommands([answers.stack],answers.command,answers.app);
        });

        default:
        return self.pickStack(answer)
        .then(self.pickLayers.bind(self))
        .then(answers => {
          var filteredLayers = [];
          var stack = answers.stack;

          stack.layers.forEach(layer => {
            if(answers.layers.indexOf(layer.Shortname) >= 0)
              filteredLayers.push(layer);
          });

          stack.layers = filteredLayers;
          return self.askConfirmation([stack],{command: answers.command})
          .then(function(stacks) {
            return self.OpsWorks.runCommands(stacks,answers.command);
          });
        });
      }
    });
  }

  askConfirmation(stacks,argv) {
    var targets = [];
    stacks.forEach(stack => {
      var layers = [];
      stack.layers.forEach(layer => {
        layers.push(layer.Shortname);
      });
      targets.push(`${stack.Name.green}:${layers.join(', ')}`);
    });

    var commands = [];
    if(argv.u) {
      commands.push("update")
    }

    commands.push(argv.command);

    console.log(`/!\\ Running ${commands.join(', ').red} on stacks /!\\`.bold);
    console.log(targets.join("\n"),"\n");

    return inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Confirm the command?'
      }
    ]).then(function(answers) {
      if(!answers.confirm)
        throw new Error("Command aborted");
      else
        return stacks;
    });
  }

  pickStack(answers) {
    return this.OpsWorks.listStacks()
    .then(stacks => {
      var choices = [];
      stacks.forEach(stack => choices.push({
        name: stack.Name,
        value: stack
      }));

      return inquirer.prompt([
      {
        type: 'list',
        name: 'stack',
        message: 'On which stack?',
        choices: choices
      }])
      .then(answer => {
        answers.stack = answer.stack;
        return answers;
      });
    });
  }

  pickApp(answers) {
    return this.OpsWorks.fetchAppsForStack(answers.stack)
    .then(this.OpsWorks.fetchLayers.bind(this.OpsWorks))
    .then(stack => {
      answers.stack = stack;

      var choices = [];
      stack.apps.forEach(app => choices.push({
        name: app.Name,
        value: app.Shortname
      }));

      if(choices.length == 0)
        throw new Error(`The stack ${stack.Name} has no App attached to it.`);

      return inquirer.prompt([
      {
        type: 'list',
        name: 'app',
        message: 'Deploy which app?',
        choices: choices
      }])
      .then(answer => {
        answers.app = answer.app;
        return answers;
      });
    });
  }

  pickLayers(answers) {
    return this.OpsWorks.fetchLayers(answers.stack)
    .then(stack => {
      var choices = [];
      stack.layers.forEach(layer => choices.push({
        name: layer.Name,
        value: layer.Shortname
      }));

      return inquirer.prompt([{
        type: 'checkbox',
        message: 'Select layers',
        pageSize: 102,
        name: 'layers',
        choices: choices,
        validate: function (answer) {
          if (answer.length < 1) {
            return 'You must choose at least one layer.';
          }
          return true;
        }
      }]).then(function(answer) {
        answers.layers = answer.layers;
        return answers;
      });
    });
  }
}

module.exports = Prompt;
