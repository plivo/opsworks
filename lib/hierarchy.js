'use strict';

var colors    = require('colors');
var archy     = require('archy');

class Hierarchy {
  constructor(argv) {
    this.argv = argv;

    this.statusColors = {
      'booting': 'blue',
      'connection_lost': 'red',
      'online': 'green',
      'pending': 'blue',
      'rebooting': 'blue',
      'requested': 'blue',
      'running_setup': 'blue',
      'setup_failed': 'red',
      'shutting_down': 'red',
      'start_failed': 'red',
      'stop_failed': 'red',
      'stopped': 'reset',
      'stopping': 'blue',
      'terminated': 'grey',
      'terminating': 'blue'
    }
  }

     
  addInstanceToLayer(node,instance) {
    var instanceLabel = "";

    instanceLabel += `${instance.Hostname[this.statusColors[instance.Status]]}`;

    if(instance.Status !== 'online') {
      instanceLabel += ` - ${instance.Status[this.statusColors[instance.Status]]}`;
    }

    var type = instance.InstanceType || 'OnPremises' ;
    instanceLabel += ` - ${type}`;

    if(instance.PublicIp)
      instanceLabel += ` (${instance.PublicIp})`
    else if(instance.PrivateIp) {
      instanceLabel += ` (${instance.PrivateIp})`
    }

    node.nodes.push({label: instanceLabel, nodes: []});
  }

  addInstanceToELB(node,instance) {
    var instanceLabel = "";
    var details = false;

    if(instance.state.State === 'InService') {
      instanceLabel += "●".green+` ${instance.Hostname.green}`;
    } else {
      instanceLabel += "●".red+` ${instance.Hostname} - OutOfService`.red;
      details = true;
    } 

    var type = instance.InstanceType || 'OnPremises' ;
    instanceLabel += ` - ${type}`;

    if(instance.PublicIp)
      instanceLabel += ` (${instance.PublicIp})`
    else if(instance.PrivateIp) {
      instanceLabel += ` (${instance.PrivateIp})`
    }

    if(details) {
      instanceLabel += "\n"+`ReasonCode: ${instance.state.ReasonCode},`.red+"\n"+`Description: ${instance.state.Description}`.red;
    }

    node.nodes.push({label: instanceLabel, nodes: []});
  }

  printCSV(stacks) {
    stacks.forEach(stack => {
      stack.layers.forEach(layer => {
        layer.instances.forEach(instance => {
          console.log(`${stack.Name},${layer.Shortname},${instance.Hostname},${instance.Status},${instance.PublicIp || ''},${instance.PrivateIp || ''}`);
        });
      });
    });
  }

  /**
   * Displays a Hierarchy of stacks->layers->instances
   *
   * If the layers aren't attached to the Stacks object, they're omitted
   * If the instances aren't attached to the layers, they're omitted

   * @param  {object} stacks Stacks object from Opsworks.js
   * @return {void}
   */
  display(stacks) {
    var tree = {};
    tree.label = 'Stacks';
    tree.nodes = [];
    stacks.forEach(stack => {
      var stackLabel = `${stack.Name.bold.green.underline} - ${stack.Region}`;
      var stackNode = {label: stackLabel, nodes: []};

      if(!stack.apps) stack.apps = [];
      stack.apps.forEach(app => {
        var label = `${app.Shortname.green}`;
        for(var key in app.AppSource) {
          if(key == 'SshKey') continue;
          label += `\n${key}: ${app.AppSource[key]}`;
        }

        var appNode = {label: label, nodes: []};
        stackNode.nodes.push(appNode);
      });

      stack.layers.forEach(layer => {

        var layerNode = {label: layer.Shortname, nodes: []};
        stackNode.nodes.push(layerNode);
        if(!layer.instances) layer.instances = [];

        if(this.argv.command == 'instances')
          layer.instances.forEach(this.addInstanceToLayer.bind(this,layerNode));
        else if(this.argv.command == 'elbs') {
          layer.elbs.forEach(elb => {
            var elbLabel = `${elb.ElasticLoadBalancerName.magenta} - ${elb.Region}`
            var elbNode = {label: elbLabel, nodes: []};
            layerNode.nodes.push(elbNode);
            elb.instances.forEach(this.addInstanceToELB.bind(this,elbNode));
          });
        }
      });

      if(!stack.deployments) stack.deployments = [];
      var deployments = stack.deployments.slice(0,this.argv.n);
      deployments.forEach(deployment => {
        // console.log(deployment);
        var label = `${deployment.CreatedAt} - ${deployment.Command.Name.bold}`;
        var logUrl = false;

        switch(deployment.Status) {
          case 'running':
          label = label.blue;
          break;

          case 'failed':
          label = label.red;
          logUrl = `https://console.aws.amazon.com/opsworks/home?region=${stack.Region}#/stack/${stack.StackId}/deployments/${deployment.DeploymentId}`
          break;

          case 'successful':
          label = label.green;
          break;
        }

        if(logUrl) {
          label += "\n"+"Logs: ".red.bold + logUrl;
        }

        if(deployment.IamUserArn)
          label += `\nAuthor: ${deployment.IamUserArn.italic}`;
        else
          label += "\nAuthor: "+"Automatic AWS Deployment".italic;

        label += `\nStatus: ${deployment.Status}`;

        if(deployment.Duration) {
          label += `\nDuration: ${deployment.Duration}s`
        }

        if(deployment.Command.Name == 'execute_recipes') {
          var recipes = deployment.Command.Args.recipes.join(',');
          label += `\nRecipes: ${recipes}`
        }

        if(deployment.Comment) {
          label += `\nComment: ${deployment.Comment.italic}`
        }

        if(deployment.CustomJson) {
          label += `\nJSON: ${deployment.CustomJson.italic}`
        }

        var depNode = [];

        if(this.argv.i) {
          for(var i = 1; i < 5; i++) {
            if(Math.random() > 0.8) {
              depNode.push({label: `mediaserver${i}`.red.bold+' (fail)', nodes: []});
            } else
            depNode.push({label: `mediaserver${i}`.green+' (success)', nodes: []});
          }
        }
        stackNode.nodes.push({label:label, nodes: depNode});
      });

      tree.nodes.push(stackNode);
    });

    console.log(archy(tree));
  }
}

module.exports = Hierarchy;
