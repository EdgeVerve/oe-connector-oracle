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
