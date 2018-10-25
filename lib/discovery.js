// Copyright IBM Corp. 2013,2015. All Rights Reserved.
// Node module: loopback-connector-oracle
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';
var g = require('strong-globalize')();
var async = require('async');

module.exports = mixinDiscovery;

function mixinDiscovery(Oracle) {
  /*!
   * Create a SQL statement that supports pagination
   * @param {String} sql The SELECT statement that supports pagination
   * @param {String} orderBy The 'order by' columns
   * @param {Object} options options
   * @returns {String} The SQL statement
   */
  Oracle.prototype.paginateSQL = function (sql, orderBy, options) {
    var pagination = getPagination(options);
    orderBy = orderBy || '1';
    if (pagination.length) {
      return 'SELECT * FROM (SELECT ROW_NUMBER() OVER (ORDER BY ' + orderBy +
        ') R, ' + sql.substring(7) + ') WHERE ' + pagination.join(' AND ');
    } else {
      return sql;
    }
  };

  /*!
   * Build sql for listing tables
   * @param options {all: for all owners, owner: for a given owner}
   * @returns {string} The sql statement
   */
  Oracle.prototype.queryTables = function queryTables(options) {
    var sqlTables = null;
    var owner = options.owner || options.schema;

    if (options.all && !owner) {
      sqlTables = this.paginateSQL('SELECT \'table\' AS "type", ' +
        'table_name AS "name", ' +
        'owner AS "owner" FROM all_tables', 'owner, table_name', options);
    } else if (owner) {
      sqlTables = this.paginateSQL('SELECT \'table\' AS "type", ' +
        'table_name AS "name", ' +
        'owner AS "owner" FROM all_tables WHERE owner=\'' + owner + '\'',
        'owner, table_name', options);
    } else {
      sqlTables = this.paginateSQL('SELECT \'table\' AS "type", ' +
        'table_name AS "name", SYS_CONTEXT(\'USERENV\',' +
        ' \'SESSION_USER\') AS "owner" FROM user_tables',
        'table_name', options);
    }
    return sqlTables;
  };

  /*!
   * Build sql for listing views
   * @param options {all: for all owners, owner: for a given owner}
   * @returns {string} The sql statement
   */
  Oracle.prototype.queryViews = function queryViews(options) {
    var sqlViews = null;
    if (options.views) {
      var owner = options.owner || options.schema;

      if (options.all && !owner) {
        sqlViews = this.paginateSQL('SELECT \'view\' AS "type", ' +
          'view_name AS "name", owner AS "owner" FROM all_views',
          'owner, view_name', options);
      } else if (owner) {
        sqlViews = this.paginateSQL('SELECT \'view\' AS "type", ' +
          'view_name AS "name", owner AS "owner" FROM all_views ' +
          'WHERE owner=\'' + owner + '\'',
          'owner, view_name', options);
      } else {
        sqlViews = this.paginateSQL('SELECT \'view\' AS "type", ' +
          'view_name AS "name", SYS_CONTEXT(\'USERENV\', \'SESSION_USER\')' +
          ' AS "owner" FROM user_views', 'view_name', options);
      }
    }
    return sqlViews;
  };

  /**
   * Discover model definitions
   *
   * @param {Object} options Options for discovery
   * @param {Function} [cb] The callback function
   */
  Oracle.prototype.discoverModelDefinitions = function (options, cb) {
    if (!cb && typeof options === 'function') {
      cb = options;
      options = {};
    }
    options = options || {};

    var self = this;
    var calls = [function (callback) {
      self.execute(queryTables(options), callback);
    }];

    if (options.views) {
      calls.push(function (callback) {
        self.execute(queryViews(options), callback);
      });
    }
    async.parallel(calls, function (err, data) {
      if (err) {
        cb(err, data);
      } else {
        var merged = [];
        merged = merged.concat(data.shift());
        if (data.length) {
          merged = merged.concat(data.shift());
        }
        cb(err, merged);
      }
    });
  };

  /*!
   * Normalize the arguments
   * @param table string, required
   * @param options object, optional
   * @param cb function, optional
   */
  function getArgs(table, options, cb) {
    if ('string' !== typeof table || !table) {
      throw new Error(g.f('{{table}} is a required string argument: %s',
        table));
    }
    options = options || {};
    if (!cb && 'function' === typeof options) {
      cb = options;
      options = {};
    }
    if (typeof options !== 'object') {
      throw new Error(g.f('{{options}} must be an {{object}}: %s', options));
    }
    return {
      owner: options.owner || options.schema,
      table: table,
      options: options,
      cb: cb,
    };
  };

  /*!
   * Build the sql statement to query columns for a given table
   * @param owner
   * @param table
   * @returns {String} The sql statement
   */
  Oracle.prototype.queryColumns = function queryColumns(owner, table) {
    var sql = null;
    if (owner) {
      sql = this.paginateSQL('SELECT owner AS "owner", table_name AS ' +
        ' "tableName", column_name AS "columnName", data_type AS "dataType",' +
        ' data_length AS "dataLength", data_precision AS "dataPrecision",' +
        ' data_scale AS "dataScale", nullable AS "nullable"' +
        ' FROM all_tab_columns' +
        ' WHERE owner=\'' + owner + '\'' +
        (table ? ' AND table_name=\'' + table + '\'' : ''),
        'table_name, column_id', {});
    } else {
      sql = this.paginateSQL('SELECT' +
        ' SYS_CONTEXT(\'USERENV\', \'SESSION_USER\') ' +
        ' AS "owner", table_name AS "tableName", column_name AS "columnName",' +
        ' data_type AS "dataType",' +
        ' data_length AS "dataLength", data_precision AS "dataPrecision",' +
        ' data_scale AS "dataScale", nullable AS "nullable"' +
        ' FROM user_tab_columns' +
        (table ? ' WHERE table_name=\'' + table + '\'' : ''),
        'table_name, column_id', {});
    }
    return sql;
  };


  /**
   * Discover model properties from a table
   * @param {String} table The table name
   * @param {Object} options The options for discovery
   * @param {Function} [cb] The callback function
   *
   */
  Oracle.prototype.discoverModelProperties = function (table, options, cb) {
    var args = getArgs(table, options, cb);
    var owner = args.owner;
    table = args.table;
    options = args.options;
    cb = args.cb;

    var sql = this.queryColumns(owner, table);
    var callback = function (err, results) {
      if (err) {
        cb(err, results);
      } else {
        results.map(function (r) {
          r.type = mysqlDataTypeToJSONType(r.dataType, r.dataLength);
        });
        cb(err, results);
      }
    };
    this.execute(sql, callback);
  };


  /*
   SELECT kc.table_schema AS "owner", kc.table_name AS "tableName",
   kc.column_name AS "columnName", kc.ordinal_position AS "keySeq",
   kc.constraint_name AS "pkName" FROM information_schema.key_column_usage kc
   JOIN information_schema.table_constraints tc ON kc.table_name = tc.table_name
   AND kc.table_schema = tc.table_schema AND kc.constraint_name = tc.constraint_name
   WHERE tc.constraint_type='PRIMARY KEY' AND kc.table_name='inventory'
   ORDER BY kc.table_schema, kc.table_name, kc.ordinal_position
   */

  /*!
   * Build the sql statement for querying primary keys of a given table
   * @param owner
   * @param table
   * @returns {string}
   */
  function queryForPrimaryKeys(owner, table) {
    var sql = 'SELECT uc.owner AS "owner", ' +
      'uc.table_name AS "tableName", col.column_name AS "columnName",' +
      ' col.position AS "keySeq", uc.constraint_name AS "pkName" FROM' +
      (owner ?
        ' ALL_CONSTRAINTS uc, ALL_CONS_COLUMNS col' :
        ' USER_CONSTRAINTS uc, USER_CONS_COLUMNS col') +
      ' WHERE uc.constraint_type=\'P\' AND ' +
      'uc.constraint_name=col.constraint_name';

    if (owner) {
      sql += ' AND uc.owner=\'' + owner + '\'';
    }
    if (table) {
      sql += ' AND uc.table_name=\'' + table + '\'';
    }
    sql += ' ORDER BY uc.owner, col.constraint_name, uc.table_name, ' +
      'col.position';
    return sql;
  };

  /**
   * Discover primary keys for a given table
   * @param {String} table The table name
   * @param {Object} options The options for discovery
   * @param {Function} [cb] The callback function
   */
  Oracle.prototype.discoverPrimaryKeys = function (table, options, cb) {
    var args = getArgs(table, options, cb);
    var owner = args.owner;
    table = args.table;
    options = args.options;
    cb = args.cb;

    var sql = queryForPrimaryKeys(owner, table);
    this.execute(sql, cb);
  };

  /*
   SELECT
   tc.constraint_name, tc.table_name, kcu.column_name,
   ccu.table_name AS foreign_table_name,
   ccu.column_name AS foreign_column_name
   FROM
   information_schema.table_constraints AS tc
   JOIN information_schema.key_column_usage AS kcu
   ON tc.constraint_name = kcu.constraint_name
   JOIN information_schema.constraint_column_usage AS ccu
   ON ccu.constraint_name = tc.constraint_name
   WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name='mytable';
   */

  /*!
   * Build the sql statement for querying foreign keys of a given table
   * @param owner
   * @param table
   * @returns {string}
   */
  function queryForeignKeys(owner, table) {
    var sql =
      'SELECT a.owner AS "fkOwner", a.constraint_name AS "fkName", ' +
      'a.table_name AS "fkTableName", a.column_name AS "fkColumnName", ' +
      'a.position AS "keySeq", jcol.owner AS "pkOwner", ' +
      'jcol.constraint_name AS "pkName", jcol.table_name AS "pkTableName", ' +
      'jcol.column_name AS "pkColumnName"' +
      ' FROM' +
      ' (SELECT' +
      ' uc.owner, uc.table_name, uc.constraint_name, uc.r_constraint_name, ' +
      'col.column_name, col.position' +
      ' FROM' +
      (owner ?
        ' ALL_CONSTRAINTS uc, ALL_CONS_COLUMNS col' :
        ' USER_CONSTRAINTS uc, USER_CONS_COLUMNS col') +
      ' WHERE' +
      ' uc.constraint_type=\'R\' and uc.constraint_name=col.constraint_name';
    if (owner) {
      sql += ' AND uc.owner=\'' + owner + '\'';
    }
    if (table) {
      sql += ' AND uc.table_name=\'' + table + '\'';
    }
    sql += ' ) a' +
      ' INNER JOIN' +
      ' USER_CONS_COLUMNS jcol' +
      ' ON' +
      ' a.r_constraint_name=jcol.constraint_name';
    return sql;
  };

  /**
  * Discover foreign keys for a given table
  * @param {String} table The table name
  * @param {Object} options The options for discovery
  * @param {Function} [cb] The callback function
  */
  Oracle.prototype.discoverForeignKeys = function (table, options, cb) {
    var args = getArgs(table, options, cb);
    var owner = args.owner;
    table = args.table;
    options = args.options;
    cb = args.cb;

    var sql = queryForeignKeys(owner, table);
    this.execute(sql, cb);
  };

  /*!
   * Retrieves a description of the foreign key columns that reference the given table's primary key columns (the foreign keys exported by a table).
   * They are ordered by fkTableOwner, fkTableName, and keySeq.
   * @param owner
   * @param table
   * @returns {string}
   */
  function queryExportedForeignKeys(owner, table) {
    var sql = 'SELECT a.constraint_name AS "fkName", a.owner AS "fkOwner", ' +
      'a.table_name AS "fkTableName",' +
      ' a.column_name AS "fkColumnName", a.position AS "keySeq",' +
      ' jcol.constraint_name AS "pkName", jcol.owner AS "pkOwner",' +
      ' jcol.table_name AS "pkTableName", jcol.column_name AS "pkColumnName"' +
      ' FROM' +
      ' (SELECT' +
      ' uc1.table_name, uc1.constraint_name, uc1.r_constraint_name, ' +
      'col.column_name, col.position, col.owner' +
      ' FROM' +
      (owner ?
        ' ALL_CONSTRAINTS uc, ALL_CONSTRAINTS uc1, ALL_CONS_COLUMNS col' :
        ' USER_CONSTRAINTS uc, USER_CONSTRAINTS uc1, USER_CONS_COLUMNS col') +
      ' WHERE' +
      ' uc.constraint_type=\'P\' and' +
      ' uc1.r_constraint_name = uc.constraint_name and' +
      ' uc1.constraint_type = \'R\' and' +
      ' uc1.constraint_name=col.constraint_name';
    if (owner) {
      sql += ' and col.owner=\'' + owner + '\'';
    }
    if (table) {
      sql += ' and uc.table_Name=\'' + table + '\'';
    }
    sql += ' ) a' +
      ' INNER JOIN' +
      ' USER_CONS_COLUMNS jcol' +
      ' ON' +
      ' a.r_constraint_name=jcol.constraint_name' +
      ' order by a.owner, a.table_name, a.position';

    return sql;
  };

  /**
   * Discover foreign keys that reference to the primary key of this table
   * @param {String} table The table name
   * @param {Object} options The options for discovery
   * @param {Function} [cb] The callback function
   */
  Oracle.prototype.discoverExportedForeignKeys = function (table, options, cb) {
    var args = getArgs(table, options, cb);
    var owner = args.owner;
    table = args.table;
    options = args.options;
    cb = args.cb;

    var sql = queryExportedForeignKeys(owner, table);
    this.execute(sql, cb);
  };

  /*!
   * Map oracle data types to json types
   * @param {String} oracleType
   * @param {Number} dataLength
   * @returns {String}
   */
  function mysqlDataTypeToJSONType(mysqlType, dataLength) {
    var type = mysqlType.toUpperCase();
    switch (type) {
      case 'CHAR':
        if (dataLength === 1) {
          // Treat char(1) as boolean
          return 'Boolean';
        } else {
          return 'String';
        }
        break;
      case 'VARCHAR':
      case 'VARCHAR2':
      case 'LONG VARCHAR':
      case 'NCHAR':
      case 'NVARCHAR2':
        return 'String';
      case 'LONG':
      case 'BLOB':
      case 'CLOB':
      case 'NCLOB':
        return 'Binary';
      case 'NUMBER':
      case 'INTEGER':
      case 'DECIMAL':
      case 'DOUBLE':
      case 'FLOAT':
      case 'BIGINT':
      case 'SMALLINT':
      case 'REAL':
      case 'NUMERIC':
      case 'BINARY_FLOAT':
      case 'BINARY_DOUBLE':
      case 'UROWID':
      case 'ROWID':
        return 'Number';
      case 'DATE':
      case 'TIMESTAMP':
        return 'Date';
      default:
        return 'String';
    }
  };

  /**
    * Discover database indexes for the specified table
    * @param {String} table The table name
    * @param {Function} [cb] The callback function
    */
  Oracle.prototype.discoverModelIndexes = function (model, cb) {
    this.getTableStatus(model, function (err, fields, indexes) {
      var indexData = {};
      indexes.forEach(function (index) {
        indexData[index.name] = index;
        delete index.name;
      });
      cb(err, indexData);
    });
  };

  function getPagination(filter) {
    var pagination = [];
    if (filter && (filter.limit || filter.offset || filter.skip)) {
      var offset = Number(filter.offset);
      if (!offset) {
        offset = Number(filter.skip);
      }
      if (offset) {
        pagination.push('R >= ' + (offset + 1));
      } else {
        offset = 0;
      }
      var limit = Number(filter.limit);
      if (limit) {
        pagination.push('R <= ' + (offset + limit));
      }
    }
    return pagination;
  }

  Oracle.prototype.buildQuerySchemas = function (options) {
    var sql = 'select username from SYS.all_users';
    return this.paginateSQL(sql, 'username', options);
  };

}
