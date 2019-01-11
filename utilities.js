const config  = require( './config' );
const request = require( 'request' );
const fs      = require( 'fs' );
const url     = require( 'url' );

const dataIntegrity = function( file_name ) {
	testExists( file_name );
	testValidJSON( file_name );
};

const testExists = function( file_name ) {
	fs.open( file_name, 'r', error => {
		if ( error ) {
			if ( error.code === 'ENOENT' ) {
				console.log( 'Data file does not exist.' );
				createDataFile( file_name );
				return;
			}
			throw error;
		}
		return true;
	} );
};

const testValidJSON = function( file_name ) {
	fs.readFile( file_name, 'utf8', ( error, data ) => {
		if ( error ) {
			console.error( error );
			throw error;
		}
		if ( isJSON( data ) ) {
			return true;
		}
		console.error( 'Data file invalid.' );
		createDataFile( file_name );
		return false;
	} );
};

const isJSON = function( str ) {
	try {
		JSON.parse( str );
	} catch ( error ) {
		return false;
	}
	return true;
};

const createDataFile = function( file_name ) {
	const obj = {};
	const json = JSON.stringify( obj );
	fs.writeFile( file_name, json, 'utf8' );
	console.log( 'Data file regenerated.' );
};

const writeToDataFile = function( data, input, timestamp ) {
	data[ timestamp ] = input;
	const json = JSON.stringify( data, null, 2 );
	fs.writeFile( config.data_file, json, 'utf8' );
};

const deleteFromDataFile = function( data, timestamp ) {
	if ( data[ timestamp ] ) {
		delete data[ timestamp ];
		const json = JSON.stringify( data, null, 2 );
		fs.writeFile( config.data_file, json, 'utf8' );
		return true;
	}
	return false;
};

const getNewerResponses = function( obj, limit ) {

	/*
	 * Until Node 8, use this Object.entries() polyfill.
	 * From: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries#Polyfill
	 */
	if ( !Object.entries ) {
		Object.entries = function( obj ){
			const ownProps = Object.keys( obj );
			let i = ownProps.length;
			let resArray = new Array( i ); // Preallocate the Array.
			while ( i-- ) {
				resArray[ i ] = [ ownProps[ i ], obj[ ownProps[ i ] ] ];
			}
			return resArray;
		};
	}

	let sort_array = Object.entries( obj );

	// Sort in reverse chronological order. (Newest -> Oldest)
	sort_array = sort_array.sort( function ( a, b ) {
		return b[ 0 ] - a[ 0 ];
	} );

	// Get just the first (earliest) n items. (Newest[0:limit])
	sort_array = sort_array.slice( 0, limit );

	// Sort back to chronological order. (Oldest -> Newest)
	sort_array = sort_array.sort( function ( a, b ) {
		return a[ 0 ] - b[ 0 ];
	} );

	// Adapted from: https://medium.com/dailyjs/rewriting-javascript-converting-an-array-of-objects-to-an-object-ec579cafbfc7
	const arrayToObject = arr => Object.assign( {}, ...arr.map( item => ( { [ item[ 0 ] ]: item[ 1 ] } ) ) );

	return arrayToObject( sort_array );
};

const getTimestamp = function() {
	return Date.now();
};

const isNonemptyResponse = function( input ) {
	if ( typeof input === 'undefined' ) {
		return false;
	}
	if ( input.length === 0 ) {
		return false;
	}
	return true;
};

const isUniqueResponse = function( input, data ) {
	const inputTest = input.toLowerCase();

	for ( const timestamp in data ) {
		// console.log('data.' + timestamp, '=', data[timestamp]);
		if ( data[ timestamp ].toLowerCase() == inputTest ) {
			console.log( 'Duplicate response.' );
			return false;
		}
	}

	return true;
};

const sanitiseInput = function( input ) {
	let inputCleaned = input;
	inputCleaned = inputCleaned.trim();
	inputCleaned = inputCleaned.replace( /\b[-~=+_.,;^&*:*&$%#!?‽[\]{}()`"']+\B|\B[-~=+_.,;^&*:*&$%#!?‽[\]{}()`"']+\b/g, '' ); // Remove punctuation at beginnng or end of words
	inputCleaned = inputCleaned.replace( /(<([^>]+)>)/ig, '' ); // Remove HTML tags

	return inputCleaned;
};

const notBannedIP = function( ip ) {
	for ( const banned_ip in config.banned_ips ) {
		if ( ip.includes( banned_ip ) ) {
			return false;
		}
	}

	return true;
};

const domainCheck = function( origin ) {

	const hostname = getHostname( origin );

	if ( hostname.includes( 'scottsmith.is' ) ) {
		return true;
	}
	return false;
};

const getBaseURL = function( origin ) {
	const origin_parsed = url.parse( origin, true, true );
	const hostname = origin_parsed.hostname;
	const protocol = origin_parsed.protocol;
	const baseURL  = `${ protocol }//${ hostname }`;

	return baseURL;
};

const getHostname = function( origin ) {
	const origin_parsed = url.parse( origin, true, true );
	return origin_parsed.hostname;
};

const postSlackWebhook = function( response, timestamp ) {
	const hook_url = 'https://hooks.slack.com/services/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';
	const delete_url = `${ config.base_url }v${ config.api_version }/delete_response/${ timestamp }`;
	const payload = {
		'attachments': [
			{
				'fallback': response,
				'title': response,
				'text': `<${ delete_url }|Delete>`,
				'color': '#167EDA'
			}
		]
	};

	request(
		{
			method: 'POST',
			url: hook_url,
			json: payload
		},
		function ( error, response ) {
			if ( error ) {
				console.error( 'Upload failed:', error );
				console.error( 'Responded with code:', response.statusCode );
				console.error( 'Response:', response );
			}
		}
	);
};

module.exports = {
	dataIntegrity: dataIntegrity,
	writeToDataFile: writeToDataFile,
	deleteFromDataFile: deleteFromDataFile,
	getNewerResponses: getNewerResponses,
	getTimestamp: getTimestamp,
	isNonemptyResponse: isNonemptyResponse,
	isUniqueResponse: isUniqueResponse,
	notBannedIP: notBannedIP,
	sanitiseInput: sanitiseInput,
	domainCheck: domainCheck,
	getBaseURL: getBaseURL,
	postSlackWebhook: postSlackWebhook
};
