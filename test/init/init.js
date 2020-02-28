// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-connector-oracle
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const juggler = require('loopback-datasource-juggler');
let DataSource = juggler.DataSource;

const config = {};
config.maxConn = 64;
config.user = process.env.ORACLE_USER || 'test';
config.password = process.env.ORACLE_PASSWORD || 'testuser123';
config.database = process.env.ORACLE_DATABASE || 'db';
config.host = process.env.ORACLE_HOST || 'localhost';
config.port = process.env.ORACLE_PORT || 1521;

let db;

global.getDataSource = global.getSchema = function() {
  if (db) {
    return db;
  }
  db = new DataSource(require('../../'), config);
  db.log = function(a) {
    // console.log(a);
  };
  return db;
};

global.resetDataSourceClass = function(ctor) {
  DataSource = ctor || juggler.DataSource;
  const promise = db ? db.disconnect() : Promise.resolve();
  db = undefined;
  return promise;
};

global.connectorCapabilities = {
  ilike: false,
  nilike: false,
};