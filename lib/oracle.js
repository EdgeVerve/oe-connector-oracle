// Copyright IBM Corp. 2013,2016. All Rights Reserved.
// Node module: loopback-connector-Oracle
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

/*!
 * Oracle connector for LoopBack
 */
'use strict';
var SG = require('strong-globalize');
var g = SG();
var oracle = require('oracledb');
var SqlConnector = require('loopback-connector').SqlConnector;
var ParameterizedSQL = SqlConnector.ParameterizedSQL;
var util = require('util');
var debug = require('debug')('loopback:connector:oracle');
var Promise = require('bluebird');
var async = require('async');

/**
 *
 * Initialize the Oracle connector against the given data source
 *
 * @param {DataSource} dataSource The loopback-datasource-juggler dataSource
 * @callback {Function} [callback] The callback function
 * @param {String|Error} err The error string or object
 * @header Oracle.initialize(dataSource, [callback])
 */
exports.initialize = function initializeDataSource(dataSource, callback) {
  if (!oracle) {
    return;
  }

  var s = dataSource.settings || {};


  //Atul : getting as much settings as possible and set for oracle.
  var dbSettings = dataSource.settings || {};
  dbSettings.host = dbSettings.host || dbSettings.hostname || 'localhost';
  dbSettings.user = dbSettings.user || dbSettings.username;
  dbSettings.port = dbSettings.port || "1521";
  dbSettings.database = dbSettings.database || dbSettings.serviceId || dbSettings.sid;
  if (!dbSettings.connectString) {
    dbSettings.connectString = dbSettings.host + ":" + dbSettings.port.toString() + "/" + dbSettings.database; //(process.env.ORACLE_SID || "orclpdb.ad.xxxx.com")
  }
  dbSettings.debug = dbSettings.debug || debug.enabled;
  dbSettings.poolMin = dbSettings.poolMin || 1;
  dbSettings.poolMax = dbSettings.poolMax || 20;
  dbSettings.poolIncrement = dbSettings.poolIncrement || 1;
  dbSettings.poolTimeout = dbSettings.poolTimeout || 60;
  dbSettings.autoCommit = true;
  dbSettings.outFormat = oracle.OBJECT;
  dbSettings.maxRows = dbSettings.maxRows || 100;
  dbSettings.stmtCacheSize = dbSettings.stmtCacheSize || 30;
  dbSettings.fetchAsString = dbSettings.fetchAsString || [oracle.CLOB];
  dbSettings.fetchAsBuffer = dbSettings.fetchAsBuffer || [oracle.BLOB];

  dataSource.connector = new Oracle(oracle, dbSettings);
  dataSource.connector.dataSource = dataSource;

  if (callback) {
    if (s.lazyConnect) {
      process.nextTick(function () {
        callback();
      });
    } else {
      dataSource.connecting = true;
      dataSource.connector.connect(callback);
    }
  }
};

exports.Oracle = Oracle;

/**
 * Oracle connector constructor
 *
 * @param {Oracle} oracle Oracle node.js binding
 * @options {Oracle} settings An object for the data source settings.
 * See [orcle documentation]().
 * @property {String} url URL to the database, such as 'postgres://test:mypassword@localhost:5432/devdb'.
 * Other parameters can be defined as query string of the url
 * @property {String} hostname The host name or ip address of the Oracle DB server
 * @property {Number} port The port number of the Oracle DB Server
 * @property {String} user The user name
 * @property {String} password The password
 * @property {String} database The database name
 * @property {Boolean} ssl Whether to try SSL/TLS to connect to server
 *
 * @constructor
 */
function Oracle(oracle, settings) {
  // this.name = 'Oracle';
  // this._models = {};
  // this.settings = settings;
  this.constructor.super_.call(this, 'oracle', settings);
  this.oracle = oracle;
  this.pool = null;
  this.parallelLimit = settings.maxConn || settings.poolMax || 16;
  if (settings.debug || debug.enabled) {
    debug('Settings: %j', settings);
  }
  this.settings = settings;
  oracle.fetchAsString = settings.fetchAsString || [oracle.CLOB];
  oracle.fetchAsBuffer = settings.fetchAsBuffer || [oracle.BLOB];
  this.typesCreated = false;
}

// Inherit from loopback-datasource-juggler BaseSQL
util.inherits(Oracle, SqlConnector);

Oracle.prototype.debug = function () {
  if (this.settings.debug || debug.enabled) {
    debug.apply(null, arguments);
  }
};

//Oracle.prototype.getDefaultSchemaName = function () {
//  return 'public';
//};

function uuid(id) {
  return id;
}

Oracle.prototype.getDefaultIdType = function () {
  return String;
};

/**
 * Connect to Oracle
 * @param {Function} [callback] The callback the connection is established
 */
Oracle.prototype.connect = function (callback) {
  var self = this;
  if (this.pool) {
    if (callback) {
      process.nextTick(function () {
        if (callback) callback(null, self.pool);
      });
    }
    return;
  }
  if (self.settings.debug) {
    self.debug('Connecting to ' +
      (self.settings.hostname || self.settings.connectString));
  }
  self.oracle.createPool(this.settings, function (err, pool) {
    if (err) {
      if (callback) return callback(err, pool);
      return;
    }
    self.pool = pool;
    if (callback) callback(err, pool);
  });
};

/**
 * Execute the sql statement
 *
 * @param {String} sql The SQL statement
 * @param {String[]} params The parameter values for the SQL statement
 * @param {Object} [options] Options object
 * @callback {Function} [callback] The callback after the SQL statement is executed
 * @param {String|Error} err The error string or object
 * @param {Object[])} data The result from the SQL
 */
Oracle.prototype.executeSQL = function (sql, params, options, callback) {
  var self = this;
  if (params && Array.isArray(params)) {
    for (var j = 0; j < params.length; ++j) {
      if (params[j] == '[""]') {
        params[j] = '[]';
      }
    }
  }
  if (self.settings.debug) {
    if (params && params.length > 0) {
      self.debug('SQL: %s \nParameters: %j', sql, params);
    } else {
      self.debug('SQL: %s', sql);
    }
  }
  //Atul : using settings2 variable as autoCommit property could change based on call.
  var settings2 = Object.assign({}, self.settings);
  function executeWithConnection(connection, newOptions, release) {
    newOptions.autoCommit = true;
    if (!release) {
      newOptions.autoCommit = false;
    }
    connection.execute(sql, params, newOptions, function (err, data) {
      if (err && self.settings.debug) {
        self.debug(err);
      }
      if (self.settings.debug && data) self.debug('%j', data);
      var result = data;
      if (data) {
        if (data.rows) {
          result = data.rows;
        }
      }
      if (release) {
        connection.release(function (err2) {
          //Atul : don't wait for release to return
          // callback(err ? err : null, result);
        });
      }
      callback(err ? err : null, result);
    });
  }


  var transaction = options.transaction;
  if (transaction && transaction.connection &&
    transaction.connector === this) {
    debug('Execute SQL within a transaction');
    // Do not release the connection
    executeWithConnection(transaction.connection, settings2, false);
  } else {
    self.pool.getConnection(function (err, connection) {
      if (err) return callback(err);
      executeWithConnection(connection, settings2, true);
    });
  }
};

/**
 * Get the place holder in SQL for values, such as :1 or ?
 * @param {String} key Optional key, such as 1 or id
 * @returns {String} The place holder
 */
Oracle.prototype.getPlaceholderForValue = function (key) {
  return ':' + key;
};

Oracle.prototype.getCountForAffectedRows = function (model, info) {
  return info && info.rowsAffected;
};

Oracle.prototype.getInsertedId = function (model, info) {
  return info && info.outBinds && info.outBinds[0][0];
};

