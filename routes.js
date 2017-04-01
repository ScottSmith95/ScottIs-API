// IMPORTS
const config  = require('./config');
const utils   = require('./utilities');
const express = require('express');
const router  = express.Router();
const fs	  = require('fs');

// ROUTES
router.use(function(req, res, next) {
	utils.dataIntegrity(config.data_file);
	next();
});

router.route('/responses')
	.get(function(req, res) {
		try {
			const json = JSON.parse(fs.readFileSync(config.data_file));
			res.status(200).json(json);
		}
		catch(err) {
			console.log(err);
			res.status(500).send(err);
		}
	})
	
	.post(function(req, res) {
		
		fs.readFile(config.data_file, 'utf8', (err, data) => {
			
			var input = utils.sanitiseInput(req.body.response);
			var timestamp = utils.getTimestamp();
			var origin = req.headers.origin;
			var baseURL = utils.getBaseURL(origin);
			
			data = JSON.parse(data);
			
			if (utils.isNonemptyResponse(input) && utils.isUniqueResponse(input, data) && utils.domainCheck(origin)) {
				try {
					utils.writeToDataFile(data, input, timestamp);
					utils.postSlackWebhook(input, timestamp);
					
					response = {'status': 'Success. Response recorded.'};
					response.response = input;
					res.status(202);
					res.append('Access-Control-Allow-Origin', baseURL)
					res.json(response);
				}
				catch(err){
					console.log(err);
					res.status(500).send(err);
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
		
		fs.readFile(config.data_file, 'utf8', (err, data) => {
			data = JSON.parse(data);
			
			try {
				deleteFromDataFile(data, timestamp);
				
				response = {'status': 'Success. Response deleted.'};
				res.status(200).json(response);
			}
			catch(err){
				res.status(500).send(err);
			}
		});
	});

// Actually use these routes.
module.exports = function(app, config) {
	app.use(`/v${config.api_version}`, router);
}