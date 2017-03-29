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
		
		fs.readFile(config.data_file, 'utf8', function readFileCallback(err, data) {
			
			var input = req.body.response;
			input = utils.sanitiseInput(input);
			var timestamp = utils.getTimestamp();
			
			data = JSON.parse(data);
			
			if (utils.isNonemptyResponse(input) && utils.isUniqueResponse(input, data)) {
				try {
					data[timestamp] = input;
					json = JSON.stringify(data);
					fs.writeFile(config.data_file, json, 'utf8');
					
					response = {'status': 'Success. Response recorded.'};
					response.response = input;
					res.status(202).json(response);
					
					utils.postSlackWebhook(input, timestamp);
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
		
		fs.readFile(config.data_file, 'utf8', function readFileCallback(err, data) {
			data = JSON.parse(data);
			
			try {
				delete data[timestamp];
				json = JSON.stringify(data);
				fs.writeFile(config.data_file, json, 'utf8');
				
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