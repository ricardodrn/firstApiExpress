require('dotenv').config();
const express = require('express');
const path = require('path');
var cors = require('cors');
const https = require('https');
const app = express();
var multer  = require('multer');
var upload = multer();
var asyncjs = require('async');
app.use(cors())
var JDBC = require('jdbc');
var jinst = require('jdbc/lib/jinst');
// const { json } = require('express');

// aws
const fs = require('fs')
const Path = require('path')
const Axios = require('axios')
const AWS = require('aws-sdk');

//jwt
var jwtDecode = require('jwt-decode');
var jwt = require('jsonwebtoken');

// node cache configure
const NodeCache = require( "node-cache" );
const myCache = new NodeCache({ stdTTL: 86400, deleteOnExpire: true });

// var passport = require('passport');
// // const { Strategy: wsfedsaml2 } = require('passport-wsfed-saml2');
// const os = require('os');
// const fileCache = require('file-system-cache').default;
// const { fetch, toPassportConfig, claimsToCamelCase } = require('passport-saml-metadata');
// const SamlStrategy = require('passport-wsfed-saml2').Strategy;

// sql
const SummaryPageSQL = require('./sql/SummaryPageSQL');
const FilterBarSQL = require('./sql/FilterSQL');
const TopicSQL = require('./sql/TopicSQL');
const WordSQL = require('./sql/WordSQL');
const ComparisonSQL = require('./sql/ComparisonSQL');

// validation
const axios = require('axios');
const cognitoUtils = require('./cognitoUtils');
const { resolve } = require('path');

if (!jinst.isJvmCreated()) {
  jinst.addOption("-Xrs");
  jinst.setupClasspath(['./drivers/SparkJDBC42.jar', './drivers/RedshiftJDBC41-1.1.10.1010.jar']);
};

// configure credentials to connect to mcd server (must be connected to VPN!)
var jdbcConfig = {
  url: process.env.REDSHIFT_URL,
  minpoolsize: 1,
  maxpoolsize: 100,
  user: process.env.REDSHIFT_USER,
  password: process.env.REDSHIFT_PASSWORD,
  properties: {}
};

async function runQuery(req, res, query, type) {

  // AUTH
  // var checkAuth = await cognitoUtils.ValidateToken(req.body.token);
  // if (checkAuth!=='valid') {
  //   return messageFunction(req, res,403);
  // }

  var hsqldb = new JDBC(jdbcConfig);
  hsqldb.initialize(function(err) {
    if (err) {
      console.log(err);
    }
  });
  hsqldb.reserve(function(err, connObj) {
    if (connObj) {
      var conn = connObj.conn;
      asyncjs.series([
        function(callback) {
          conn.createStatement(function(err, statement) {
            if (err) {
              return res.status(500).send(err);
              resolve(err);
            } else {
              statement.setFetchSize(100, function(err) {
                if (err) {
                  return res.status(500).send(err);
                  resolve(err);
                } else {
                  statement.executeQuery(query, function(err, resultset) {
                    if (err) {
                      callback(err); res.status(500); res.send(err);
                    } else {
                      resultset.toObjArray(function(err, results) {
                        if (type!=='filters'){
                          myCache.set(type, JSON.stringify(results));
                        }
                        return res.send(results);
                        callback(null, resultset);
                      });
                    }
                  });
                }
              });
            }
          });
        }
      ], function(err, results) {
        hsqldb.release(connObj, function(err) {
          if (err) { console.log(err.message); }
        });
      });
    }
  });
}


// // prod
// var Redshift = require('node-redshift');
// var client = {
//   user: process.env.REDSHIFT_USER,
//   database: process.env.REDSHIFT_DATABASE,
//   password: process.env.REDSHIFT_PASSWORD,
//   port: process.env.REDSHIFT_PORT,
//   host: process.env.REDSHIFT_HOST
// };
// var redshiftClient = new Redshift(client, {rawConnection: false});

// async function runQuery(req, res, query, type) {
//   redshiftClient.query(query, {raw: true})
//     .then(function(data){
//       if (type!=='filters'){
//         myCache.set(type, JSON.stringify(data));
//       }
//       res.send(data);
//     })
//     .catch(function(err){
//       console.log("error: " + JSON.stringify(err))
//       errorFunction(req, res,'Redshift', 'redshiftClient', err); //////////////////////// ERROR function used here
//     });
// }

