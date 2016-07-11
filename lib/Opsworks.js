'use strict';

var Logger        = require('./logger');
var AWS           = require('aws-sdk');
AWS.config.region = 'us-east-1';

class Opsworks {
  constructor() {
    this.aws = new AWS.OpsWorks();
  }

  listStacks() {
    return new Promise((resolve, reject) => {
      this.aws.describeStacks({}, function(err, data) {
        if (err) reject(err, err.stack); // an error occurred
        else     resolve(data.Stacks);           // successful response
      });
    });
  }

  runCommands(stacks,type,args) {
    if(!stacks.length)
      throw new Error("No stacks matching your filters");
    
    Logger.info(`Running command ${type} on ${stacks.length} stacks`);

    var p = [];
    var StackById = {};

    stacks.forEach(stack => { 
      StackById[stack.StackId] = stack;
      p.push(this.runCommand(stack,type,args))
    });

    return Promise.all(p)
    .then(this.monitorDeployments.bind(this))
    .catch(function(e) {
      if(e.length) {
        var deployments = e;
        var f = 0;
        deployments.forEach(d => {
          var stack = StackById[d.StackId];
          if(d.Status == 'failed') {
            var logUrl = `https://console.aws.amazon.com/opsworks/home?region=${stack.Region}#/stack/${stack.StackId}/deployments/${d.DeploymentId}`;

            Logger.error(`Deployment failed on stack ${stack.Name}, logs: ${logUrl}`);
            f++;
          }
        });

        Logger.error(`Failed deployment on ${f}/${deployments.length} stacks`);
      } else {
        if(e.message.match(/at least an instance ID/)) {
          throw new Error("No running instance match your filters");
        } else {
          throw e;
        }
      }
    })
    .then(function() {
      Logger.info("Done");
    });
  }

  runCommand(stack,type,args) {

    var layers = [];
    var layersNames = [];
    stack.layers.forEach(layer => { 
      layers.push(layer.LayerId)
      layersNames.push(layer.Shortname);
    });

    Logger.debug(`Running command ${type} on ${stack.Name}, layers : ${layersNames.join(',')}`);

    var params = {
      Command: {
        Name: type
      },
      StackId: stack.StackId,
      LayerIds: layers
    }

    Logger.debug('Params:',params);

    if(type == 'execute_recipes') {
      params.Command.Args = {recipes: args};
    } else if(type == 'deploy') {
      stack.apps.forEach(app => {
        if(app.Shortname == args) {
          params.AppId = app.AppId;
        }
      });

      if(!params.AppId) {
        throw new Error(`Could not find app ${args} on stack ${stack.Name}`);
      }
    }

    return new Promise((resolve, reject) => {
      this.aws.createDeployment(params, function(err, data) {
        Logger.debug(err,data);
        if (err) reject(err, err.stack); // an error occurred
        else {
          resolve(data.DeploymentId);
        }
      });
    });
  }

  monitorDeployments(ids) {
    Logger.debug("Monitoring deployments of ",ids);
    var interval = null;
    return new Promise((resolve, reject) => {
      Logger.info("Monitoring deployments, please be patient...");
      this.checkDeployments(ids,resolve,reject);
    })
  }

  checkDeployments(ids,resolve,reject) {
    Logger.debug("Checking deployments status");
    var self = this;
    this.aws.describeDeployments({DeploymentIds: ids}, function(err, data) {
      if (err) reject(err, err.stack); // an error occurred
      else {
        Logger.debug("Deployments : ",data);
        var Deployments = data.Deployments;

        var counts = {};
        var total = Deployments.length;

        Deployments.forEach(d => {
          if(!counts[d.Status]) counts[d.Status] = 0;
          counts[d.Status]++;
        });

        if(counts['successful'] && counts['successful'] == total) {
          resolve(Deployments);
        }
        else if(!counts['running'])
          //If no deployment is running but not all are successful => error & all done.
          reject(Deployments);
        else
          setTimeout(self.checkDeployments.bind(self,ids,resolve,reject),10000);
      }
    });
  }

  // Adds instances to each layer
  fetchInstances(stacks) {
    return Promise.all(stacks.map(this.fetchInstancesForStack.bind(this)));
  }

  fetchInstancesForStack(stack) {
    Logger.debug(`Fetching instances for ${stack.Name} - ${stack.StackId}`);
    return new Promise((resolve, reject) => {
      this.aws.describeInstances({StackId: stack.StackId}, function(err, data) {
        Logger.debug(`Found ${data.Instances.length} instances for ${stack.Name} - ${stack.StackId}`)
        if (err) reject(err, err.stack); // an error occurred
        else     resolve(data.Instances);           // successful response
      });
    }).then(function(Instances) {
      Instances.forEach(i => {
        stack.layers.forEach(layer => {
          if(!layer.instances) layer.instances = [];
          if(layer.LayerId == i.LayerIds[0]) {
            layer.instances.push(i);
          }
        });
      });

      return stack;
    });
  }

