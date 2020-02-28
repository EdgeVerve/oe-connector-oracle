/**
 *
 * ©2016-2017 EdgeVerve Systems Limited (a fully owned Infosys subsidiary),
 * Bangalore, India. All Rights Reserved.
 *
 */

/* eslint-disable */

/* 
* This script clears the oracle database.
*
* To be run before executing tests
*
* Requires following environment variables:
*   ORACLE_DATABASE
*   ORACLE_PASSWORD
*   ORACLE_HOST
*   ORACLE_USER
*   ORACLE_PORT
*/

var oracledb = require('oracledb');
var async = require('async');
var fs = require('fs');
var os = require('os');

var oracleHost = process.env.ORACLE_HOST || 'localhost';
var oraclePort = process.env.ORACLE_PORT ? parseInt(process.env.ORACLE_PORT) : 1521;
var oracleSID = process.env.ORACLE_DATABASE || 'ORCLCDB';

var oracleConnectSettings = {
  'password': process.env.ORACLE_PASSWORD || 'manager1',
  'user': process.env.ORACLE_USER || 'sys',
  'connectString': oracleHost + ':' + oraclePort + '/' + oracleSID
};

function fetchUserTables(cxn, cb) {
  let fetchTablesQuery = 'SELECT table_name from USER_TABLES';
  cxn.execute(fetchTablesQuery, {}, function(err, results){
    cb(err, results);
  });
}

function fetchSequenceObjects(cxn, cb) {
  let fetchTablesQuery = 'SELECT sequence_name from USER_sequences';
  cxn.execute(fetchTablesQuery, {}, function(err, results){
    cb(err, results);
  });
}

function dropSequence(cxn, seqName, cb) {
  let deleteQuery = `DROP SEQUENCE ${seqName}`;
  cxn.execute(deleteQuery, function(err) {
    cb(err)
  });
}

function connectOracle(settings, cb) {
  oracledb.getConnection(settings, function(err, cxn) {
    cb(err, cxn);
  });
}

function dropTable(cxn, table, cb) {
  let deleteQuery = `DROP TABLE ${table}`;
  cxn.execute(deleteQuery, function(err) {
    cb(err)
  });
}

connectOracle(oracleConnectSettings, function onConnect(err, cxn) {
  if(err) {
    console.error('Connect Error:', err);
    process.exit(1);
  }
  else {
    fetchUserTables(cxn, function(err, results) {
      if(err) {
        console.error('Fetch Error:', err);
        process.exit(1);
      }
      else {
        async.eachSeries(results.rows, function asyncDropOperation(record, done){
          let table = record[0];
          dropTable(cxn, table, done);
        }, function asyncDropCb(err) {
          if(err) {
            console.error(err);
            process.exit(1);
          }
          else {
            fetchSequenceObjects(cxn, function(err, results) {
              if(err) {
                console.error('Seq fetch error:', err);
                process.exit(1);
              }
              else {
                async.eachSeries(results.rows, function asyncDropSeq(record, done){
                  let [name] = record;
                  dropSequence(cxn, name, done);
                }, function dropSeqAsyncCallback(err) {
                  if(err) {
                    console.error('Seq delete error:', err);
                    process.exit(1);
                  }                  
                });
              }
            });
          }
        });
      }
    });
  }
});