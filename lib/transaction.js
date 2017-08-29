// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: loopback-connector-oracle
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var g = require('strong-globalize')();
var debug = require('debug')('loopback:connector:oracle:transaction');
var Transaction = require('loopback-connector').Transaction;

module.exports = mixinTransaction;

/*!
 * @param {Oracle} Oracle connector class
 */
function mixinTransaction(Oracle, oracle) {
  /**
   * Begin a new transaction
   * @param isolationLevel
   * @param cb
   */
  Oracle.prototype.beginTransaction = function (isolationLevel, cb) {
    debug('Begin a transaction with isolation level: %s', isolationLevel);
    if (isolationLevel !== Transaction.READ_COMMITTED &&
      isolationLevel !== Transaction.SERIALIZABLE) {
      var err = new Error(g.f('Invalid {{isolationLevel}}: %s',
        isolationLevel));
      err.statusCode = 400;
      return process.nextTick(function () {
        cb(err);
      });
    }
    this.pool.getConnection(function (err, connection) {
      if (err) return cb(err);
      if (isolationLevel) {
        var sql = 'SET TRANSACTION ISOLATION LEVEL ' + isolationLevel;
        connection.execute(sql, [],
          { outFormat: oracle.OBJECT, autoCommit: false }, function (err) {
            cb(err, connection);
          });
      } else {
        cb(err, connection);
      }
    });
  };

  /**
   *
   * @param connection
   * @param cb
   */
  Oracle.prototype.commit = function (connection, cb) {
    debug('Commit a transaction');
    var self = this;
    connection.commit(function (err) {
      if (err) return cb(err);
      self.releaseConnection(connection, cb);
    });
  };

  /**
   *
   * @param connection
   * @param cb
   */
  Oracle.prototype.rollback = function (connection, cb) {
    debug('Rollback a transaction');
    var self = this;
    connection.rollback(function (err) {
      if (err) return cb(err);
      self.releaseConnection(connection, cb);
    });
  };

  Oracle.prototype.releaseConnection = function (connection, cb) {
    if (typeof connection.release === 'function') {
      connection.release(cb);
    } else {
      var pool = this.pool;
      if (err) {
        pool.terminate(cb);
      } else {
        pool.release(cb);
      }
    }
  };

}