  fetchDeployments(stacks) {
    return Promise.all(stacks.map(this.fetchDeploymentsForStack.bind(this)));
  }

  fetchDeploymentsForStack(stack) {
    Logger.debug(`Fetching deployments for ${stack.Name} - ${stack.StackId}`);
    return new Promise((resolve, reject) => {
      this.aws.describeDeployments({StackId: stack.StackId}, function(err, data) {
        if (err) reject(err, err.stack); // an error occurred
        else     resolve(data.Deployments);           // successful response
      });
    }).then(function(Deployments) {
      if(!stack.deployments)
        stack.deployments = [];
      Deployments.forEach(deployment => {
        stack.deployments.push(deployment)
      });

      return stack;
    });
  }

  fetchApps(stacks) {
    return Promise.all(stacks.map(this.fetchAppsForStack.bind(this)));
  }

  fetchElbs(stacks) {
    return Promise.all(stacks.map(this.fetchElbsForStack.bind(this)));
  }

  fetchAppsForStack(stack) {
    Logger.debug(`Fetching apps for ${stack.Name} - ${stack.StackId}`);
    return new Promise((resolve, reject) => {
      this.aws.describeApps({StackId: stack.StackId}, function(err, data) {
        if (err) reject(err, err.stack); // an error occurred
        else     resolve(data.Apps);           // successful response
      });
    }).then(function(Apps) {
      if(!stack.apps)
        stack.apps = [];
      Apps.forEach(app => {
        stack.apps.push(app)
      });

      return stack;
    });
  }

  fetchHealthForELB(ELB) {
    return new Promise((resolve, reject) => {
      var awsELB = new AWS.ELB({region: ELB.Region});
      awsELB.describeInstanceHealth({LoadBalancerName: ELB.ElasticLoadBalancerName},function(err,data) {
        if (err) reject(err, err.stack);
        else {
          ELB.InstanceStates = data.InstanceStates;
          resolve(ELB);
        }
      });
    });
  }

  fetchElbsForStack(stack) {
    var self = this;
    Logger.debug(`Fetching ELBs for ${stack.Name} - ${stack.StackId}`);
    return new Promise((resolve, reject) => {
      this.aws.describeElasticLoadBalancers({StackId: stack.StackId}, function(err, data) {
        if (err) reject(err, err.stack); // an error occurred
        else     resolve(data.ElasticLoadBalancers);           // successful response
      });
    }).then(function(Elbs) {
      return Promise.all(Elbs.map(self.fetchHealthForELB.bind(self)));
    }).then(function(Elbs) {
      if(!stack.elbs)
        stack.elbs = [];

      Elbs.forEach(elb => {
        stack.elbs.push(elb)
        if(stack.layers) {
          stack.layers.forEach(layer => {
            if(!layer.elbs)
              layer.elbs = [];

            if(elb.LayerId == layer.LayerId)
              layer.elbs.push(elb);
          });
        }
      });
      return stack;
    });
  }


  fetchLayers(stack) {
    //For arrays, find layers of all stacks
    if(stack.length) {
      return Promise.all(stack.map(this.fetchLayers.bind(this)));
    }

    return new Promise((resolve, reject) => {
      this.aws.describeLayers({StackId: stack.StackId}, function(err, data) {
        if (err) reject(err, err.stack); // an error occurred
        else {
          stack.layers = data.Layers;
          resolve(stack);
        }
      });
    });
  }

  /**
   * Given a list of stacks with layers, instances and ELBs,
   * Match the instance IDs of the ELB with the "friendly" names 
   * used in the opsworks stack.
   *  
   * @param  {array} stacks
   * @return {array} stacks
   */
  matchInstancesInElbs(stacks) {
    stacks.forEach(stack => {
      stack.layers.forEach(function(layer,index) {
        if(!layer.elbs) {
          delete stack.layers[index];
          return;
        }
        layer.elbs.forEach(elb => {
          elb.instances = [];
          elb.Ec2InstanceIds.forEach(id => {
            layer.instances.forEach(instance => {
              if(instance.Ec2InstanceId == id)
              {
                elb.InstanceStates.forEach(state => {
                  if(state.InstanceId == id) {
                    instance.state = state;
                    elb.instances.push(instance);
                  }
                });
              }
            });
          })
        })

      });
    });
    return stacks;
  }

  findStackByName(name) {
    return this.listStacks().then(stacks => {
      var foundStack = null;
      stacks.forEach(stack => {
        if(stack.Name == name) {
          foundStack = stack; 
          return;
        }
      });

      if(foundStack)
        return foundStack;
      else
        throw new Error("Cannot find stack "+name);
    });
  }
}

module.exports = Opsworks;
