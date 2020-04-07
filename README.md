# oe-connector-oracle

This is a oracle connector for oeCloud framework developed based on loopback-connector-postgresql with the same license of postgres connector.

## Getting Started
In your application root directory, enter this command to install the connector:
```javascript
$ npm install oe-connector-oracle oracledb --save
```
This will install the module and add's it to application’s package.json file.

## Usage Guidelines

* All models by default should be ```strict:true```. Any property you want to POST/GET must be defined in your model definition. The reason for this is, each property defined on the model is stored as a column in the table and if you try to GET/POST any new property(not defined on model), Oracle will throw an error  because there is no column defined for such properties.
* Queries on Object types should be avoided. For example on one record prop1.sub is numeric and in other record prop.sub is string then oracle will throw error as it cannot convert it to specific type.
* We should consider strongly typed properties in the model. For example instead of using ``` property1:{type: any}``` Its adviceable to use ``` property1:{type: object}```. Another important thing we need to be careful is with array types. It would be easy to query on ```["string"]``` than ```[any]/ []```.
* While changing the model definition for the existing Model, we should be careful while adding new properties on the model with validations. For example we have a model with 10 records in db with 5 properties. Now we want to add a new property with required validation. By directly adding this to model will leave the current table in in-consistent state as there are already existing records without any value for that column. We can do this safely with causing these issues by adding a defaul value in the newly defined property on tha model.
* In model definition, properties can  include mapping for standard Oracle types as shown below.

```js
"properties":{
      "productId":{
        "type":"string",
        "required":true,
        "length":20,
        "id":1,
        "oracle":{
          "columnName":"PRODUCT_ID",
          "dataType":"VARCHAR2",
          "dataLength":20,
          "nullable":"N"
        }
      },
      "locationId":{
        "type":"string",
        "required":true,
        "length":20,
        "id":2
      },
      "available":{
        "type":"number",
        "required":false,
        "length":22,
        "oracle":{
          "columnName":"AVAILABLE",
          "dataType":"NUMBER",
          "dataLength":22,
          "nullable":"Y"
        }
      },
      "total":{
        "type":"number",
        "length":15
      }
    }
```

* Any filter query on the properties which are not actually part of model definition properties will be ignored by default. This will give you unexpected results based on your query which will not be same as mongodb. For example, if your model has property ```foo``` and your filter query is ```bar:1```. Then mongo will return ```[]``` (Empty array). where as Oracle will return all the records because the bar:1 filter will be ignored because its not a defined property.

## Sequence support

As of version 2.1.0 of the connector, support for consuming sequence objects is provisioned. Unlike `oe-connector-postgresql` module, this connector has only two kinds of sequences - **simple** and **complex**.

Only one property in a model can be defined to support an oracle sequence object. The property should be such that it uniquely identifies the instance. Hence it should be an `id ` field.

### Simple Sequence

Supports a simple sequence - it is similar to having the sequence object created in the database and a corresponding table consuming it through a column whose default value is appropriately set. For e.g. below code (i.e. model definition) creates a sequence with name `reservation_sequence` and a table named `testschema2`

```json
{
  "name": "testschema2",
  "properties": {
    "reservationId" : {
      "id" : true,
      "oracle": {
        "sequence" : {
          "type": "simple",
          "name": "reservation_sequence"
        }
      }
    },
    "firstName": "string",
    "lastName": "string"
  }
}
```

> Note: Only one property in the model can consume a sequence, and, it also must uniquely identify an instance. (Therefore `"id" : true` is part of the corresponding property definition)

Below strech of code describes the configuration required for defining a **simple** sequence.

```js
const SEQ_SIMPLE = {
  name: null,       // sequence name - required
  incrementBy: 1,
  minValue: false,  // number or boolean
  maxValue: false,  // number or boolean
  startFrom: 1,     // number
  cache: false,     // Specify (integer) how many values of the sequence the database preallocates and keeps in memory for faster access. 
                    //    Must be >=2. The integer should have less than or equal to 28 digits.
                    //    Alternatively specify boolean. 
                    //      A boolean true means cache value adopts 2. 
                    //      A boolean false means no caching (default)
  cycle: false,     // restart once the seq reaches its upper bound.
  order: false      // guarantee sequence numbers are generated in order of request. Default false
};
```

> Note: Please refer oracle documentation for more details about each parameter.

### Complex sequence

This connector also supports prefix based sequences. A `prefix` is a string which is prefixed to a padded sequence number. This makes it possible to generate sequences such as `LMB00001`, `LMB00002`, `LMB00003`, etc.

It has all the configuration of a simple sequence, and, the following parameters:

```js
const SEQ_COMPLEX = Object.assign({}, SEQ_SIMPLE, {
  name: null,       // sequence name - required
  length: 0,        // final length of prefix-ed sequence - required
  prefix: null      // the prefix to appear before the padded sequence - required
});
```
Example:
```json
{
  "name": "testschema3",
  "properties": {
    "reservationId" : {
      "id" : true,
      "oracle": {
        "sequence" : {
          "type": "complex",
          "name": "reservation_sequence",
          "prefix": "LMB",
          "length": 10
        }
      }
    },
    "firstName": "string",
    "lastName": "string"
  }
}
```

## Index usage with like operator

Like operator can be used in 4 ways in our queries:

1. Search-String%
2. %Search-String
3. %Search-String%
4. Search%String

Index range scan is only done in for cases like Search-String% and Search%String.
While using %Search-String and %Search-String% full table scan is done.
