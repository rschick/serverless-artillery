/* eslint-disable class-methods-use-this */

// The Ultimate Unit Testing Cheat-sheet
// https://gist.github.com/yoavniran/1e3b0162e1545055429e

'use strict';

const BbPromise = require('bluebird');
const expect = require('chai').expect;
const fs = require('fs');
const mock = require('mock-require');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

let serverlessMocks = [];

class AwsInvoke {
  // constructor() {} // eslint-disable-line no-useless-constructor
  log() {}
}
const success = { Payload: '{ "errors": 0, "reports": [{ "errors": 0 }] }' };
const failure = { Payload: '{ "errors": 1, "reports": [{ "errors": 1 }] }' };
let result = success;
class serverlessMock {
  constructor(config) {
    this.version = config.version || '1.0.3';
    this.config = config;
    this.pluginManager = {
      plugins: [
        new AwsInvoke(),
      ],
    };
    serverlessMocks.push(this);
  }
  init() {
    this.initCalled = true;
    return BbPromise.resolve();
  }
  run() {
    this.argv = process.argv;
    const scriptPath = this.argv[6];
    if (fs.existsSync(scriptPath)) {
      const scriptPathLower = scriptPath.toLowerCase();
      const isYamlFile = scriptPathLower.endsWith('.yml') || scriptPathLower.endsWith('.yaml');
      const fileContents = fs.readFileSync(scriptPath, { encoding: 'utf8' });
      if (isYamlFile) {
        this.script = yaml.safeLoad(fileContents);
      } else {
        this.script = JSON.parse(fileContents);
      }
    }
    this.pluginManager.plugins[0].log(result);
    return BbPromise.resolve(result);
  }
  _findParameterValue(param) {
    let res = null;
    if (this.argv) {
      const paramIndex = this.argv.indexOf(`-${param}`);
      if (paramIndex !== -1 && paramIndex < (this.argv.length - 1)) {
        res = this.argv[paramIndex + 1];
      }
    }
    return res;
  }
}

mock('../lib/serverless-fx', serverlessMock);

const slsart = require('../lib');

describe('serverless-artillery command line interactions', () => {
  const functionName = 'loadGenerator';
  const scriptPath = 'script.yml';
  const phaselessScriptPath = path.join(__dirname, 'phaseless-script.yml');

  beforeEach(() => {
    serverlessMocks = [];
  });

  describe('deploy actions', () => {
    it('must use Serverless deploy command', (done) => {
      slsart.deploy({})
      .then(() => {
        expect(serverlessMocks.length).to.equal(1);
        expect(serverlessMocks[0].initCalled).to.be.true;
        expect(serverlessMocks[0].argv).to.eql([null, null, 'deploy']);
        done();
      });
    });
  });

  describe('performance mode invoke actions', () => {
    it('must use Serverless invoke command', (done) => {
      const newScriptPath = path.join(process.cwd(), 'lib', 'lambda', scriptPath);
      slsart.invoke({
        script: newScriptPath,
      })
      .then(() => {
        expect(serverlessMocks.length).to.equal(1);
        expect(serverlessMocks[0].initCalled).to.be.true;
        expect(serverlessMocks[0].argv).to.eql([null, null, 'invoke', '-f', functionName, '-p', newScriptPath]);
        done();
      });
    });
  });

  describe('acceptance mode invoke actions', () => {
    it('creates a new file in the OS\'s `tmp` directory with the mode attribute set to "acc"', (done) => {
      slsart.invoke({
        script: phaselessScriptPath,
        acceptance: true,
      })
      .then(() => {
        expect(serverlessMocks.length).to.equal(1);
        const tmpScriptPath = serverlessMocks[0].argv[6];
        expect(serverlessMocks[0].initCalled).to.be.true;
        expect(serverlessMocks[0].argv).to.eql([null, null, 'invoke', '-f', functionName, '-p', tmpScriptPath]);
        expect(path.dirname(tmpScriptPath)).to.equal(os.tmpdir());
        expect(serverlessMocks[0].script.mode).to.equal('acc');
        done();
      });
    });
    it('exits the process with a non-zero exit code when 1 or more errors occur during the acceptance test', (done) => {
      result = failure; // adjust result
      const exit = process.exit; // save exit
      let exitCode;
      process.exit = (code) => { // replace exit
        exitCode = code;
      };
      slsart.invoke({
        script: phaselessScriptPath,
        acceptance: true,
      })
      .then(() => {
        expect(exitCode).to.equal(1);
        process.exit = exit;
        result = success; // reset result
        done();
      });
    });
  });

  describe('remove actions', () => {
    it('must use Serverless remove command', (done) => {
      slsart.remove({})
        .then(() => {
          expect(serverlessMocks.length).to.equal(1);
          expect(serverlessMocks[0].initCalled).to.be.true;
          expect(serverlessMocks[0].argv).to.eql([null, null, 'remove']);
          done();
        });
    });
  });
});

describe('serverless-artillery install postinstall', () => {
  it('puts dependencies into ./lib/lambda', (done) => {
    // eslint-disable-next-line no-bitwise
    fs.access(path.join(__dirname, '..', 'lib', 'lambda'), fs.R_OK | fs.X_OK, (err) => {
      expect(err).to.be.null;
      done();
    });
  });
});