function checkCache(req, res, query, type){
  var cache_data = myCache.get( type );
  
  if ( cache_data == undefined) {
      // console.log('QUERY: '+type);
      runQuery(req, res, query, type);
  } else { 
      // console.log('CACHED ALREADY: '+type);
      cache_data = myCache.get( type );
      res.send(cache_data);
  }
}

////////////////  Messages  ////////////////

/// Variable and Messages
var messageMap = new Map()
messageMap.set(400, {'error':'provide params'})
messageMap.set(403, {'error':'not authorized'})

/// New Map Function for Messages
function messageFunction(req, res,ERR_CD) {
    return res.status(ERR_CD).send(messageMap.get(ERR_CD))
}

/// New ERROR Function for Messages
function errorFunction(req, res,topic, component, error) {
    return res.send(`Error while executing ${topic} in ${component}: ` + JSON.stringify(error))
}
app.get('/api/testRedshiftConnection', (req, res) => {
  let query = SummaryPageSQL.getTestCommentsSql();
  runQuery(req, res, query, 'testRedshiftConnection');
});

// ************* AWS
//your IAM user credentials
var credentials = {
	accessKeyId: process.env.ACCESS_KEY_ID,
	secretAccessKey: process.env.SECRET_ACCESS_KEY
};

AWS.config.update({
	credentials: credentials,
	region: 'us-east-1'
});

//path to the object you're looking for
var presignedGETURL;

async function downloadFile(presignedGETURL,req, res) {
	const url = presignedGETURL
		try {
			const response = await Axios({
					url,
					method: 'GET',
					responseType: 'arraybuffer',
					headers: {
						'Content-Type': 'application/json',
						'Accept': 'application/pdf' // <-- declare the file format in s3
					}
				})

				// console.log("response.data from s3 object...>", response.data)
				// return response.data;
        return res.send({'please':'work'});
		} catch (err) {
			console.log("error in axios call", err)
			// throw err;
      return res.send({'error':'error'});
		}

}

async function generatePresignedUrl(req, res) {
	try {
		let bucektParams = {
			Bucket: 'us-east-dev-corp-ahub-cxperformance', // your bucket name,
			Key: "user_restricted_markets/user_markets.json", // path to the object you're looking for
      Expires: 10000
		}
		var s3 = new AWS.S3();
		presignedGETURL = s3.getSignedUrl('getObject', bucektParams);
		console.log("presigned url obtained from s3: ", presignedGETURL);
    // downloadFile(presignedGETURL,req, res);
	} catch (err) {
		console.log("error call during call s3 ".concat(err))
		throw err;
	}

}

// ************* AWS

// S3
app.get('/api/s3/user_markets', (req,res) =>{
  console.log('start')

  // var bla = generatePresignedUrl(req, res);

  // fetch('https://us-east-dev-corp-ahub-cxperformance.s3.amazonaws.com/user_restricted_markets/user_markets.json?AWSAccessKeyId=AKIATSM45SMN5T7ROOPK&Expires=1649273841&Signature=qGr%2FQ%2FyvSJ9GTDEuaFuCG4MJ5oA%3D')
  // .then(response => res.send(JSON.stringify(response)))

  res.send('works');
});

// SUMMARY PAGE DATA
app.post('/api/summary/getKPIMentionsSentiments', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getKPIMentionsSentiments(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getKPIMentionsSentiments");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getKPISummaryDateRange', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getKPISummaryDateRange(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getKPISummaryDateRange");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getKPISummaryPrevYear', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getKPISummaryPrevYear(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getKPISummaryPrevYear");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getCommentSourceData', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getCommentSourceData(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getCommentSourceData");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getTopicData', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getTopicData(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getTopicData");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getMenuData', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getMenuData(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getMenuData");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getWordData', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getWordData(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getWordData");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getOrderPointDayPartData', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getOrderPointDayPartData(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getOrderPointDayPartData");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getDaypartData', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getDaypartData(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getDaypartData");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getDriverData', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getDriverData(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getDriverData");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/summary/getFulfillmentChannelData', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = SummaryPageSQL.getFulfillmentChannelData(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "getFulfillmentChannelData");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

// FILTER BAR DATA
app.post('/api/filters/getMarketFilter', upload.none(), (req,res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = FilterBarSQL.getMarketFilter();
      checkCache(req, res, query, "getMarketFilter");
    }
  });

});

