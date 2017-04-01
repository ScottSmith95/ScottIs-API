const config  = require('./config');
const request = require('request');
const fs      = require('fs');
const url     = require('url');

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
    }
    catch (err) {
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

var writeToDataFile = function(data, input, timestamp) {
	data[timestamp] = input;
	json = JSON.stringify(data, null, 2);
	fs.writeFile(config.data_file, json, 'utf8');
}

var deleteFromDataFile = function(data, timestamp) {
	delete data[timestamp];
	json = JSON.stringify(data, null, 2);
	fs.writeFile(config.data_file, json, 'utf8');
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

var domainCheck = function(origin) {
	
	var root_domain = getRootDomain(origin);
	
	if (root_domain == 'scottsmith.is') {
		return true
	}
	else {
		return false
	}
}

var getBaseURL = function(origin) {
	origin_parsed = url.parse(origin, true, true);
	var hostname = origin_parsed.hostname;
	var protocol = origin_parsed.protocol
	var baseURL  = protocol + '//' + hostname
	
	return baseURL
}

var getRootDomain = function(origin) {
	origin_parsed = url.parse(origin, true, true);
	var hostname = origin_parsed.hostname;
	
	var full_domain = hostname.split('.');
	full_domain.shift();
	var root_domain = full_domain.join('.');
	
	return root_domain
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
	writeToDataFile: writeToDataFile,
	deleteFromDataFile: deleteFromDataFile,
	getTimestamp: getTimestamp,
	isNonemptyResponse: isNonemptyResponse,
	isUniqueResponse: isUniqueResponse,
	sanitiseInput: sanitiseInput,
	domainCheck: domainCheck,
	getBaseURL: getBaseURL,
	postSlackWebhook: postSlackWebhook
}