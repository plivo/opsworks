'use strict';

var config   = require('./../lib/config');
var Logger   = require('./../lib/logger');

Logger.transports.console.level = 'error';

var fs       = require('fs');
var sinon    = require('sinon');
require('sinon-as-promised')

var OpsWorks = require('./../lib/Opsworks');


describe("OpsWorks", function() {
  var cli;
  beforeEach(function() {
    cli = new OpsWorks();

    var stacksJSON = JSON.parse(fs.readFileSync("test/data/stacks.json").toString());
    var layersJSON = JSON.parse(fs.readFileSync("test/data/layers.json").toString());

    var stub = sinon.stub(cli,'listStacks');
    stub.resolves(stacksJSON.Stacks);

    var stub2 = sinon.stub(cli.aws,'describeLayers', function(params,callback){
      callback(null,JSON.parse(fs.readFileSync("test/data/layers.json").toString()));
    });
  });

  describe("#findStackByName", function() {
    it("Should find stack by name", function() {
      return cli.findStackByName('wordpress-production').should.be.fulfilled()
      .then(stack => {
        stack.Name.should.be.equal('wordpress-production');
      });
    });

    it("Should throw when the stack is not found", function() {
      return cli.findStackByName('wordpress-notexisting').should.be.rejectedWith(/Cannot find/);
    });
  });

  describe("#fetchLayers", function() {
    it("Should add the layers to a stack object", function() {
      return cli.findStackByName('wordpress-production')
      .then(cli.fetchLayers.bind(cli))
      .then(stack => {
        stack.layers.should.have.length(2);
      });
    });

    it("Should add the layers to multiple stacks", function() {
      return cli.listStacks()
      .then(cli.fetchLayers.bind(cli))
      .then(stacks => {
        stacks.should.have.length(3);
        for (var i = stacks.length - 1; i >= 0; i--) {
          stacks[i].layers.should.have.length(2);
        }
      });
    });
  });

  describe("#fetchInstances", function() {
    beforeEach(function() {
      var stub2 = sinon.stub(cli.aws,'describeInstances');
      stub2.callsArgWith(1,null,{Instances: [{
        InstanceId: Math.random(),
        LayerIds: ['123456789-random-id-obfuscated']
      }]});
    });

    it("Should attach the instances to the layers", function() {
      return cli.listStacks()
      .then(cli.fetchLayers.bind(cli))
      .then(cli.fetchInstances.bind(cli))
      .then(stacks => {
        stacks[0].layers.should.have.length(2);
        stacks[0].layers[0].instances.should.have.length(1);
        stacks[0].layers[1].instances.should.have.length(0);
      });
    });

    it("Should not attach instances with no matching layers", function() {
      return cli.listStacks()
      .then(cli.fetchLayers.bind(cli))
      .then(function(stacks) {
        stacks[0].layers = stacks[0].layers.slice(0,1);
        return stacks;
      })
      .then(cli.fetchInstances.bind(cli))
      .then(stacks => {
        stacks[0].layers.should.have.length(1);
        stacks[0].layers[0].instances.should.have.length(1);
      });
    });
  });

  describe("#fetchApps", function() {
    beforeEach(function() {
      var stubApps = sinon.stub(cli.aws,'describeApps', function(params,callback){
        callback(null,JSON.parse(fs.readFileSync("test/data/apps.json").toString()));
      });
    });

    it("Should attach the apps to the stack", function() {
      return cli.listStacks()
      .then(cli.fetchApps.bind(cli))
      .then(stacks => {
        stacks[0].apps.should.have.length(2);
        stacks[1].apps.should.have.length(2);
        stacks[0].apps[0].Shortname.should.be.equal('dummyapp1');
        stacks[0].apps[1].Shortname.should.be.equal('dummyapp2');
      });
    });
  });

  describe("#fetchElbs", function() {
    beforeEach(function() {
      var stubElbs = sinon.stub(cli.aws,'describeElasticLoadBalancers', function(params,callback){
        callback(null,JSON.parse(fs.readFileSync("test/data/elbs.json").toString()));
      });

      var stub2 = sinon.stub(cli.aws,'describeInstances');
      stub2.callsArgWith(1,null,{Instances: [
        {
          InstanceId: 'i-instance1',
          Ec2InstanceId: 'i-instance1',
          Name: 'instance1',
          LayerIds: ['123456789-random-id-obfuscated']
        },
        {
          InstanceId: 'i-instance2',
          Ec2InstanceId: 'i-instance2',
          Name: 'instance2',
          LayerIds: ['123456789-random-id-obfuscated']
        },
        {
          InstanceId: 'i-instance3',
          Ec2InstanceId: 'i-instance3',
          Name: 'instance3',
          LayerIds: ['123456789-random-id-obfuscated']
        },
        {
          InstanceId: 'i-instance4',
          Ec2InstanceId: 'i-instance4',
          Name: 'instance4',
          LayerIds: ['123456789-random-id-obfuscated']
        }
      ]});

      cli.fetchHealthForELB = function(ELB) {
        // var elbs = JSON.parse(fs.readFileSync("test/data/elbs.json").toString());
        // var elb = elbs.ElasticLoadBalancers[0];
        var health = JSON.parse(fs.readFileSync("test/data/healthELB.json").toString());
        ELB.InstanceStates = health.InstanceStates;
        return ELB;
      }
      // var stub3 = sinon.stub(cli,'fetchHealthForELB');
      // stub3.resolves({});
    });

    it("Should attach the Elbs to the corresponding layer", function() {
      return cli.listStacks()
      .then(cli.fetchLayers.bind(cli))
      .then(cli.fetchElbs.bind(cli))
      .then(stacks => {
        stacks[0].layers[0].elbs.should.have.length(1);
        stacks[0].layers[1].elbs.should.have.length(0);
      });
    });

    it("Should match instances to their ELBs", function() {
      return cli.listStacks()
      .then(cli.fetchLayers.bind(cli))
      .then(cli.fetchInstances.bind(cli))
      .then(cli.fetchElbs.bind(cli))
      .then(cli.matchInstancesInElbs.bind(cli))
      .then(stacks => {
        stacks[0].layers[0].elbs.should.have.length(1);
        stacks[0].layers[1].elbs.should.have.length(0);
        stacks[0].layers[0].elbs[0].instances.should.have.length(4);
      });
    });
  });

  describe("#fetchDeployments", function() {
    beforeEach(function() {
      var stubDeployment = sinon.stub(cli.aws,'describeDeployments');
      stubDeployment.callsArgWith(1,null,{Deployments: [{
        Status: 'running'
      },{
        Status: 'failed'
      }]});


    });

    it("Should attach the deployments to the stack", function() {
      return cli.listStacks()
      .then(cli.fetchDeployments.bind(cli))
      .then(stacks => {
        stacks[0].deployments.should.have.length(2);
        stacks[1].deployments.should.have.length(2);
      });
    });
  });

  describe("#runCommands / #monitorDeployment", function() {
    var clock;
    var stub2;

    beforeEach(function() {
      var stub = sinon.stub(cli.aws,'createDeployment');
      stub.onCall(0).callsArgWith(1,null,{DeploymentId: 'fake-deployment-id-0'});
      stub.onCall(1).callsArgWith(1,null,{DeploymentId: 'fake-deployment-id-1'});
      stub.onCall(2).callsArgWith(1,null,{DeploymentId: 'fake-deployment-id-2'});

      var count = 0;
      stub2 = sinon.stub(cli.aws,'describeDeployments',(params,callback) => {
        var status = (count++ == 5) ? 'successful' : 'running';
        var res = [];

        params.DeploymentIds.forEach((id,i) => {
          if(i == 1)
            status = 'successful';
          res.push({DeploymentId: id, Status: status})
        });

        callback(null,{Deployments: res});

        clock.tick(10000);
      });

      clock = sinon.useFakeTimers();
    });

    afterEach(function() {
      clock.restore();
    })

    it("Should check the deployment's status at regular intervals", function() {
      return cli.findStackByName('wordpress-production')
      .then(cli.fetchLayers.bind(cli))
      .then(stack => {
        return cli.runCommand(stack,'fake_command');
      })
      .then(id => {
        var p = cli.monitorDeployments([id]);
        return p;
      });
    });

    it("Should be able to run commands across multiple stacks", function() {
      return cli.listStacks()
      .then(cli.fetchLayers.bind(cli))
      .then(stacks => {
        var p = cli.runCommands(stacks,'fake_command');
        return p;
      })
      .then(function() {
        //describeDeployments should have been called 6 times
        stub2.callCount.should.equal(6);
      });
    });
  });
});