function escapeIdentifier(str) {
  var escaped = '"';
  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    if (c === '"') {
      escaped += c + c;
    } else {
      escaped += c;
    }
  }
  escaped += '"';
  return escaped;
}

function escapeLiteral(str) {
  var hasBackslash = false;
  var escaped = '\'';
  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    if (c === '\'') {
      escaped += c + c;
    } else if (c === '\\') {
      escaped += c + c;
      hasBackslash = true;
    } else {
      escaped += c;
    }
  }
  escaped += '\'';
  if (hasBackslash === true) {
    escaped = ' E' + escaped;
  }
  return escaped;
}

Oracle.prototype.escapeName = function (name) {
  if (!name) {
    return name;
  }
  return escapeIdentifier(name);
};

Oracle.prototype.escapeValue = function (value) {
  if (typeof value === 'string') {
    return escapeLiteral(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  // Can't send functions, objects, arrays
  if (typeof value === 'object' || typeof value === 'function') {
    return null;
  }
  return value;
};


Oracle.prototype.buildInsertDefaultValues = function (model, data, options) {
  // Oracle doesn't like empty column/value list
  var idCol = this.idColumnEscaped(model);
  return '(' + idCol + ') VALUES(DEFAULT)';
};

Oracle.prototype._getActualProperty = function (model, propertyName) {
  var self = this;
  var props = self.getModelDefinition(model).properties;
  var p = props[key];
  var key2 = propertyName, key = propertyName;
  var keyPath = key;
  if (key.indexOf('.') > 0) {
    key = key2.split('.')[0];
    keyPath = key.split('.');
  }
  var p = props[key];
  if (p == null) {
    // Unknown property, ignore it
    debug('Unknown property %s is skipped for model %s', key, model);
    return null;
  }
  var stillModel = true;
  var currentProperty;
  /* eslint-disable one-var */
  var columnName = self.columnEscaped(model, key);

  var currentProperty = p;
  if (key !== key2) {
    var currentProperty = this._models[model].properties[key]; //.type.getPropertyType("name")
    var elements = key2.split('.');
    for (var i = 1, n = elements.length; i < n; ++i) {
      var temp = elements[i];
      if (stillModel && currentProperty.type && this._models[currentProperty.type.modelName]) {
        currentProperty = this._models[currentProperty.type.modelName].properties[temp];
        if (!(currentProperty && currentProperty.type && currentProperty.type.name === 'ModelConstructor')) {
          stillModel = false;
        }
      }
      else {
        stillModel = false;
      }
    }
  }
  return currentProperty;
};

/**
 * Atul : builds where clause - overriden from sqlconnector
 * Atul : This function build where clause. If property name is delimited with dot ('.'), it forms column name with json_value
 * Example : customer.address.city = 'mumbai' will be changed to json_value("CUSTOMER"."ADDRESS", '$."CITY"')
 * If field is supposed to be collection (array), it uses json_query instead
 *
 * @param {String} model Name of the model
 * @param {Object} [where] Where clause of loopback 
  */

Oracle.prototype._buildWhere = function (model, where) {
  if (!where) {
    return new ParameterizedSQL('');
  }
  if (typeof where !== 'object' || Array.isArray(where)) {
    debug('Invalid value for where: %j', where);
    return new ParameterizedSQL('');
  }
  var self = this;
  var props = self.getModelDefinition(model).properties;

  var whereStmts = [];
  for (var key in where) {
    var stmt = new ParameterizedSQL('', []);
    // Handle and/or operators
    if (key === 'and' || key === 'or') {
      var branches = [];
      var branchParams = [];
      var clauses = where[key];
      if (Array.isArray(clauses)) {
        for (var i = 0, n = clauses.length; i < n; i++) {
          var stmtForClause = self._buildWhere(model, clauses[i]);
          if (stmtForClause.sql) {
            stmtForClause.sql = '(' + stmtForClause.sql + ')';
            branchParams = branchParams.concat(stmtForClause.params);
            branches.push(stmtForClause.sql);
          }
        }
        stmt.merge({
          sql: branches.join(' ' + key.toUpperCase() + ' '),
          params: branchParams,
        });
        whereStmts.push(stmt);
        continue;
      }
      // The value is not an array, fall back to regular fields
    }

    var key2 = key;
    if (key.indexOf('.') > 0) {
      key = key2.split('.')[0];
    }

    var p = self._getActualProperty(model, key2);//props[key];
    if (p == null) {
      // Unknown property, ignore it
      debug('Unknown property %s is skipped for model %s', key, model);
      stmt.merge({
        sql: key2 + '= ?',
        params: [where[key2]],
      });
      whereStmts.push(stmt);
      continue;
    }
    /* eslint-disable one-var */
    var columnName = self.columnEscaped(model, key);
    var expression = where[key2];
    var columnValue;
    var sqlExp;
    var newColumnName = columnName, targetField;
    if (key != key2) {
      targetField = key2.split('.').slice(1).join('.');
      targetField = targetField.split('.').map(function (x) {
        return '"' + x + '"';
      }).join('.');
      //key2.split('.').slice(-1)[0];
      newColumnName = "json_value(" + columnName + ", " + "'$." + targetField + "' null on error )"
    }

    /* eslint-enable one-var */
    if (expression === null || expression === undefined) {
      stmt.merge(newColumnName + ' IS NULL');
    } else if (expression && (expression.constructor === Object || expression.constructor === RegExp)) {
      var operator = Object.keys(expression)[0];
      // Get the expression without the operator
      if (operator === 'like' || operator === 'nlike' || operator === 'ilike' || operator === 'nilike') {
        this._expression = expression = new RegExp(expression[operator]);
      } else if (expression.constructor === RegExp) {
        operator = 'regexp';
      } else {
        expression = expression[operator];
      }
      if (operator === 'inq' || operator === 'nin' || operator === 'contains' || operator === 'between') {
        // newColumnName = newColumnName.replace('json_value', 'json_query');
        if (newColumnName.indexOf('json_') == 0) {
          // newColumnName = "utl_raw.cast_to_raw(" + newColumnName + ")";
          newColumnName = newColumnName.replace('null on error', 'empty on error');
        }
        columnValue = [];
        if (Array.isArray(expression)) {
          // Column value is a list
          for (var j = 0, m = expression.length; j < m; j++) {
            if (expression[j] && typeof (expression[j]) == 'object' && (expression[j].constructor.name == 'String' || expression[j].constructor.name == 'Number' || expression[j].constructor.name == 'Boolean') && expression[j][0]) {
              expression[j] = expression[j][0];
            }
            var v = this.toColumnValue(p, expression[j]);
            if (v === '{}')
              columnValue.push('');
            else {
              if (expression[j] === null) {
                columnValue.push(null);
              }
              else
                columnValue.push(this.toColumnValue(p, expression[j]));
            }
          }
        } else {
          columnValue.push(this.toColumnValue(p, expression));
        }
        if (operator === 'between') {
          // BETWEEN v1 AND v2
          var v1 = columnValue[0] === undefined ? null : columnValue[0];
          var v2 = columnValue[1] === undefined ? null : columnValue[1];
          columnValue = [v1, v2];
        } else {
          // IN (v1,v2,v3) or NOT IN (v1,v2,v3)
          if (columnValue.length === 0) {
            if (operator === 'inq') {
              columnValue = [null];
            } else {
              // nin () is true
              continue;
            }
          }
        }
      } else if ((operator === 'regexp' || operator === 'like' || operator === 'nlike'
        || operator === 'ilike' || operator === 'nilike') && expression instanceof RegExp) {
        // do not coerce RegExp based on property definitions
        columnValue = expression;
      } else {
        columnValue = this.toColumnValue(p, expression);
      }
      sqlExp = self.buildExpression(
        newColumnName, operator, columnValue, p);
      stmt.merge(sqlExp);
    } else {
      // The expression is the field value, not a condition
      columnValue = self.toColumnValue(p, expression);
      if (columnValue === null) {
        stmt.merge(newColumnName + ' IS NULL');
      } else {
        if (columnValue instanceof ParameterizedSQL) {
          stmt.merge(newColumnName + '=').merge(columnValue);
        } else {
          stmt.merge({
            sql: newColumnName + '=?',
            params: [columnValue],
          });
        }
      }
    }
    whereStmts.push(stmt);
  }
  var params = [];
  var sqls = [];
  for (var k = 0, s = whereStmts.length; k < s; k++) {
    sqls.push(whereStmts[k].sql);
    params = params.concat(whereStmts[k].params);
  }
  var whereStmt = new ParameterizedSQL({
    sql: sqls.join(' AND '),
    params: params,
  });
  return whereStmt;
};


Oracle.prototype._buildFieldsForKeys = function (model, data, keys, excludeIds) {
  var props = this.getModelDefinition(model).properties;
  var fields = {
    names: [], // field names
    columnValues: [], // an array of ParameterizedSQL
    properties: [], // model properties
  };
  for (var i = 0, n = keys.length; i < n; i++) {
    var key = keys[i];
    var p = props[key];
    if (p == null) {
      // Unknown property, ignore it
      debug('Unknown property %s is skipped for model %s', key, model);
      continue;
    }

    if (excludeIds && p.id) {
      continue;
    }
    var k = this.columnEscaped(model, key);
    var v = this.toColumnValue(p, data[key]);
    if (v !== undefined) {
      fields.names.push(k);
      if (v instanceof ParameterizedSQL) {
        fields.columnValues.push(v);
      } else {
        if (typeof p.type == 'function' && (p.type.name === 'ModelConstructor' || p.type.name === 'Object')) {
          if (v === 'null') {
            v = '';
          }
          var temp = new ParameterizedSQL(ParameterizedSQL.PLACEHOLDER, [v]);
          // temp.sql = "utl_raw.cast_to_raw(" + temp.sql + ")";
          fields.columnValues.push(temp);
        }
        else if (Array.isArray(p.type) && (p.type[0].name == 'String' || p.type[0].name == 'Number' || p.type[0].name == 'Date' || p.type[0].name == 'Boolean' || p.type[0].name == 'ModelConstructor' || p.type[0].name == 'Object')) {
          // Atul : Array is indicated
          if (v === 'null') {
            v = '[]';
          }
          var temp = new ParameterizedSQL(ParameterizedSQL.PLACEHOLDER, [v]);
          // temp.sql = "utl_raw.cast_to_raw(" + temp.sql + ")";
          //temp.params[0] = '{"a":' + temp.params[0] + '}';
          //temp.sql = "varchar_array(" + temp.sql + ")";
          fields.columnValues.push(temp);
        }
        else {
          fields.columnValues.push(new ParameterizedSQL(ParameterizedSQL.PLACEHOLDER, [v]));
        }
      }
      fields.properties.push(p);
    }
  }
  return fields;
};

Oracle.prototype.buildInsertReturning = function (model, data, options) {
  var modelDef = this.getModelDefinition(model);
  var type = modelDef.properties[this.idName(model)].type;
  var outParam = null;
  if (type === Number) {
    outParam = { type: oracle.NUMBER, dir: oracle.BIND_OUT };
  } else if (type === Date) {
    outParam = { type: oracle.DATE, dir: oracle.BIND_OUT };
  } else {
    outParam = { type: oracle.STRING, dir: oracle.BIND_OUT };
  }
  var params = [outParam];
  var returningStmt = new ParameterizedSQL('RETURNING ' +
    this.idColumnEscaped(model) + ' into ?', params);
  return returningStmt;
};

/**
 * Create the data model in Oracle
 *
 * @param {String} model The model name
 * @param {Object} data The model instance data
 * @param {Function} [callback] The callback function
 */
Oracle.prototype.create = function (model, data, options, callback) {
  var self = this;
  var stmt = this.buildInsert(model, data, options);
  this.execute(stmt.sql, stmt.params, options, function (err, info) {
    if (err) {
      if (err.toString().indexOf('ORA-00001: unique constraint') >= 0) {
        // Transform the error so that duplicate can be checked using regex
        err = new Error(g.f('%s. Duplicate id detected.', err.toString()));
      }
      callback(err);
    } else {
      var insertedId = self.getInsertedId(model, info);
      callback(err, insertedId);
    }
  });
};


function dateToOracle(val, dateOnly) {
  function fz(v) {
    return v < 10 ? '0' + v : v;
  }

  function ms(v) {
    if (v < 10) {
      return '00' + v;
    } else if (v < 100) {
      return '0' + v;
    } else {
      return '' + v;
    }
  }

  var dateStr = [
    val.getFullYear(),
    fz(val.getMonth() + 1),
    fz(val.getDate()),
  ].join('-') + ' ' + [
    fz(val.getHours()),
    fz(val.getMinutes()),
    fz(val.getSeconds()),
  ].join(':');

  if (!dateOnly) {
    dateStr += '.' + ms(val.getMilliseconds());
  }

  if (dateOnly) {
    return new ParameterizedSQL(
      "to_date(?,'yyyy-mm-dd hh24:mi:ss')", [dateStr]);
  } else {
    return new ParameterizedSQL(
      "to_timestamp(?,'yyyy-mm-dd hh24:mi:ss.ff3')", [dateStr]);
  }
}

Oracle.prototype.toColumnValue = function (prop, val) {
  if (val == null) {
    // Oracle complains with NULLs in not null columns
    // If we have an autoincrement value, return DEFAULT instead
    if (prop.autoIncrement || prop.id) {
      return new ParameterizedSQL('DEFAULT');
    } else {
      return null;
    }
  }
  if (prop.type === String) {
    return String(val);
  }
  if (prop.type === Number) {
    if (isNaN(val)) {
      // Map NaN to NULL
      return val;
    }
    return val;
  }

  if (prop.type === Date || prop.type.name === 'Timestamp') {
    return dateToOracle(val, false); //prop.type === Date);
  }

  // Oracle support char(1) Y/N
  if (prop.type === Boolean) {
    if (val) {
      return 'Y';
    } else {
      return 'N';
    }
  }

  return this.serializeObject(val);
};

Oracle.prototype.fromColumnValue = function (prop, val) {
  if (val == null) {
    return val;
  }
  var type = prop && prop.type;
  if (type === Boolean) {
    if (typeof val === 'boolean') {
      return val;
    } else {
      return (val === 'Y' || val === 'y' || val === 'T' ||
        val === 't' || val === '1');
    }
  }
  return val;
};

/*!
 * Convert to the Database name
 * @param {String} name The name
 * @returns {String} The converted name
 */
Oracle.prototype.dbName = function (name) {
  if (!name) {
    return name;
  }
  return name.toUpperCase();
};

/*!
 * Escape the name for Oracle DB
 * @param {String} name The name
 * @returns {String} The escaped name
 */
Oracle.prototype.escapeName = function (name) {
  if (!name) {
    return name;
  }
  return '"' + name.replace(/\./g, '"."') + '"';
};

Oracle.prototype.tableEscaped = function (model) {
  var schemaName = this.schema(model);
  if (schemaName && schemaName !== this.settings.user) {
    return this.escapeName(schemaName) + '.' +
      this.escapeName(this.table(model));
  } else {
    return this.escapeName(this.table(model));
  }
};

Oracle.prototype.buildExpression =
  function (columnName, operator, columnValue, propertyDescriptor) {
    var val = columnValue;
    if (columnValue instanceof RegExp) {
      val = columnValue.source;
      operator = 'regexp';
    }
    switch (operator) {
      case 'like':
        return new ParameterizedSQL({
          sql: columnName + " LIKE ? ESCAPE '\\'",
          params: [val],
        });
      case 'nlike':
        return new ParameterizedSQL({
          sql: columnName + " NOT LIKE ? ESCAPE '\\'",
          params: [val],
        });
      case 'regexp':
        /**
         * match_parameter is a text literal that lets you change the default
         * matching behavior of the function. You can specify one or more of
         * the following values for match_parameter:
         * - 'i' specifies case-insensitive matching.
         * - 'c' specifies case-sensitive matching.
         * - 'n' allows the period (.), which is the match-any-character
         * wildcard character, to match the newline character. If you omit this
         * parameter, the period does not match the newline character.
         * - 'm' treats the source string as multiple lines. Oracle interprets
         * ^ and $ as the start and end, respectively, of any line anywhere in
         * the source string, rather than only at the start or end of the entire
         * source string. If you omit this parameter, Oracle treats the source
         * string as a single line.
         *
         * If you specify multiple contradictory values, Oracle uses the last
         * value. For example, if you specify 'ic', then Oracle uses
         * case-sensitive matching. If you specify a character other than those
         * shown above, then Oracle returns an error.
         *
         * If you omit match_parameter, then:
         * - The default case sensitivity is determined by the value of the NLS_SORT parameter.
         * - A period (.) does not match the newline character.
         * - The source string is treated as a single line.
         */
        var flag = '';
        if (columnValue.ignoreCase) {
          flag += 'i';
        }
        if (columnValue.multiline) {
          flag += 'm';
        }
        if (columnValue.global) {
          g.warn('{{Oracle}} regex syntax does not respect the {{`g`}} flag');
        }

        if (flag) {
          return new ParameterizedSQL({
            sql: 'REGEXP_LIKE(' + columnName + ', ?, ?)',
            params: [val, flag],
          });
        } else {
          return new ParameterizedSQL({
            sql: 'REGEXP_LIKE(' + columnName + ', ?)',
            params: [val],
          });
        }
      case 'contains':
        /**
         * Atul : For contains, nin and inq functionality, connector uses respective oracle functions
         * These function are created at beginning when connector tries to execute any query on database for the first time
         */
        var operatorValue = columnValue;
        var propertyDefinition = propertyDescriptor;
        var expr = this.invokeSuper('buildExpression', columnName, 'inq',
          operatorValue, propertyDefinition);
        if (Array.isArray(propertyDefinition.type)) {
          //expr.params = '{"a" : ' + JSON.stringify(expr.params) + '}';
          expr.params = JSON.stringify(expr.params);
          expr.sql = "oe_contains(?, " + columnName + ") = 'true'";
        }
        return expr;
      case 'nin':
        var operatorValue = columnValue;
        var propertyDefinition = propertyDescriptor;
        var expr = this.invokeSuper('buildExpression', columnName, 'inq',
          operatorValue, propertyDefinition);
        if (Array.isArray(propertyDefinition.type) || (propertyDefinition.type.name == 'Object')) {
          //var param = JSON.stringify(expr.params);
          //expr.params = '{"a" : ' + JSON.stringify(expr.params) + '}';
          expr.params = JSON.stringify(expr.params);
          expr.sql = "oe_nin(?, " + columnName + ") = 'true'";
        }
        return expr;
      case 'inq':
        var operatorValue = columnValue;
        var propertyDefinition = propertyDescriptor;
        var expr = this.invokeSuper('buildExpression', columnName, 'inq',
          operatorValue, propertyDefinition);
        if (Array.isArray(propertyDefinition.type) || (propertyDefinition.type.name == 'Object')) {
          //var param = JSON.stringify(expr.params);
          //expr.params = '{"a" : ' + JSON.stringify(expr.params) + '}';
          expr.params = JSON.stringify(expr.params);
          expr.sql = "oe_inq(?, " + columnName + ") = 'true'";
        }
        return expr;
      default:
        // Invoke the base implementation of `buildExpression`
        var exp = this.invokeSuper('buildExpression',
          columnName, operator, columnValue, propertyDescriptor);
        return exp;
    }
  };

function buildLimit(limit, offset) {
  if (isNaN(offset)) {
    offset = 0;
  }
  var sql = 'OFFSET ' + offset + ' ROWS';
  if (limit >= 0) {
    sql += ' FETCH NEXT ' + limit + ' ROWS ONLY';
  }
  return sql;
}

Oracle.prototype.applyPagination =
  function (model, stmt, filter) {
    var offset = filter.offset || filter.skip || 0;
    if (this.settings.supportsOffsetFetch) {
      // Oracle 12.c or later
      var limitClause = buildLimit(filter.limit, filter.offset || filter.skip);
      return stmt.merge(limitClause);
    } else {
      var paginatedSQL = 'SELECT * FROM (' + stmt.sql + ' ' +
        ')' + ' ' + ' WHERE R > ' + offset;

      if (filter.limit !== -1) {
        paginatedSQL += ' AND R <= ' + (offset + filter.limit);
      }

      stmt.sql = paginatedSQL + ' ';
      return stmt;
    }
  };

Oracle.prototype.buildColumnNames = function (model, filter) {
  var fieldsFilter = filter && filter.fields;
  var cols = this.getModelDefinition(model).properties;
  if (!cols) {
    return '*';
  }
  var self = this;
  var keys = Object.keys(cols);
  if (Array.isArray(fieldsFilter) && fieldsFilter.length > 0) {
    // Not empty array, including all the fields that are valid properties
    keys = fieldsFilter.filter(function (f) {
      return cols[f];
    });
  } else if ('object' === typeof fieldsFilter &&
    Object.keys(fieldsFilter).length > 0) {
    // { field1: boolean, field2: boolean ... }
    var included = [];
    var excluded = [];
    keys.forEach(function (k) {
      if (fieldsFilter[k]) {
        included.push(k);
      } else if ((k in fieldsFilter) && !fieldsFilter[k]) {
        excluded.push(k);
      }
    });
    if (included.length > 0) {
      keys = included;
    } else if (excluded.length > 0) {
      excluded.forEach(function (e) {
        var index = keys.indexOf(e);
        keys.splice(index, 1);
      });
    }
  }
  var names = keys.map(function (c) {
    var nm = self.columnEscaped(model, c);
    if (cols[c].type && (cols[c].type.name === 'ModelConstructor' || cols[c].type.name === 'Object')) {
      nm = nm + " " + nm;
    }
    // else if (Array.isArray(cols[c].type) && (cols[c].type[0].name === 'String' || cols[c].type[0].name === 'Number' || cols[c].type[0].name === 'Date' || cols[c].type[0].name === 'Boolean' || cols[c].type[0].name === 'ModelConstructor' || cols[c].type[0].name === 'Object')) {
    //   nm = "json_query(\"" + c.toUpperCase() + "\", '$') " + nm;
    //   //nm = "json_query(utl_raw.cast_to_varchar2(\"" + c.toUpperCase() + "\") format json, '$[*].a') " + nm;
    // }
    return nm;
  });
  var columnNames = names.join(',');

  if (filter.limit || filter.offset || filter.skip) {
    var orderBy = this.buildOrderBy(model, filter.order);
    columnNames += ',ROW_NUMBER() OVER' + ' (' + orderBy + ') R';
  }
  return columnNames;
};

/**
 * Disconnect from Oracle
 * @param {Function} [cb] The callback function
 */
Oracle.prototype.disconnect = function disconnect(cb) {
  var err = null;
  if (this.pool) {
    if (this.settings.debug) {
      this.debug('Disconnecting from ' +
        (this.settings.hostname || this.settings.connectString));
    }
    var pool = this.pool;
    this.pool = null;
    return pool.terminate(cb);
  }

  if (cb) {
    process.nextTick(function () {
      cb(err);
    });
  }
};

Oracle.prototype.ping = function (cb) {
  this.execute('select count(*) as result from user_tables', [], cb);
};

require('./migration')(Oracle, oracle);
require('./discovery')(Oracle, oracle);
require('./transaction')(Oracle, oracle);

// Atul : Lock is simple named mutex implementation using javascript promise
// typical call sequences is
// Lock l = new Lock('mylock');
// if ( l.acquire() == false ){ l.wait(function() {  console.log('lock is available'); } );
// else { // do work and release using l.release() }

//Lock class
function Lock(name) {
  if (Lock[name]) {
    return Lock[name];
  }
  this.name = name;
  this.free = true;
  Lock[name] = this;
}

Lock.prototype.acquire = function () {
  var self = this;
  if (!self.free)
    return false;
  self.free = false;

  var promise = new Promise(function (resolve, reject) {
    self.resolve = resolve;
    self.reject = reject;
  });
  self.promise = promise;
  return promise;
}

Lock.prototype.wait = function (cb) {
  var self = this;
  self.promise.then(function (data) {
    return cb(undefined, data);
  })
    .catch(function (err) {
      return cb(err);
    });
}

Lock.prototype.release = function (err) {
  var self = this;
  if (self.free) {
    return true;
  }
  if (!self.resolve) {
    throw new Error(self.name, ' lock not resolved');
  }
  self.free = true;
  if (err) {
    self.reject(err);
  }
  else {
    self.resolve(undefined, true);
  }
}

// Atul : following function will create predefined functions of oracle. 
// it will look into certain files in sql folder of loopback-connector-oracle
// these functions will be used extensively by connector
// it will use locking mechanism to ensure function is created only once and only by one execution path
Oracle.prototype.createTypes = function (cb) {
  var self = this;
  if (self.typesCreated) {
    return true;
  }

  var lock = new Lock('createTypeLock');
  if (!self.typesCreationInProgress) {
    self.typesCreationInProgress = true;
    lock.acquire();

    var commands = [];
    var fs = require('fs');
    var path = require('path');
    var dir = __dirname;
    var pathToScript = path.relative(process.cwd(), __filename);
    var f = ['../sql/oe-inq.sql', '../sql/oe-nin.sql', '../sql/oe-contains.sql'];

    for (var i = 0; i < f.length; ++i) {
      var data = null;
      try {
        var p = path.join(__dirname, f[i]);
        data = fs.readFileSync(p, 'utf8');
        if (data) commands.push(data);
      } catch (e) {
        console.log('Error:', e.message, e.stack);
      }
    }

    async.eachSeries(commands, function (cmd, done) {
      self.executeSQL(cmd, [], {}, function (err) {
        if (err) {
          self.debug('SQL: %s', cmd);
          self.debug('ERROR: %s', err);
        }
        return done(err);
      });
    },
      function (err) {
        self.typesCreated = true;
        lock.release(err);
        return cb(err);
      });
  }
  else {
    lock.wait(function (err) {
      cb(err);
    });
  }
}


// Atul : following function will create table in oracle
// it will use locking mechanism to ensure that table is created only once and only by one execution path
Oracle.prototype.updateAndCall = function (fn, args) {
  var self = this;
  if (!self._autoupdateModels) {
    self._autoupdateModels = {};
    self._modelUpdateIds = {};
  }

  var cb = args[args.length - 1]; // also needs to handle promise
  var model = args[0];
  var m = model.toLowerCase();
  var updateId = self.getModelDefinition(model).model.updateId;
  if (self._modelUpdateIds[m] && self._modelUpdateIds[m] !== updateId) {
    self._autoupdateModels[m] = undefined;
  }
  if (self._autoupdateModels[m] !== 'done') {
    var lock = new Lock(m);
    if (!self._autoupdateModels[m]) {
      self._autoupdateModels[m] = 'inprogress';
      lock.acquire();
      self.autoupdate(model, function (err) {
        if (err) {
          debug("Error in creating model ", model, err);
        }
        self._autoupdateModels[m] = 'done';
        self._modelUpdateIds[m] = updateId;
        lock.release();
        //self.emitter.emit('autoupdate-' + m, self);
        return fn.apply(self, [].slice.call(args));
      });
    }
    else {
      lock.wait(function (err) {
        return fn.apply(self, [].slice.call(args));
      });
    }
  }
  else
    return fn.apply(self, [].slice.call(args));
}


// Atul : list of the functions overriden by this oracle connection
// this will ensure that table is created before it is used (any CRUD happens on it)
// Oracle.prototype.innerall = Oracle.prototype.all;
Oracle.prototype.innercreate = Oracle.prototype.create;
Oracle.prototype.innerreplaceOrCreate = Oracle.prototype.replaceOrCreate;
Oracle.prototype.innerdestroyAll = Oracle.prototype.destroyAll;
Oracle.prototype.innersave = Oracle.prototype.save;
Oracle.prototype.innerupdate = Oracle.prototype.update;
Oracle.prototype.innercount = Oracle.prototype.count;

Oracle.prototype.all = function find(model, filter, options, cb) {
  options.model = model;
  var self = this;
  function helper() {
    return self.updateAndCall(self.innerall, [model, filter, options, function (err, data) {
      var props = self.getModelDefinition(model).properties;
      for (var i = 0; i < data.length; ++i) {
        var d = data[i];
        Object.keys(d).forEach(function (k) {
          var p = props[k];
          if (p && (p.type.name == 'Object' || Array.isArray(p.type))) {
            d[k] = JSON.parse(d[k]);
          }
        });
      }
      return cb(err, data);
    }]);
  }
  if (self.typesCreated) {
    return helper();
  }
  else {
    self.createTypes(function () {
      return helper();
    });
  }

}
Oracle.prototype.create = function create(model, data, options, cb) {
  options.model = model;
  var self = this;
  var args = arguments;
  if (self.typesCreated)
    return this.updateAndCall(self.innercreate, args);
  else {
    var args = arguments;
    self.createTypes(function () {
      self.updateAndCall(self.innercreate, args);
    });
  }
}
Oracle.prototype.replaceOrCreate = function replaceOrCreate(model, filter, options, cb) {
  var self = this;
  if (self.typesCreated)
    return self.updateAndCall(self.innerreplaceOrCreate, args);
  else {
    var args = arguments;
    self.createTypes(function () {
      self.updateAndCall(self.innercreate, args);
    });
  }
}
Oracle.prototype.destroyAll = function destroyAll(model, filter, options, cb) {
  options.model = model;
  var self = this;
  var args = arguments;
  if (self.typesCreated)
    return self.updateAndCall(self.innerdestroyAll, args);
  else {
    var args = arguments;
    self.createTypes(function () {
      self.updateAndCall(self.innercreate, args);
    });
  }
}
Oracle.prototype.save = function save(model, data, options, cb) {
  options.model = model;
  var self = this;
  var args = arguments;
  if (self.typesCreated)
    return self.updateAndCall(self.innersave, args);
  else {
    var args = arguments;
    self.createTypes(function () {
      self.updateAndCall(self.innercreate, args);
    });
  }
}

Oracle.prototype.update = function update(model, where, data, options, cb) {
  options.model = model;
  var self = this;
  var args = arguments;
  if (self.typesCreated)
    return self.updateAndCall(self.innerupdate, args);
  else {
    var args = arguments;
    self.createTypes(function () {
      self.updateAndCall(self.innercreate, args);
    });
  }
}

Oracle.prototype.count = function count(model, where, options, cb) {
  options.model = model;
  var self = this;
  var args = arguments;
  if (self.typesCreated)
    return self.updateAndCall(self.innercount, args);
  else {
    var args = arguments;
    self.createTypes(function () {
      self.updateAndCall(self.innercreate, args);
    });
  }
}

/**
 * Build the ORDER BY clause
 * @param {string} model Model name
 * @param {string[]} order An array of sorting criteria
 * @returns {string} The ORDER BY clause
 */
Oracle.prototype.buildOrderBy = function (model, order) {
  if (!order) {
    return '';
  }
  var self = this;
  if (typeof order === 'string') {
    order = [order];
  }
  var clauses = [];
  var cols = this.getModelDefinition(model).properties;
  for (var i = 0, n = order.length; i < n; i++) {
    var t = order[i].split(/[\s,]+/);
    if (cols[t[0]]) {
      if (t.length === 1) {
        clauses.push(self.columnEscaped(model, order[i]));
      } else {
        clauses.push(self.columnEscaped(model, t[0]) + ' ' + t[1]);
      }
    } else if (t[0].indexOf('.') !== -1) {
      var nestedProp = t[0].split('.');
      nestedProp.shift();
      nestedProp = nestedProp.join('"."');
      if (t.length === 1) {
        clauses.push(this.tableEscaped(model) + '.' + self.columnEscaped(model, t[0].split('.')[0]) + '."' + nestedProp + '" ' + t[1]);
      } else {
        this.tableEscaped(model) + '.' + self.columnEscaped(model, t[0]) + ' ' + t[1]
        clauses.push(this.tableEscaped(model) + '.' + self.columnEscaped(model, t[0].split('.')[0]) + '."' + nestedProp + '" ' + t[1]);
      }
    }
  }
  return 'ORDER BY ' + clauses.join(',');
};


/**
 * Build the SQL WHERE clause for the where object
 * @param {string} model Model name
 * @param {object} where An object for the where conditions
 * @returns {ParameterizedSQL} The SQL WHERE clause
 */
Oracle.prototype.buildGroupBy = function (model, group) {
  var groupByClause = this._buildGroupBy(model, group);
  if (groupByClause.sql) {
    groupByClause.sql = 'GROUP BY ' + groupByClause.sql;
  }
  return groupByClause;
};

Oracle.prototype._buildGroupBy = function (model, group) {
  if (!group) {
    return new ParameterizedSQL('');
  }
  if (typeof group !== 'object' || Array.isArray(group)) {
    debug('Invalid value for group: %j', group);
    return new ParameterizedSQL('');
  }
  var self = this;
  var props = self.getModelDefinition(model).properties;

  var groupByStmts = [];
  for (var key in group) {
    if (key === 'groupBy') {
      var groupBy = group[key];
      if (Array.isArray(groupBy)) {
        groupBy.forEach(function (col) {
          var columnName = self.columnEscaped(model, col);
          groupByStmts.push(columnName);
        });
      } else {
        debug('Invalid value for groupBy: %j', group);
        return new ParameterizedSQL('');
      }
    }
  }
  return new ParameterizedSQL(groupByStmts.join(','));
};

/**
 * Build a SQL SELECT statement
 * @param {String} model Model name
 * @param {Object} filter Filter object
 * @param {Object} options Options object
 * @returns {ParameterizedSQL} Statement object {sql: ..., params: [...]}
 */
Oracle.prototype.buildSelect = function (model, filter, options) {
  if (!filter.order) {
    var idNames = this.idNames(model);
    if (idNames && idNames.length) {
      filter.order = idNames;
    }
  }
  if (filter && filter.group) {
    var groupFields = filter.group.groupBy ? filter.group.groupBy : [];
    var filterFields = filter.fields || {};
    var fields;
    if (Array.isArray(filterFields) && filterFields.length > 0) {
      fields = [];
      filterFields.forEach(function (prop) {
        if (groupFields.indexOf(prop) !== -1) {
          fields.push(prop);
        }
      });
      filter.fields = fields;
    } else if (typeof filterFields === 'object' && Object.keys(filterFields).length > 0) {
      var included = [];
      var excluded = [];
      var keys = Object.keys(filterFields);
      keys.forEach(function (k) {
        if (filterFields[k]) {
          included.push(k);
        } else if ((k in filterFields) && !filterFields[k]) {
          excluded.push(k);
        }
      });
      if (included.length > 0) {
        fields = included;
      } else if (excluded.length > 0) {
        excluded.forEach(function (e) {
          var index = keys.indexOf(e);
          fields.splice(index, 1);
        });
      }
      filter.fields = fields;
    } else if (filter.group && filter.group.groupBy) {
      filter.fields = [];
      filter.group.groupBy.forEach(function (property) {
        filter.fields.push(property);
      });
    }

    if (filter.order) {
      // var self = this;
      if (typeof filter.order === 'string') {
        filter.order = [filter.order];
      }
      filter.order.forEach(function (e) {
        var orderProp = e.split(/[\s,]+/);
        if (filter.group.groupBy && filter.group.groupBy.indexOf(orderProp[0]) === -1) {
          var index = filter.order.indexOf(e);
          filter.order.splice(index, 1);
        }
      });
      if (filter.order.length === 0) {
        delete filter.order;
      }
    }

  }
  var selectStmt = new ParameterizedSQL('SELECT ' +
    this.buildColumnNames(model, filter) + this.buildColumnAggregations(model, filter) +
    ' FROM ' + this.tableEscaped(model)
  );

  if (filter) {
    if (filter.where) {
      var whereStmt = this.buildWhere(model, filter.where);
      selectStmt.merge(whereStmt);
    }

    if (filter.group) {
      var groupByStmt = this.buildGroupBy(model, filter.group);
      selectStmt.merge(groupByStmt);
    }

    if (filter.group && filter.group.groupBy && filter.having) {
      var havingStmt = this.buildHavingClause(model, filter.having);
      selectStmt.merge(havingStmt);
    }

    if (filter.order) {
      selectStmt.merge(this.buildOrderBy(model, filter.order));
    }

    if (filter.limit || filter.skip || filter.offset) {
      selectStmt = this.applyPagination(
        model, selectStmt, filter);
    }
  }
  return this.parameterize(selectStmt);
};

/**
 * Build the SQL WHERE clause for the where object
 * @param {string} model Model name
 * @param {object} filter An object for the filter conditions
 * @returns {ParameterizedSQL} The SQL WHERE clause
 */
Oracle.prototype.buildColumnAggregations = function (model, filter) {
  var colAggregate = this._buildColumnAggregations(model, filter);
  if (colAggregate) {
    colAggregate = ', ' + colAggregate;
    return colAggregate;
  }
  return "";
};

/**
 * Build a list of escaped column names for the given model and group filter
 * @param {string} model Model name
 * @param {object} filter The filter object
 * @returns {string} Comma separated string of escaped column names for aggregation functions
 */
Oracle.prototype._buildColumnAggregations = function (model, filter) {
  var self = this;
  var aggCols = [];
  var buildColumnsForAggregation = function (obj, fn) {
    Object.keys(obj).forEach(function (col) {
      if (col.indexOf('.') !== -1) {
        var key = col.split('.')[0];
        var key2 = col.split('.')[1];
        aggCols.push(fn + '(json_value(' + self.columnEscaped(model, key) + ', \'$.' + key2 + '\')) AS "' + obj[col] + '"');
      } else {
        aggCols.push(fn + '(' + self.columnEscaped(model, col) + ') AS "' + obj[col] + '"');
      }
    });
    return;
  };
  if (filter && filter.group) {
    var aggregations = Object.keys(filter.group);
    aggregations.forEach(function (agFn) {
      var aggregationFnName = agFn.toUpperCase();
      var fnTypes = ['MIN', 'MAX', 'COUNT', 'AVG', 'SUM'];
      if (fnTypes.indexOf(aggregationFnName) !== -1) {
        buildColumnsForAggregation(filter.group[agFn], aggregationFnName);
      }
    });
  }
  aggCols = aggCols.join(',');
  return aggCols;
};

/**
 * Transform the row data into a model data object
 * @param {string} model Model name
 * @param {object} rowData An object representing the row data from DB
 * @returns {object} Model data object
 */
Oracle.prototype.fromRow = Oracle.prototype.fromDatabase =
  function (model, rowData) {
    if (rowData == null) {
      return rowData;
    }
    var props = this.getModelDefinition(model).properties;
    var data = rowData;
    for (var p in props) {
      var columnName = this.column(model, p);
      // Load properties from the row
      var columnValue = this.fromColumnValue(props[p], rowData[columnName]);
      if (columnValue !== undefined && (data[p] || data[p] === 0)) {
        data[p] = columnValue;
      } else if (columnValue !== undefined && !data[p]) {
        data[p] = columnValue;
        delete data[columnName];
      }
    }
    return data;
  };

/**
 * Find matching model instances by the filter
 *
 * Please also note the name `all` is confusing. `Model.find` is to find all
 * matching instances while `Model.findById` is to find an instance by id. On
 * the other hand, `Connector.prototype.all` implements `Model.find` while
 * `Connector.prototype.find` implements `Model.findById` due to the `bad`
 * naming convention we inherited from juggling-db.
 *
 * @param {String} model The model name
 * @param {Object} filter The filter
 * @param {Function} [cb] The cb function
 */
Oracle.prototype.innerall = function find(model, filter, options, cb) {
  var self = this;
  // Order by id if no order is specified
  filter = filter || {};
  var stmt = this.buildSelect(model, filter, options);
  this.execute(stmt.sql, stmt.params, options, function (err, data) {
    if (err) {
      return cb(err, []);
    }
    if (filter.group) {
      Object.keys(filter.group).forEach(function (key) {
        key = key.toLowerCase();
        if (key !== 'groupby') {
          var val = filter.group[key];
          Object.keys(val).forEach(function (elem) {
            filter.fields.push(val[elem]);
          });
        }
      });
    }
    var objs = data.map(function (obj) {
      return self.fromRow(model, obj);
    });
    if (filter && filter.include) {
      self.getModelDefinition(model).model.include(
        objs, filter.include, options, cb);
    } else {
      cb(null, objs);
    }
  });
};

/**
 * Build the SQL WHERE clause for the where object
 * @param {string} model Model name
 * @param {object} filter An object for the filter conditions
 * @returns {ParameterizedSQL} The SQL WHERE clause
 */
Oracle.prototype.buildHavingClause = function (model, filter) {
  var havingClause = this._buildHavingClause(model, filter);
  if (havingClause.sql) {
    havingClause.sql = 'HAVING ' + havingClause.sql;
    return havingClause;
  }
  return "";
};


/*!
 * @param model
 * @param where
 * @returns {ParameterizedSQL}
 * @private
 */
Oracle.prototype._buildHavingClause = function (model, having) {
  var columnValue;
  var sqlExp;
  if (!having) {
    return new ParameterizedSQL('');
  }
  if (typeof having !== 'object' || Array.isArray(having)) {
    debug('Invalid value for where: %j', having);
    return new ParameterizedSQL('');
  }
  var self = this;
  var props = self.getModelDefinition(model).properties;

  var havingStmts = [];
  for (var key in having) {
    var aggregationFn = key.toUpperCase();
    var stmt = new ParameterizedSQL('', []);
    // Handle and/or operators
    if (key === 'and' || key === 'or') {
      var branches = [];
      var branchParams = [];
      var clauses = having[key];
      if (Array.isArray(clauses)) {
        for (var i = 0, n = clauses.length; i < n; i++) {
          var stmtForClause = self._buildHavingClause(model, clauses[i]);
          if (stmtForClause.sql) {
            stmtForClause.sql = '(' + stmtForClause.sql + ')';
            branchParams = branchParams.concat(stmtForClause.params);
            branches.push(stmtForClause.sql);
          }
        }
        stmt.merge({
          sql: branches.join(' ' + key.toUpperCase() + ' '),
          params: branchParams,
        });
        havingStmts.push(stmt);
        continue;
      }
    }

    var aggregation = having[key];
    for (var innerKey in aggregation) {
      var p = props[innerKey];
      if (p == null) {
        // Unknown property, ignore it
        debug('Unknown property %s is skipped for model %s', innerKey, model);
        continue;
      }
      var expression = aggregation[innerKey];
      var columnName = self.columnEscaped(model, innerKey);

      var newColumnName = columnName, targetField;
      var innerKey2 = innerKey;
      if (innerKey.indexOf('.') > 0) {
        innerKey = innerKey2.split('.')[0];
      }
      if (innerKey != innerKey2) {
        targetField = innerKey2.split('.').slice(1).join('.');
        targetField = targetField.split('.').map(function (x) {
          return '"' + x + '"';
        }).join('.');
        newColumnName = "json_value(" + columnName + ", " + "'$." + targetField + "' null on error )"
      }

      if (expression === null || expression === undefined) {
        stmt.merge(newColumnName + ' IS NULL');
      } else if (expression && (expression.constructor === Object || expression.constructor === RegExp)) {
        var operator = Object.keys(expression)[0];
        if (operator === 'like' || operator === 'nlike' || operator === 'ilike' || operator === 'nilike') {
          this._expression = expression = new RegExp(expression[operator]);
        } else if (expression.constructor === RegExp) {
          operator = 'regexp';
        } else {
          expression = expression[operator];
        }
        if (operator === 'inq' || operator === 'nin' || operator === 'contains' || operator === 'between') {
          if (newColumnName.indexOf('json_') == 0) {
            newColumnName = newColumnName.replace('null on error', 'empty on error');
          }
          columnValue = [];
          if (Array.isArray(expression)) {
            for (var j = 0, m = expression.length; j < m; j++) {
              if (typeof (expression[j]) == 'object' && (expression[j].constructor.name == 'String' || expression[j].constructor.name == 'Number' || expression[j].constructor.name == 'Boolean') && expression[j][0]) {
                expression[j] = expression[j][0];
              }
              var v = this.toColumnValue(p, expression[j]);
              if (v === '{}')
                columnValue.push('');
              else
                columnValue.push(this.toColumnValue(p, expression[j]));
            }
          } else {
            columnValue.push(this.toColumnValue(p, expression));
          }
          if (operator === 'between') {
            // BETWEEN v1 AND v2
            var v1 = columnValue[0] === undefined ? null : columnValue[0];
            var v2 = columnValue[1] === undefined ? null : columnValue[1];
            columnValue = [v1, v2];
          } else {
            // IN (v1,v2,v3) or NOT IN (v1,v2,v3)
            if (columnValue.length === 0) {
              if (operator === 'inq') {
                columnValue = [null];
              } else {
                // nin () is true
                continue;
              }
            }
          }
        } else if ((operator === 'regexp' || operator === 'like' || operator === 'nlike'
          || operator === 'ilike' || operator === 'nilike') && expression instanceof RegExp) {
          // do not coerce RegExp based on property definitions
          columnValue = expression;
        } else {
          columnValue = this.toColumnValue(p, expression);
        }
        sqlExp = self.buildAggregationExpression(aggregationFn,
          newColumnName, operator, columnValue, p);
        stmt.merge(sqlExp);
      } else {
        // The expression is the field value, not a condition
        columnValue = self.toColumnValue(p, expression);
        if (columnValue === null) {
          stmt.merge(aggregationFn + '(' + newColumnName + ') IS NULL');
        } else {
          if (columnValue instanceof ParameterizedSQL) {
            stmt.merge(aggregationFn + '(' + newColumnName + ')=').merge(columnValue);
          } else {
            stmt.merge({
              sql: aggregationFn + '(' + newColumnName + ')=?',
              params: [columnValue],
            });
          }
        }
      }
      havingStmts.push(stmt);
    }
  }
  var params = [];
  var sqls = [];
  for (var k = 0, s = havingStmts.length; k < s; k++) {
    sqls.push(havingStmts[k].sql);
    params = params.concat(havingStmts[k].params);
  }
  var havingStmt = new ParameterizedSQL({
    sql: sqls.join(' AND '),
    params: params,
  });
  return havingStmt;
};

/**
 * Build SQL expression
 * @param {String} aggregationFn Aggregation function name 
 * @param {String} columnName Escaped column name
 * @param {String} operator SQL operator
 * @param {*} columnValue SQL operator value
 * @param {*} propertyDescriptor Property definition
 * @returns {ParameterizedSQL} The SQL expression
 */
Oracle.prototype.buildAggregationExpression = function (aggregationFn, columnName, operator,
  columnValue, propertyDescriptor) {
  var val = columnValue;
  if (columnValue instanceof RegExp) {
    val = columnValue.source;
    operator = 'regexp';
  }
  switch (operator) {
    case 'like':
      return new ParameterizedSQL({
        sql: aggregationFn + '(' + columnName + ')' + " LIKE ? ESCAPE '\\'",
        params: [val],
      });
    case 'nlike':
      return new ParameterizedSQL({
        sql: aggregationFn + '(' + columnName + ')' + " NOT LIKE ? ESCAPE '\\'",
        params: [val],
      });
    case 'regexp':
      /**
       * match_parameter is a text literal that lets you change the default
       * matching behavior of the function. You can specify one or more of
       * the following values for match_parameter:
       * - 'i' specifies case-insensitive matching.
       * - 'c' specifies case-sensitive matching.
       * - 'n' allows the period (.), which is the match-any-character
       * wildcard character, to match the newline character. If you omit this
       * parameter, the period does not match the newline character.
       * - 'm' treats the source string as multiple lines. Oracle interprets
       * ^ and $ as the start and end, respectively, of any line anywhere in
       * the source string, rather than only at the start or end of the entire
       * source string. If you omit this parameter, Oracle treats the source
       * string as a single line.
       *
       * If you specify multiple contradictory values, Oracle uses the last
       * value. For example, if you specify 'ic', then Oracle uses
       * case-sensitive matching. If you specify a character other than those
       * shown above, then Oracle returns an error.
       *
       * If you omit match_parameter, then:
       * - The default case sensitivity is determined by the value of the NLS_SORT parameter.
       * - A period (.) does not match the newline character.
       * - The source string is treated as a single line.
       */
      var flag = '';
      if (columnValue.ignoreCase) {
        flag += 'i';
      }
      if (columnValue.multiline) {
        flag += 'm';
      }
      if (columnValue.global) {
        g.warn('{{Oracle}} regex syntax does not respect the {{`g`}} flag');
      }

      if (flag) {
        return new ParameterizedSQL({
          sql: 'REGEXP_LIKE(' + columnName + ', ?, ?)',
          params: [val, flag],
        });
      } else {
        return new ParameterizedSQL({
          sql: 'REGEXP_LIKE(' + columnName + ', ?)',
          params: [val],
        });
      }
    case 'nin':
      var operatorValue = columnValue;
      var propertyDefinition = propertyDescriptor;
      var expr = this._buildAggregationExpression(aggregationFn, columnName, 'nin',
        operatorValue, propertyDefinition);
      if (Array.isArray(propertyDefinition.type) || (propertyDefinition.type.name == 'Object')) {
        expr.params = JSON.stringify(expr.params);
        expr.sql = "oe_nin(?, " + columnName + ") = 'true'";
      }
      return expr;
    case 'inq':
      var operatorValue = columnValue;
      var propertyDefinition = propertyDescriptor;
      var expr = this._buildAggregationExpression(aggregationFn, columnName, 'inq',
        operatorValue, propertyDefinition);
      if (Array.isArray(propertyDefinition.type) || (propertyDefinition.type.name == 'Object')) {
        expr.params = JSON.stringify(expr.params);
        expr.sql = "oe_inq(?, " + columnName + ") = 'true'";
      }
      return expr;
    default:
      var exp = this._buildAggregationExpression(aggregationFn,
        columnName, operator, columnValue, propertyDescriptor);
      return exp;
  }
};

/**
 * Build SQL expression
 * @param {String} aggregationFn Aggregation function name 
 * @param {String} columnName Escaped column name
 * @param {String} operator SQL operator
 * @param {*} columnValue Column value
 * @param {*} propertyValue Property value
 * @returns {ParameterizedSQL} The SQL expression
 */
Oracle.prototype._buildAggregationExpression =
  function (aggregationFn, columnName, operator, columnValue, propertyValue) {
    function buildClause(columnValue, separator, grouping) {
      var values = [];
      for (var i = 0, n = columnValue.length; i < n; i++) {
        if (columnValue[i] instanceof ParameterizedSQL) {
          values.push(columnValue[i]);
        } else {
          values.push(new ParameterizedSQL(ParameterizedSQL.PLACEHOLDER, [columnValue[i]]));
        }
      }
      separator = separator || ',';
      var clause = ParameterizedSQL.join(values, separator);
      if (grouping) {
        clause.sql = '(' + clause.sql + ')';
      }
      return clause;
    }

    var sqlExp = columnName;
    var clause;
    if (columnValue instanceof ParameterizedSQL) {
      clause = columnValue;
    } else {
      clause = new ParameterizedSQL(ParameterizedSQL.PLACEHOLDER, [columnValue]);
    }
    switch (operator) {
      case 'gt':
        sqlExp = aggregationFn + '(' + sqlExp + ')>';
        break;
      case 'gte':
        sqlExp = aggregationFn + '(' + sqlExp + ')>=';
        break;
      case 'lt':
        sqlExp = aggregationFn + '(' + sqlExp + ')<';
        break;
      case 'lte':
        sqlExp = aggregationFn + '(' + sqlExp + ')<=';
        break;
      case 'between':
        sqlExp = aggregationFn + '(' + sqlExp + ') BETWEEN ';
        clause = buildClause(columnValue, ' AND ', false);
        break;
      case 'inq':
        sqlExp = aggregationFn + '(' + sqlExp + ') IN ';
        clause = buildClause(columnValue, ',', true);
        break;
      case 'nin':
        sqlExp = aggregationFn + '(' + sqlExp + ') NOT IN ';
        clause = buildClause(columnValue, ',', true);
        break;
      case 'neq':
        if (columnValue == null) {
          return new ParameterizedSQL(aggregationFn + '(' + sqlExp + ') IS NOT NULL');
        }
        sqlExp = aggregationFn + '(' + sqlExp + ')!=';
        break;
      case 'like':
        sqlExp = aggregationFn + '(' + sqlExp + ') LIKE ';
        break;
      case 'nlike':
        sqlExp = aggregationFn + '(' + sqlExp + ') NOT LIKE ';
        break;
      // this case not needed since each database has its own regex syntax, but
      // we leave the MySQL syntax here as a placeholder
      case 'regexp':
        sqlExp = aggregationFn + '(' + sqlExp + ') REGEXP ';
        break;
    }
    var stmt = ParameterizedSQL.join([sqlExp, clause], '');
    return stmt;
  }

// require('./lock')(Oracle);
