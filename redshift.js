require('dotenv').config();
var express = require('express');
var cors = require('cors');
const app = express();
app.use(cors())
var Redshift = require('node-redshift');
var jinst = require('jdbc/lib/jinst');
var JDBC = require('jdbc');

const AWS = require('aws-sdk');

if (!jinst.isJvmCreated()) {
    jinst.addOption("-Xrs");
    jinst.setupClasspath([/* './drivers/SparkJDBC42.jar', */ './drivers/redshift-jdbc42-2.0.0.4.jar']);
  };

const port = process.env.PORT || 8080;
app.listen(port);

// var credentials = {
// 	accessKeyId: process.env.ACCESS_KEY_ID,
// 	secretAccessKey: process.env.SECRET_ACCESS_KEY
// };

// AWS.config.update({
// 	credentials: credentials,
// 	region: 'us-east-1'
// });



var jdbcConfig = {
    // database: process.env.DB,
    // libpath:'drivers/redshift-jdbc42-2.0.0.4.jar',
    // drivername: 'com.amazon.redshift.jdbc42.Driver',
    url: process.env.REDSHIFT_URL,
    minpoolsize: 1,
    maxpoolsize: 100,
    user: process.env.REDSHIFT_USER,
    password: process.env.REDSHIFT_PASS,
    ssl: true,
    properties: {}
};
// var jdbcConfig = {
//     url: process.env.REDSHIFT_URL,
//     user: 'IAM:awsuser',
//     password: process.env.REDSHIFT_PASS,
//     database: 'dev',
//     port: 5439,
//     idleTimeoutMillis: 0,
//     max: 10000,
//     ssl: true
// };


async function runQuery(req, res, query, type) {
    var hsqldb = new JDBC(jdbcConfig);
    hsqldb.initialize(function(err,res) {
        if (err) {
          console.log(err);
        }
    });
    // hsqldb.reserve(function(err, connObj) {
    // if (connObj) {
    //     var conn = connObj.conn;
    //     asyncjs.series([
    //     function(callback) {
    //         conn.createStatement(function(err, statement) {
    //         if (err) {
    //             return res.status(500).send(err);
    //             resolve(err);
    //         } else {
    //             statement.setFetchSize(100, function(err) {
    //             if (err) {
    //                 return res.status(500).send(err);
    //                 resolve(err);
    //             } else {
    //                 statement.executeQuery(query, function(err, resultset) {
    //                 if (err) {
    //                     callback(err); res.status(500); res.send(err);
    //                 } else {
    //                     resultset.toObjArray(function(err, results) {
    //                     if (type!=='filters'){
    //                         myCache.set(type, JSON.stringify(results));
    //                     }
    //                     return res.send(results);
    //                     callback(null, resultset);
    //                     });
    //                 }
    //                 });
    //             }
    //             });
    //         }
    //         });
    //     }
    //     ], function(err, results) {
    //     hsqldb.release(connObj, function(err) {
    //         if (err) { console.log(err.message); }
    //     });
    //     });
    // }
    // });
}

app.get('/', function(req, res) {
    res.json({ mensaje: '¡Hola Mundo! JAJAJA' })   
  })

app.get('/api/testRedshiftConnection', (req, res) => {
    let query = "SELECT * FROM public.users"
    // console.log('query', query)
    runQuery(req, res, query, 'testRedshiftConnection');
  });

// Handles any requests that don't match the ones above
// app.get('*', (req,res) =>{
//     res.send('Hello!');
// });

console.log('App is listening on port ' + port);