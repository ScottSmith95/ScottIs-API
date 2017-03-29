// IMPORTS
const express	  = require('express');
const app		  = express();
const bodyParser  = require('body-parser');
const config      = require('./config');

// EXPRESS SETUP
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ROUTES SETUP
const defineRoutes = require('./routes');
defineRoutes(app, config);

// STARTUP
app.listen(config.port);
console.log('Listening on port ' + config.port);