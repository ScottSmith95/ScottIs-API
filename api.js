// BASE SETUP
// =============================================================================

const express	  = require('express');
const app		  = express();
const bodyParser  = require('body-parser');
const fs		  = require('fs');
const request     = require('request');

// const baseURL     = process.env.BASE_URL || 'https://api.scottsmith.is/';
const port        = process.env.PORT || 8080;
const api_version = 1.1;
const data_file	  = process.env.DATA_FILE || 'data.json';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// HELPER FUNCTIONS
// =============================================================================

var testExists = function(data_file) {
	fs.open(data_file, 'r', (err, fd) => {
		if (err) {
			if (err.code === 'ENOENT') {
				console.log('Data file does not exist.');
				createDataFile(data_file)
				return;
			}
		
			throw err;
		}

		return
	});
}

var createDataFile = function(name) {
	if (! fs.existsSync(name)) {
		var obj = {}
		var json = JSON.stringify(obj);
		fs.writeFile(data_file, json, 'utf8');
		console.log('Data file regenerated.');
	}
}

var getTimestamp = function() {
	return Date.now();
}

var isNonemptyResponse = function(input) {
	if (typeof input == 'undefined') {
		return false;
	}
	if (input.length == 0) {
		return false;
	}
	else {
		return true;
	}
}

var isUniqueResponse = function(input, data) {
	input = input.toLowerCase();
	
	for (var timestamp in data) {
		// console.log('data.' + timestamp, '=', data[timestamp]);
		if (data[timestamp].toLowerCase() == input) {
			return false
		}
	}
	return true
}

var sanitiseInput = function(input) {
	input = input.trim();
	input = input.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,''); // Remove puncuation
	input = input.replace(/(<([^>]+)>)/ig,''); // Remove HTML tags
	
	return input
}

var postSlackWebhook = function(response, timestamp) {
	var hook_url = 'https://hooks.slack.com/services/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'
	var delete_url = 'https://scottsmith.is/' + `api/v${api_version}/delete_response/` + timestamp
	var payload = {
		'attachments': [{
			'fallback': response,
			'title': response,
			'text': `<${delete_url}|Delete>`,
			'color': '#167EDA'
		}]}
	
	request({
		method: 'POST',
	    url: hook_url,
	    json: payload
    },
    function (error, response, body) {
	    if (error) {
			return console.error('Upload failed:', error);
		}
    });
}


// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();

router.use(function(req, res, next) {
	testExists(data_file);
	next();
});

router.route('/responses')
	.get(function(req, res) {
		try {
			const json = JSON.parse(fs.readFileSync(data_file));
			res.status(200).json(json);
		}
		catch(err) {
			res.status(500).send(err);
		}
	})
	
	.post(function(req, res) {
		
		fs.readFile(data_file, 'utf8', function readFileCallback(err, data){
			
			var input = req.body.response;
			input = sanitiseInput(input);
			var timestamp = getTimestamp();
			
			// console.log(isNonemptyResponse(input));
			// console.log(isUniqueResponse(input, data));
			
			data = JSON.parse(data);
			
			if (isNonemptyResponse(input) && isUniqueResponse(input, data)) {
				try {
					data[timestamp] = input;
					json = JSON.stringify(data);
					fs.writeFile(data_file, json, 'utf8');
					
					response = {'status': 'Success. Response recorded.'};
					response.response = input;
					res.status(202).json(response);
					
					postSlackWebhook(input, timestamp);
				}
				catch(err){
					res.send(err);
				}
			}
			else {
				response = {'status': 'Response is a duplicate or empty.'};
				response.response = input;
				res.status(200).json(response);
			}
		});
	});
	
router.route('/delete_response/:timestamp')
	.all(function(req, res, next) {
		var timestamp = req.params.timestamp;
		
		fs.readFile(data_file, 'utf8', function readFileCallback(err, data){
			data = JSON.parse(data);
			
			try {
				delete data[timestamp];
				json = JSON.stringify(data);
				fs.writeFile(data_file, json, 'utf8');
				
				response = {'status': 'Success. Response deleted.'};
				res.status(200).json(response);
			}
			catch(err){
				res.status(500).send(err);
			}
		});
	});


// REGISTER ROUTES -------------------------------
app.use(`/v${api_version}`, router);

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Listening on port ' + port);