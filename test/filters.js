'use strict';

var fs     = require('fs');
var StackList = require('./../lib/StackList');
var SL;

describe("Filters",function() {

  beforeEach(function() {
    var stacks = [];
    var stacksJSON = JSON.parse(fs.readFileSync("test/data/stacks.json").toString());
    stacksJSON.Stacks.forEach(stack => {
      var layersJSON = JSON.parse(fs.readFileSync("test/data/layers.json").toString());
      stack.layers = layersJSON.Layers;
      stacks.push(stack);
    });
    SL = new StackList(stacks);
  });



  describe("Built-in",function() {
    it("Based on region", function() {
      SL.applyFilters(['region:us-west-1']);
      SL.stacks.should.have.length(2);
    });

    it("Based on stack name", function() {
      SL.applyFilters(['stack:wordpress-production']);
      SL.stacks.should.have.length(1);
    });

    it("Based on layer name", function() {
      SL.applyFilters(['layer:database']);
      SL.stacks.should.have.length(3);
      SL.stacks.forEach(stack => {
        stack.layers.should.have.length(1);
      });
    });
  });
  
  describe("From custom JSON",function() {
    it("Custom filter test", function() {
      SL.applyFilters(['env:production']);
      SL.stacks.should.have.length(3);
    });

    it("Layer JSON should override Stack JSON", function() {
      //A stack has `env` set to test, but the layers override it.
      SL.applyFilters(['env:test']);
      SL.stacks.should.have.length(0);
    });

    it("Stack JSON should be queriable too", function() {
      //The final json of a layer should be the result of
      //merging the stack's and the layer's
      SL.applyFilters(['stackjsontest:somevalue']);
      SL.stacks.should.have.length(1);
    });

    it("Should not throw if the filter does not exist", function() {
      SL.applyFilters.bind(['thisdoesnotexist:somevalue']);
    });

    it("Should not throw if a layer has no custom_json", function() {
      var stacks = [];
      var stacksJSON = JSON.parse(fs.readFileSync("test/data/stacks.json").toString());
      stacksJSON.Stacks.forEach(stack => {
        var layersJSON = JSON.parse(fs.readFileSync("test/data/layers.json").toString());
        stack.layers = layersJSON.Layers;
        stacks.push(stack);
      });

      delete(stacks[0].layers[0].CustomJson);

      SL = new StackList(stacks);
      SL.applyFilters(['env:test']);

      SL.stacks.should.have.length(1);
      SL.stacks[0].layers.should.have.length(1);
    });
  });

  describe("Filtering",function() {
    it("Should throw using poorly formated filter", function() {
      SL.applyFilters.bind(SL,['thisisnotafilter']).should.throw(/Incorrect filter/);
      SL.applyFilters.bind(SL,['that:is:notright']).should.throw(/Incorrect filter/);
    });

    it("Should throw using the same filter twice", function() {
      SL.applyFilters.bind(SL,['env:production','env:staging']).should.throw(/same filter/);
    });

    it("Should omit stacks with no layers", function() {
      SL.applyFilters(['layer:thisdoesnotexist']);
      SL.stacks.should.have.length(0);
    });

    it("Combined filters", function() {
      SL.applyFilters(['region:us-west*','stack:wordpress*','layer:database']);
      SL.stacks.should.have.length(2);
      SL.stacks.forEach(stack => {
        stack.layers.should.have.length(1);
      })
    });

    it("Wildcard before", function() {
      SL.applyFilters(['stack:*']);
      SL.stacks.should.have.length(3);

      SL.applyFilters(['stack:*-production']);
      SL.stacks.should.have.length(1);
    });

    it("Wildcard after", function() {
      SL.applyFilters(['stack:wordp*']);
      SL.stacks.should.have.length(3);      

      SL.applyFilters(['region:us-west*']);
      SL.stacks.should.have.length(2);      
    });

    it("Multiple wildcards", function() {
      SL.applyFilters(['stack:*-*']);
      SL.stacks.should.have.length(3);

      SL.applyFilters(['region:us-*-1']);
      SL.stacks.should.have.length(3);
    });
  });
});
