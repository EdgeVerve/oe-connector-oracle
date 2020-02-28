const should = require('should');
let db = null;
describe('Auto-create schema with sequence support', function() {
  before(function(done) {
    db = global.getDataSource();
    
    // simple sequence
    db.define('TestSchema2', {
      reservationId: {
        type: 'number',
        oracle: {
          sequence: {
            type: 'simple',
            name: 'reservation_sequence'
          }
        },
        id: true
      },
      firstName: "string",
      "lastName":"string"
    });

    // complex sequence
    db.define('TestSchema3', {
      reservationId : {
        type: 'string',
        oracle: {
          sequence: {
            type: 'complex',
            prefix: 'LMB',
            name: 'reservation_sequence',
            length: 10,
          }
        },
        id: true
      },
      firstName: 'string',
      lastName: 'string'
    });

    db.automigrate(function(error){      
      done(error)
    });
  });  

  describe('simple sequence', function() {

    it('asserts that the reservationid is a column created and it has sequence suppport in testschema2', function(done){
      // let connector = db.connector;
      // let query = 'SELECT column_default FROM INFORMATION_SCHEMA.columns WHERE table_name = \'testschema2\' and column_name = \'reservationid\'';
      let query = 'SELECT data_default FROM USER_TAB_COLS WHERE table_name = \'TESTSCHEMA2\' and COLUMN_NAME = \'RESERVATIONID\'';
      
      db.connector.executeSQL(query, [], {}, function(err, results) {
        if(err) {
          done(err)
        }
        else {
          results.length.should.equal(1);
          results[0].DATA_DEFAULT.includes('RESERVATION_SEQUENCE').should.be.true();
          done();
        }
      });    
    });

    it('asserts that the sequence object is created in database', done => {
      let query = 'select * from USER_sequences where sequence_name = \'RESERVATION_SEQUENCE\'';
      db.connector.executeSQL(query, [], {}, function(err, results) {
        if(err) {
          done(err);
        }
        else {
          // console.dir(results);
          results.length.should.equal(1);
          // results[0].sequence_name.should.exist;
          should.exist(results[0].SEQUENCE_NAME);
          results[0].SEQUENCE_NAME.should.equal('RESERVATION_SEQUENCE');
          done();
        }
      });
    });

    it('asserts that the created sequence increments by 1', done => {
      var Model = db.models['TestSchema2'];
      var data = [
        { firstName: 'John', lastName: 'Doe' },
        { firstName: 'Jane', lastName: 'Contoso' }
      ];

      Model.create(data, function(err, results) {
        if(err) {
          done(err);
        }
        else {
          results.length.should.equal(2);
          console.log('fetch1:', results);
          db.connector.executeSQL('select reservation_sequence.currval as last_value FROM dual', [], {}, function(err, res){
            if(err) {
              done(err);
            }
            else {
              console.log('fetch2:', res);
              res[0].LAST_VALUE.should.equal(2);
              done();
            }
          });
        }
      });
    });
  });

  describe('complex sequence', function(){
    it('should have created the table in the db', done => {
      let query = 'select count(*) as has_table from user_tables where table_name = \'TESTSCHEMA3\'';
      db.connector.executeSQL(query, [], {}, function(err, result) {
        if(err) {
          done(err);
        }
        else {
          // console.dir(result);
          result.length.should.equal(1);
          result[0].HAS_TABLE.should.equal(1);
          done();
        }
      });
    });

    it('should insert the record with the correct sequence pattern', done => {
      let data = [
        {
          firstName: 'John', lastName: 'Doe'
        },
        {
          firstName: 'Jane', lastName: 'Contoso'
        }
      ];

      let model = db.models['TestSchema3'];

      model.create(data, (err, results) => {
        if(err) {
          done(err);
        }
        else {
          results.length.should.equal(2,'Expected 2 successful inserts');
          console.log('fetch1:',results);
          let query = 'select reservation_sequence.currval as last_value from DUAL'
          db.connector.executeSQL(query, [], {}, (err, res) => {
            if(err) {
              done(err)
            }
            else {
              console.log('fetch2:',res);
              res[0].LAST_VALUE.should.equal(4);
              done();
            }
          });
        }
      });
    });
  });  
});