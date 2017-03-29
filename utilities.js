const config  = require('./config');
const fs      = require('fs');
const request = require('request');

var dataIntegrity = function(file_name) {
	testExists(file_name);
	testValidJSON(file_name);
}

var testExists = function(file_name) {
	fs.open(file_name, 'r', (err, data) => {
		if (err) {
			if (err.code === 'ENOENT') {
				console.log('Data file does not exist.');
				createDataFile(file_name);
				return
			}
			throw err
		}
		return
	});
}

var testValidJSON = function(file_name) {
	fs.readFile(file_name, 'utf8', (err, data) => {
		if (isJSON(data)) {
			return
		}
		else {
			console.log('Data invalid.');
			createDataFile(file_name);
			return
		}
	});
}

function isJSON(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

var createDataFile = function(file_name) {
	var obj = {}
	var json = JSON.stringify(obj);
	fs.writeFile(file_name, json, 'utf8');
	console.log('Data file regenerated.');
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
	var delete_url = config.baseURL + `v${config.api_version}/delete_response/` + timestamp
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

module.exports = {
	dataIntegrity: dataIntegrity,
	getTimestamp: getTimestamp,
	isNonemptyResponse: isNonemptyResponse,
	isUniqueResponse: isUniqueResponse,
	sanitiseInput: sanitiseInput,
	postSlackWebhook: postSlackWebhook
}