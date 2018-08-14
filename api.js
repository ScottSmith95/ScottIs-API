// IMPORTS
const express	  = require( 'express' );
const app		  = express();
const config      = require( './config' );

// EXPRESS SETUP
app.use( express.urlencoded( { extended: true } ) );
app.use( express.json() );

// ROUTES SETUP
const defineRoutes = require( './routes' );
defineRoutes( app, config );

// STARTUP
app.listen( config.port );
console.log( 'Listening on port', config.port );