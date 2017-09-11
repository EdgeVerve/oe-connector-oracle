// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: loopback-connector-postgresql
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

// Atul : This code is basically loopback-connector-postgresql code which is ported for Oracle with appropriate changes

'use strict';
var SG = require('strong-globalize');
var g = SG();
var async = require('async');

module.exports = mixinMigration;

function mixinMigration(Oracle) {
  /*!
   * Discover the properties from a table
   * @param {String} model The model name
   * @param {Function} cb The callback function
   */
  Oracle.prototype.getTableStatus = function (model, cb) {
    var fields;
    var indexes;

    function done(err) {
      if (fields && indexes) {
        cb(err, fields, indexes);
      }
    }

    function decoratedTableDataCallback(err, data) {
      if (err) {
        console.error(err);
      }
      if (!err) {
        data.forEach(function (field) {
          field.type = mapOracleDatatypes(field.type, field.length);
        });
      }
      fields = data;
      done(err);
    }

    function decoratedIndexDataCallback(err, data) {
      var indexHash = {};

      if (err) {
        console.log(err);
      }

      indexes = data;
      done(err);
    }
    var sql1 = 'SELECT column_name AS "column", data_type AS "type", nullable AS "nullable",  data_length AS "dataLength" FROM sys.user_tab_columns WHERE table_name = \'' + this.table(model) + '\'';
    this.executeSQL(sql1, [], {}, decoratedTableDataCallback);
    decoratedIndexDataCallback(null, {});


    //this.executeSQL('SELECT column_name AS "column", data_type AS "type", udt_name AS "name", ' +
    //  'is_nullable AS "nullable", character_maximum_length as "length"' // , data_default AS "Default"'
    //  + ' FROM "information_schema"."columns" WHERE table_name=\'' +
    //  this.table(model) + '\'', null, {}, decoratedTableDataCallback);

    //this.executeSQL(
    //  'SELECT t.relname AS "table", i.relname AS "name", ' +
    //  'am.amname AS "type", ix.indisprimary AS "primary", ' +
    //  'ix.indisunique AS "unique", ' +
    //  'ARRAY(SELECT pg_get_indexdef(ix.indexrelid, k + 1, true) ' +
    //  '  FROM generate_subscripts(ix.indkey, 1) AS k ' +
    //  '  ORDER BY k ) AS "keys", ' +
    //  'ARRAY(SELECT ' +
    //  '  CASE ix.indoption[k] & 1 WHEN 1 THEN \'DESC\' ELSE \'ASC\' END ' +
    //  '  FROM generate_subscripts(ix.indoption, 1) AS k ' +
    //  '  ORDER BY k ' +
    //  ') AS "order" ' +
    //  'FROM pg_class t, pg_class i, pg_index ix, pg_am am ' +
    //  'WHERE t.oid = ix.indrelid AND i.oid = ix.indexrelid AND ' +
    //  'i.relam = am.oid AND ' +
    //  't.relkind=\'r\' AND t.relname=\'' +
    //  this.table(model) + '\'', null, {}, decoratedIndexDataCallback);
  };

  /**
   * Perform autoupdate for the given models
   * @param {String[]} [models] A model name or an array of model names. If not present, apply to all models
   * @callback {Function} [callback] The callback function
   * @param {String|Error} err The error string or object
   */
  Oracle.prototype.autoupdate = function (models, cb) {
    var self = this;
    if ((!cb) && ('function' === typeof models)) {
      cb = models;
      models = undefined;
    }
    // First argument is a model name
    if ('string' === typeof models) {
      models = [models];
    }

    models = models || Object.keys(this._models);

    async.each(models, function (model, done) {
      if (!(model in self._models)) {
        return process.nextTick(function () {
          done(new Error(g.f('Model not found: %s' + model)));
        });
      }
      self.getTableStatus(model, function (err, fields, indexes) {
        if (!err && fields.length) {
          self.alterTable(model, fields, indexes, done);
        } else {
          self.createTable(model, done);
        }
      });
    }, cb);
  };

  /*!
   * Check if the models exist
   * @param {String[]} [models] A model name or an array of model names. If not present, apply to all models
   * @param {Function} [cb] The callback function
   */
  Oracle.prototype.isActual = function (models, cb) {
    var self = this;

    if ((!cb) && ('function' === typeof models)) {
      cb = models;
      models = undefined;
    }
    // First argument is a model name
    if ('string' === typeof models) {
      models = [models];
    }

    models = models || Object.keys(this._models);

    var changes = [];
    async.each(models, function (model, done) {
      self.getTableStatus(model, function (err, fields) {
        changes = changes.concat(self.getAddModifyColumns(model, fields));
        changes = changes.concat(self.getDropColumns(model, fields));
        done(err);
      });
    }, function done(err) {
      if (err) {
        return cb && cb(err);
      }
      var actual = (changes.length === 0);
      cb && cb(null, actual);
    });
  };

  /*!
   * Alter the table for the given model
   * @param {String} model The model name
   * @param {Object[]} actualFields Actual columns in the table
   * @param {Object[]} actualIndexes Actual indexes in the table
   * @param {Function} [cb] The callback function
   */
  Oracle.prototype.alterTable = function (model, actualFields, actualIndexes, cb) {
    var self = this;
    var m = this._models[model];
    var propNames = Object.keys(m.properties).filter(function (name) {
      return !!m.properties;
    });
    var indexNames = m.settings.indexes ? Object.keys(m.settings.indexes).filter(function (name) {
      return !!m.settings.indexes[name];
    }) : [];

    var applyPending = function (actions, cb, err, result) {
      var action = actions.shift();
      var pendingChanges = action && action.call(self, model, actualFields) || [];
      if (pendingChanges.length) {
        self.applySqlChanges(model, pendingChanges, function (err, result) {
          if (!err) {
            applyPending(actions, cb, err, result);
          } else {
            cb(err, result);
          }
        });
      } else if (actions.length) {
        applyPending(actions, cb); // We still have actions to apply
      } else {
        cb(err, result); // All finished
      }
    };
    //applyPending([self.getAddModifyColumns, self.getDropColumns], cb);

    async.series([
      function (cb) {
        applyPending([self.getAddModifyColumns, self.getDropColumns], cb);
      },
      function (cb) {
        // console.log('NOT GOOD ...*****************************************************');
        return cb();
        //self.addIndexes(model, actualIndexes, cb);
      },
    ], function (err, result) {
      cb(err, result[0]);
    });
  };

  Oracle.prototype.getAddModifyColumns = function (model, actualFields) {
    var sql = [];
    var self = this;
    sql = sql.concat(self.getColumnsToAdd(model, actualFields));
    var drops = self.getPropertiesToModify(model, actualFields);
    if (drops.length > 0) {
      if (sql.length > 0) {
        sql = sql.concat(', ');
      }
      sql = sql.concat(drops);
    }
    return sql;
  };

  Oracle.prototype.getDropColumns = function (model, actualFields) {
    var sql = [];
    var self = this;
    // Allowing multiple versions of app to run in parallel
    // and make sure any version of app should not delete column in
    // DB table when a model property is not present in that version
    // of app or properties differ from other versions.
    if (self.settings.dropUnusedColumns) {
      sql = sql.concat(self.getColumnsToDrop(model, actualFields));
    }
    return sql;
  };

  Oracle.prototype.getColumnsToAdd = function (model, actualFields) {
    var self = this;
    var m = self._models[model];
    var propNames = Object.keys(m.properties);
    var sql = [];
    propNames.forEach(function (propName) {
      if (self.id(model, propName)) return;
      var found = self.searchForPropertyInActual(
        model, self.column(model, propName), actualFields);
      if (!found && self.propertyHasNotBeenDeleted(model, propName)) {
        sql.push('ADD ' + self.addPropertyToActual(model, propName));
      }
    });
    if (sql.length > 0) {
      sql = [sql.join(', ')];
    }
    return sql;
  };

  Oracle.prototype.addPropertyToActual = function (model, propName) {
    var self = this;
    var prop = this.getModelDefinition(model).properties[propName];
    var sqlCommand = self.columnEscaped(model, propName)
      + ' ' + self.columnDataType(model, propName) +
      (self.isNullable(prop) ? '' : ' NOT NULL') // + self.columnDbDefault(model, propName);
    return sqlCommand;
  };

  Oracle.prototype.searchForPropertyInActual = function (model, propName, actualFields) {
    var self = this;
    var found = false;
    actualFields.forEach(function (f) {
      if (f.column === self.column(model, propName)) {
        found = f;
        return;
      }
    });
    return found;
  };

  Oracle.prototype.getPropertiesToModify = function (model, actualFields) {
    var self = this;
    var sql = [];
    var m = self._models[model];
    var propNames = Object.keys(m.properties);
    var found;
    propNames.forEach(function (propName) {
      if (self.id(model, propName)) {
        return;
      }
      found = self.searchForPropertyInActual(model, propName, actualFields);
      if (found && self.propertyHasNotBeenDeleted(model, propName)) {
        if (datatypeChanged(propName, found)) {
          sql.push('ALTER COLUMN ' + self.modifyDatatypeInActual(model, propName));
        }
        if (nullabilityChanged(propName, found)) {
          sql.push('ALTER COLUMN ' + self.modifyNullabilityInActual(model, propName));
        }
      }
    });

    if (sql.length > 0) {
      sql = [sql.join(', ')];
    }

    return sql;

    function datatypeChanged(propName, oldSettings) {
      var newSettings = m.properties[propName];
      if (!newSettings) {
        return false;
      }
      var changed = false;
      var newSettings = self.columnDataType(model, propName).toUpperCase();
      if (newSettings && newSettings.indexOf('VARCHAR2') === 0) {
        newSettings = 'VARCHAR2';
        changed = oldSettings.type.toUpperCase() !== newSettings; //self.columnDataType(model, propName).toUpperCase();
      }
      return changed;
    }

    function nullabilityChanged(propName, oldSettings) {
      var newSettings = m.properties[propName];
      if (!newSettings) {
        return false;
      }
      var changed = false;
      if (oldSettings.nullable === 'YES' && !self.isNullable(newSettings) && !newSettings.validateWhen) {
        changed = true;
      }
      if (oldSettings.nullable === 'NO' && self.isNullable(newSettings)) {
        changed = true;
      }
      return changed;
    }
  };

  Oracle.prototype.modifyDatatypeInActual = function (model, propName) {
    var self = this;
    var sqlCommand = self.columnEscaped(model, propName) + ' TYPE ' +
      self.columnDataType(model, propName);
    return sqlCommand;
  };

  Oracle.prototype.modifyNullabilityInActual = function (model, propName) {
    var self = this;
    var prop = this.getPropertyDefinition(model, propName);
    var sqlCommand = self.columnEscaped(model, propName) + ' ';
    if (self.isNullable(prop)) {
      sqlCommand = sqlCommand + 'DROP ';
    } else {
      sqlCommand = sqlCommand + 'SET ';
    }
    sqlCommand = sqlCommand + 'NOT NULL';
    return sqlCommand;
  };

  Oracle.prototype.getColumnsToDrop = function (model, actualFields) {
    var self = this;
    var sql = [];
    actualFields.forEach(function (actualField) {
      if (self.idColumn(model) === actualField.column) {
        return;
      }
      if (actualFieldNotPresentInModel(actualField, model)) {
        sql.push('DROP COLUMN ' + self.escapeName(actualField.column));
      }
    });
    if (sql.length > 0) {
      sql = [sql.join(', ')];
    }
    return sql;

    function actualFieldNotPresentInModel(actualField, model) {
      return !(self.propertyName(model, actualField.column));
    }
  };

  Oracle.prototype.applySqlChanges = function (model, pendingChanges, cb) {
    var self = this;
    if (pendingChanges.length) {
      var thisQuery = 'ALTER TABLE ' + self.tableEscaped(model);
      var ranOnce = false;
      pendingChanges.forEach(function (change) {
        if (ranOnce) {
          thisQuery = thisQuery + ' ';
        }
        thisQuery = thisQuery + ' ' + change;
        ranOnce = true;
      });
      // console.log('ALTER TABLE-->', thisQuery);
      // thisQuery = thisQuery + ';';
      self.executeSQL(thisQuery, [], {}, cb);
    }
  };

  /*!
   * Build a list of columns for the given model
   * @param {String} model The model name
   * @returns {String}
   */
  Oracle.prototype.buildColumnDefinitions =
    Oracle.prototype.propertiesSQL = function (model) {
      var self = this;
      var sql = [];
      var pks = this.idNames(model).map(function (i) {
        return self.columnEscaped(model, i);
      });
      Object.keys(this.getModelDefinition(model).properties).forEach(function (prop) {
        var colName = self.columnEscaped(model, prop);
        sql.push(colName + ' ' + self.buildColumnDefinition(model, prop));
      });
      if (pks.length > 0) {
        sql.push('PRIMARY KEY(' + pks.join(',') + ')');
      }
      return sql.join(',\n  ');
    };

  /*!
   * Build settings for the model property
   * @param {String} model The model name
   * @param {String} propName The property name
   * @returns {*|string}
   */
  Oracle.prototype.buildColumnDefinition = function (model, propName) {
    var self = this;
    var modelDef = this.getModelDefinition(model);
    var prop = modelDef.properties[propName];
    //Atul : ids are autogenerated with sys_buid() as default
    if (prop.id && prop.generated) {
      return 'varchar2(50) default sys_guid() not null';
      //return 'text NOT NULL DEFAULT uuid_generate_v4()';
    }
    var result = self.columnDataType(model, propName);
    function getDefaultValue(prop) {
      if (prop.default) {
        if (prop.type.name === 'Boolean')
          return prop.default ? "  default '1' " : " default '0' ";
        else if (prop.type.name === 'String' || prop.type.name === 'Number')
          return " default '" + prop.default + "' ";
      }
      return '';
    }
    result += getDefaultValue(prop);
    
    if (!self.isNullable(prop) && !prop.validateWhen) result = result + ' NOT NULL';


    //result += self.columnDbDefault(model, propName);
    return result;
  };

  /*!
   * Create a table for the given model
   * @param {String} model The model name
   * @param {Function} [cb] The callback function
   */
  Oracle.prototype.createTable = function (model, cb) {
    var self = this;
    var name = self.tableEscaped(model);

    self.executeSQL('CREATE TABLE  ' + name + ' (\n  ' +
      self.propertiesSQL(model) + '\n)', [], {},
      function (err, info) {
        //Atul : Ignore error if table already exists. .there is no support 'if exists' in Oracle.
        if (err && err.message && err.message.indexOf('Error: ORA-00955') !== 0 ) {
          // console.log('CREATE TABLE ERROR ', err);
          return cb(err, info);
        }
        self.addIndexes(model, undefined, cb);
      }
    );

  };

  Oracle.prototype.buildIndex = function (model, property) {
    var prop = this.getModelDefinition(model).properties[property];
    var i = prop && prop.index;
    if (!i) {
      return '';
    }
    var type = '';
    var kind = '';
    if (i.type) {
      type = 'USING ' + i.type;
    }
    if (i.kind) {
      kind = i.kind;
    }
    var columnName = this.columnEscaped(model, property);
    if (kind && type) {
      return (kind + ' INDEX ' + columnName + ' (' + columnName + ') ' + type);
    } else {
      (typeof i === 'object' && i.unique && i.unique === true) && (kind = 'UNIQUE');
      return (kind + ' INDEX ' + columnName + ' ' + type + ' (' + columnName + ') ');
    }
  };

  Oracle.prototype.buildIndexes = function (model) {
    var self = this;
    var indexClauses = [];
    var definition = this.getModelDefinition(model);
    var indexes = definition.settings.indexes || {};
    // Build model level indexes
    for (var index in indexes) {
      var i = indexes[index];
      var type = '';
      var kind = '';
      if (i.type) {
        type = 'USING ' + i.type;
      }
      if (i.kind) {
        kind = i.kind;
      }
      var indexedColumns = [];
      var indexName = this.escapeName(index);
      if (Array.isArray(i.keys)) {
        indexedColumns = i.keys.map(function (key) {
          return self.columnEscaped(model, key);
        });
      }
      var columns = indexedColumns.join(',') || i.columns;
      if (kind && type) {
        indexClauses.push(kind + ' INDEX ' + indexName + ' (' + columns + ') ' + type);
      } else {
        indexClauses.push(kind + ' INDEX ' + type + ' ' + indexName + ' (' + columns + ')');
      }
    }

    // Define index for each of the properties
    for (var p in definition.properties) {
      var propIndex = self.buildIndex(model, p);
      if (propIndex) {
        indexClauses.push(propIndex);
      }
    }
    return indexClauses;
  };

  /*!
   * Get the database-default value for column from given model property.
   * Falls back to LDL's prop.default.
   *
   * @param {String} model The model name
   * @param {String} property The property name
   * @returns {String} The column default value
   */
  Oracle.prototype.columnDbDefault = function (model, property) {
    var columnMetadata = this.columnMetadata(model, property);
    var colDefault = columnMetadata && columnMetadata.dbDefault;
    if (!colDefault) {
      var prop = this.getModelDefinition(model).properties[property];
      if (prop.hasOwnProperty('default')) {
        colDefault = String(this.escapeValue(prop.default));
      }
    }

    return colDefault ? (' DEFAULT ' + colDefault) : '';
  };

  /*!
   * Find the column type for a given model property
   *
   * @param {String} model The model name
   * @param {String} property The property name
   * @returns {String} The column type
   */
  Oracle.prototype.columnDataType = function (model, property) {
    var columnMetadata = this.columnMetadata(model, property);
    var colType = columnMetadata && columnMetadata.dataType;
    if (colType) {
      colType = colType.toUpperCase();
    }
    var prop = this.getModelDefinition(model).properties[property];
    if (!prop) {
      return null;
    }
    var colLength = columnMetadata && columnMetadata.dataLength || prop.length;
    if (colType) {
      return colType + (colLength ? '(' + colLength + ')' : '');
    }

    // if type is array return CLOB or BLOB with JSON Constraint
    // if type is object, model or json, return CLOB/BLOB with JSON constraint.
    // constraint name will not work in oracle < 12.2 
    switch (prop.type.name) {
      default:
      case 'String':
        if (Array.isArray(prop.type) && !prop.type.name && prop.type[0].name) {
          var tempColumnType = prop.type[0].name.toLowerCase();
          switch (tempColumnType) {
            case "string":
            case "number":
            case "boolean":
            case "modelconstructor":
            case "object":
              var constraintName = model + "_" + property;
              //var constraintName = "C" + u.toString();
              //constraintName = constraintName.substr(0, 25);
              return "CLOB CONSTRAINT \"" + constraintName + "\" CHECK (\"" + property.toUpperCase() + "\" IS JSON FORMAT JSON)";
          }
          //if (prop.type[0].name.toLowerCase() === 'string')
          //  return 'varchar_array';
          //else if (prop.type[0].name.toLowerCase() === 'number')
          //  return 'number_array';
          //else if (prop.type[0].name.toLowerCase() === 'boolean')
          //  return 'varchar_array';
          //else if (prop.type[0].name.toLowerCase() === 'date')
          //  return 'TIMESTAMP WITH TIME ZONE[]';
          //else if (prop.type[0].name.toLowerCase() === 'object')
          //  return 'object_array';
          //else if (prop.type[0].name.toLowerCase() === 'modelconstructor')
          //  return 'object_array';
        }
        return 'VARCHAR2' + (colLength ? '(' + colLength + ')' : '(4000)');
      case 'ModelConstructor':
      case 'object':
      case 'Object':
      case 'JSON':
        //var u = uuid.v4();
        var constraintName = model + "_" + property;
        //var constraintName = "C" + u.toString();
        //constraintName = constraintName.substr(0, 25);
        return "CLOB CONSTRAINT \"" + constraintName + "\" CHECK (\"" + property.toUpperCase() + "\" IS JSON FORMAT JSON)";

      case 'Text':
        return 'CLOB' ;//+ (colLength ? '(' + colLength + ')' : '(5000)');
      case 'Number':
        return 'NUMBER';
      case 'Date':
      case 'Timestamp':
        return 'TIMESTAMP(3)';
      case 'GeoPoint':
      case 'Point':
        return 'POINT';
      case 'Boolean':
        return 'CHAR(1)'; // PostgreSQL doesn't have built-in boolean
      case 'uuid':
        return 'uuid';
    }
  };

  /*!
   * Map postgresql data types to json types
   * @param {String} postgresqlType
   * @param {Number} dataLength
   * @returns {String}
   */
  function oracleDataTypeToJSONType(oracleType, dataLength) {
    var type = oracleType.toUpperCase();
    switch (type) {
      case 'BOOLEAN':
        return 'Boolean';

      /*
       - character varying(n), varchar(n)	variable-length with limit
       - character(n), char(n)	fixed-length, blank padded
       - text	variable unlimited length
       */
      case 'VARCHAR':
      case 'CHARACTER VARYING':
      case 'CHARACTER':
      case 'CHAR':
      case 'TEXT':
        return 'String';

      case 'BYTEA':
        return 'Binary';
      /*
       - smallint	2 bytes	small-range integer	-32768 to +32767
       - integer	4 bytes	typical choice for integer	-2147483648 to +2147483647
       - bigint	8 bytes	large-range integer	-9223372036854775808 to 9223372036854775807
       - decimal	variable	user-specified precision, exact	no limit
       - numeric	variable	user-specified precision, exact	no limit
       - real	4 bytes	variable-precision, inexact	6 decimal digits precision
       - double precision	8 bytes	variable-precision, inexact	15 decimal digits precision
       - serial	4 bytes	autoincrementing integer	1 to 2147483647
       - bigserial	8 bytes	large autoincrementing integer	1 to 9223372036854775807
       */
      case 'SMALLINT':
      case 'INTEGER':
      case 'BIGINT':
      case 'DECIMAL':
      case 'NUMERIC':
      case 'REAL':
      case 'DOUBLE':
      case 'SERIAL':
      case 'BIGSERIAL':
        return 'Number';

      /*
       - timestamp [ (p) ] [ without time zone ]	8 bytes	both date and time (no time zone)	4713 BC	294276 AD	1 microsecond / 14 digits
       - timestamp [ (p) ] with time zone	8 bytes	both date and time, with time zone	4713 BC	294276 AD	1 microsecond / 14 digits
       - date	4 bytes	date (no time of day)	4713 BC	5874897 AD	1 day
       - time [ (p) ] [ without time zone ]	8 bytes	time of day (no date)	00:00:00	24:00:00	1 microsecond / 14 digits
       - time [ (p) ] with time zone	12 bytes	times of day only, with time zone	00:00:00+1459	24:00:00-1459	1 microsecond / 14 digits
       - interval [ fields ] [ (p) ]	12 bytes	time interval	-178000000 years	178000000 years	1 microsecond / 14 digits
       */
      case 'DATE':
      case 'TIMESTAMP':
      case 'TIME':
      case 'TIME WITH TIME ZONE':
      case 'TIME WITHOUT TIME ZONE':
      case 'TIMESTAMP WITH TIME ZONE':
      case 'TIMESTAMP WITHOUT TIME ZONE':
        return 'Date';

      case 'POINT':
        return 'GeoPoint';

      default:
        return 'String';
    }
  }

  function mapOracleDatatypes(typeName, typeLength) {
    if (typeName.toUpperCase() === 'CHARACTER VARYING' || typeName.toUpperCase() === 'VARCHAR') {
      return typeLength ? 'VARCHAR(' + typeLength + ')' : 'VARCHAR(1024)';
    } else {
      return typeName;
    }
  }

  Oracle.prototype.propertyHasNotBeenDeleted = function (model, propName) {
    return !!this.getModelDefinition(model).properties[propName];
  };

  Oracle.prototype.addIndexes = function (model, actualIndexes, cb) {
    var self = this;
    var m = self._models[model];
    var propNames = Object.keys(m.properties).filter(function (name) {
      return !!m.properties[name];
    });
    var indexNames = m.settings.indexes && Object.keys(m.settings.indexes).filter(function (name) {
      return !!m.settings.indexes[name];
    }) || [];
    var sql = [];
    var ai = {};
    var propNameRegEx = new RegExp('^' + self.table(model) + '_([^_]+)_idx');
    
    if (actualIndexes) {
      actualIndexes.forEach(function (i) {
        var name = i.name;
        if (!ai[name]) {
          ai[name] = i;
        }
      });
    }
    var aiNames = Object.keys(ai);

    var deletedIndexes = [];
    // remove indexes
    aiNames.forEach(function (indexName) {
      var i = ai[indexName];
      var propName = propNameRegEx.exec(indexName);
      var si; // index definition from model schema

      if (i.primary || (m.properties[indexName] && self.id(model, indexName))) return;

      propName = propName && self.propertyName(model, propName[1]) || null;
      if (!(indexNames.indexOf(indexName) > -1) && !(propName && m.properties[propName] &&
        m.properties[propName].index)) {
        sql.push('DROP INDEX ' + self.escapeName(indexName));
        // Deleting entry from actual indexes, which will be checked later to create new indexes.
        delete ai[indexName];
        deletedIndexes.push(indexName);
      } else {
        // The index was found, verify that database matches what we're expecting.
        // first: check single column indexes.
        if (propName) {
          // If this property has an index definition, verify that it matches
          if (m.properties[propName] && (si = m.properties[propName].index)) {
            if (
              (typeof si === 'object') &&
              !((!si.type || si.type === ai[indexName].type) && (!si.unique || si.unique === ai[indexName].unique))
            ) {
              // Drop the index if the type or unique differs from the actual table
              sql.push('DROP INDEX ' + self.escapeName(indexName));
              delete ai[indexName];
              deletedIndexes.push(indexName);
            }
          }
        } else {
          // second: check other indexes
          si = normalizeIndexDefinition(m.settings.indexes[indexName]);

          var identical =
            (!si.type || si.type === i.type) && // compare type
            ((si.options && !!si.options.unique) === i.unique); // compare unique

          // if this is a multi-column query, verify that the order matches
          var siKeys = Object.keys(si.keys);
          if (identical && siKeys.length > 1) {
            if (siKeys.length !== i.keys.length) {
              // lengths differ, obviously non-matching
              orderMatched = false;
            } else {
              siKeys.forEach(function (propName, iter) {
                identical = identical && self.column(model, propName) === i.keys[iter];
              });
            }
          }

          if (!identical) {
            sql.push('DROP INDEX ' + self.escapeName(indexName));
            delete ai[indexName];
            deletedIndexes.push(indexName);
          }
        }
      }
    });

    // add single-column indexes
    propNames.forEach(function (propName) {
      var i = m.properties[propName].index;
      if (!i) {
        return;
      }
      if (Array.isArray(m.properties[propName].type )|| m.properties[propName].type.name === 'Object') {
        return;
      }
      if (m.properties[propName].oracle && m.properties[propName].oracle.dataType === 'CLOB') {
        return
      }

      // The index name used should match the default naming scheme
      // by postgres: <column>_<table>_idx
      var iName = [self.table(model), self.column(model, propName), 'idx'].join('_');

      var found = ai[iName]; // && ai[iName].info;
      if (!found && deletedIndexes.indexOf(iName) === -1) {
        var pName = self.escapeName(self.column(model, propName));
        var type = '';
        var kind = '';
        if (i.type) {
          type = ' USING ' + i.type;
        }
        if (i.kind) {
          kind = i.kind;
        }

        if (!kind && !type && typeof i === 'object' || i.unique && i.unique === true) {
          kind = ' UNIQUE ';
        }

        sql.push('CREATE ' + kind + ' INDEX ' + self.escapeName(iName) + ' ON ' + self.tableEscaped(model) +
          type + ' ( ' + pName + ' )');
      } else {
        for (var i = sql.length - 1; i >= 0; i--) {
          if (sql[i] === 'DROP INDEX ' + self.escapeName(iName)) {
            sql.splice(i, 1);
          }
        }
      }
    });

    // add multi-column indexes
    indexNames.forEach(function (indexName) {
      var i = m.settings.indexes[indexName];
      var found = ai[indexName];
      if (!found && deletedIndexes.indexOf(indexName) === -1) {
        i = normalizeIndexDefinition(i);
        var iName = self.escapeName(indexName);
        var columns = i.keys.map(function (key) {
          return self.escapeName(self.column(model, key[0])) + (key[1] ? ' ' + key[1] : '');
        }).join(', ');

        var type = '';
        var kind = '';
        if (i.type) {
          type = ' USING ' + i.type;
        }
        if (i.kind) {
          kind = i.kind;
        }

        if (i.options && i.options.unique && i.options.unique === true) {
          kind = ' UNIQUE ';
        }

        sql.push('CREATE ' + kind + ' INDEX ' + iName + ' ON ' + self.tableEscaped(model) +
          type + ' ( ' + columns + ')');
      } else {
        for (var i = sql.length - 1; i >= 0; i--) {
          if (sql[i] === 'DROP INDEX ' + self.escapeName(indexName)) {
            sql.splice(i, 1);
          }
        }
      }
    });
    if (sql.length > 0) {
      //console.log(sql.join('\n\n'));

      var self = this;
      if (sql.length == 1) {
        this.executeSQL(sql[0], [], {}, function (err, info) {
          if (err) {
            console.log("WARNING !!! Could not create index on ", model, ' ', err);
          }
          return cb();
        });
      }
      else {
         //Atul : Create indexes in parallel if there is more than one index.
         // Oracle wouldn't support to create multiple indexes in one go.
        async.each(sql, function (s, callback) {
          self.executeSQL(s, [], {}, function (err, info) {
            if (err) {
              console.log("WARNING !!! Could not create index on ", model, ' ', err);
            }
            return callback();
          });
        }, function (err) {
          return cb(err);
        });
      }
      //this.query(sql.join(';\n'), cb);
    } else {
      cb();
    }
  };

  function normalizeIndexKeyDefinition(keys) {
    // normalize:
    //  {'column1': -1, 'column2': 1}
    //  'column1 DESC, column2 ASC'   (this is undocumented but used by mysql connector)
    //  ['column1 DESC', 'column2 ASC']
    // to:
    //  [['column1', 'DESC'], ['column2', 'ASC']]
    //
    // normalize:
    //  ['column1', 'column2']
    // to:
    //  [['column1', 'ASC'], ['column2', 'ASC']]
    var column;
    var attribs;
    var parts;
    var result;

    // Default is ASC
    if (typeof keys === 'string') {
      result = keys.split(',').map(function (key) {
        parts = key.trim().split(' ');
        column = parts[0].trim();
        attribs = parts.slice(1).join(' ');
        return column && [column, attribs];
      }).filter(function (key) {
        return key.length;
      });
    } else if (typeof keys.length === 'undefined') {
      result = Object.keys(keys).map(function (column) {
        attribs = keys[column] === -1 ? 'DESC' : 'ASC';
        return column && [column, attribs];
      });
    } else if (keys && keys.length) {
      result = keys.map(function (column) {
        if (typeof column === 'string') {
          // must be something like 'column1 ASC' or 'column1'
          parts = column.trim().split(' ');
          column = parts[0].trim();
          attribs = parts.slice(1).join(' ');
          return column && [column, attribs];
        } else {
          return column;
        }
        return column && [column, 'ASC'];
      });
    } else {
      throw Error(g.f('{{Index keys}} definition appears to be invalid: %s', keys));
    }

    return result;
  }

  function normalizeIndexDefinition(index) {
    if (typeof index === 'object' && index.keys) {
      // Full form
      index.options = index.options || {};
      index.keys = normalizeIndexKeyDefinition(index.keys);
      return index;
    }

    return {
      keys: normalizeIndexKeyDefinition(index.keys && index.keys || index),
      options: {},
    };
  }
}