app.post('/api/filters/getRegionFilter', upload.none(), (req,res) => {
  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = FilterBarSQL.getRegionFilter();
      checkCache(req, res, query, "getRegionFilter");
    }
  });
});

app.post('/api/filters/getRestaurantFilter', upload.none(), (req,res) => {
  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = FilterBarSQL.getRestaurantFilter();
      checkCache(req, res, query, "getRestaurantFilter");
    }
  });
});

app.post('/api/filters/getPosAreaFilter', upload.none(), (req,res) => {
  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = FilterBarSQL.getPosAreaFilter();
      checkCache(req, res, query, "getPosAreaFilter");
    }
  });
});

app.post('/api/filters/getDayPartFilter', upload.none(), (req,res) => {
  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = FilterBarSQL.getDayPartFilter();
      checkCache(req, res, query, "getDayPartFilter");
    }
  });
});

app.post('/api/filters/getTopicFilter', upload.none(), (req,res) => {
  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = FilterBarSQL.getTopicFilter();
      checkCache(req, res, query, "getTopicFilter");
    }
  });
});

app.post('/api/filters/getMenuItemFilter', upload.none(), (req,res) => {
  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = FilterBarSQL.getMenuItemFilter();
      checkCache(req, res, query, "getMenuItemFilter");
    }
  });
});

// DEEP-DIVE TOPIC DATA
app.post('/api/topic/getKPIMentionsSentiments', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getKPIMentionsSentiments(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getKPIMentionsSentiments");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getKPIMentionsSentimentsTrend', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getKPIMentionsSentimentsTrend(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getKPIMentionsSentimentsTrend");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getCommentSource', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getCommentSource(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getCommentSource");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getGuestCountOEPER2P', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getGuestCountOEPER2P(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getGuestCountOEPER2P");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getTrendsChart', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getTrendsChart(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getTrendsChart");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getOtherMentionTopic', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getOtherMentionTopic(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getOtherMentionTopic");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getRelatedMenu', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getRelatedMenu(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getRelatedMenu");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getRelatedWord', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getRelatedWord(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getRelatedWord");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getKPIOsat', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getKPIOsat(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getKPIOsat");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getOSATTrend', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getOSATTrend(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getOSATTrend");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/topic/getCommentCards', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = TopicSQL.getCommentCards(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "topic_getCommentCards");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

// DEEP-DIVE WORD DATA
app.post('/api/word/getKPIMentionsSentiments', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = WordSQL.getKPIMentionsSentiments(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "word_getKPIMentionsSentiments");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/word/getKPITrend', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = WordSQL.getKPITrend(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "word_getKPITrend");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/word/getOtherWords', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = WordSQL.getOtherWords(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "word_getOtherWords");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/word/getRelatedTopic', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = WordSQL.getRelatedTopic(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "word_getRelatedTopic");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/word/getRelatedMenu', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = WordSQL.getRelatedMenu(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "word_getRelatedMenu");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

app.post('/api/word/getCommentCards', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = WordSQL.getCommentCards(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "word_getCommentCards");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});

// COMPARISON TOOL
app.post('/api/comparison/getComparison', upload.none(), (req, res) => {

  jwt.verify(req.body.token, process.env.JWT_SECRET_KEY, function(err, decoded) {
    if (decoded===undefined){
      res.status(403).send('not authorized')
    } else if (decoded.authenticated===true) {
      let query = ComparisonSQL.getComparisonPage(req.body.filters);

      // only use cache on initial render
      if (req.body.filters==='default'){
        checkCache(req, res, query, "comparison_getComparison");
      } else {
        runQuery(req, res, query, 'filters');
      }
    }
  });

});


// Handles any requests that don't match the ones above
app.get('*', (req,res) =>{
    res.send('Hello!');
});

const port = process.env.PORT || 80;
app.listen(port);

console.log('App is listening on port ' + port);

