const config  = require( './config' );
const axios = require( 'axios' );
const url     = require( 'url' );

const readData = function( reqLimit = null ) {

	let limit = reqLimit;
	if ( typeof limit === 'string' ) {
		limit = Number( reqLimit );
	}

	return axios( {
		method: 'GET',
		baseURL: config.data_api_root,
		url: `/b/${ config.data_bin_id }/latest`,
		headers: {
			'secret-key': config.data_api_key
		}
	} )
	.then( apiResponse => getOrderedResponses( apiResponse.data, limit ) )
	.catch( error => {
		throw error;
	} );
};

const writeToData = async function( input, timestamp ) {
	const data = await readData();
	data[ timestamp ] = input;

	return axios( {
		method: 'PUT',
		baseURL: config.data_api_root,
		url: `/b/${ config.data_bin_id }`,
		headers: {
			'secret-key': config.data_api_key,
			'Content-Type': 'application/json'
		},
		data: data
	} )
	.then( apiResponse => {
		if ( apiResponse.success === true ) {
			return apiResponse.data;
		} return false;
	} )
	.catch( error => {
		throw error;
	} );
};

const deleteFromData = async function( timestamp ) {
	const data = await readData();

	if ( data[ timestamp ] ) {
		delete data[ timestamp ];

		return axios( {
			method: 'PUT',
			baseURL: config.data_api_root,
			url: `/b/${ config.data_bin_id }`,
			headers: {
				'secret-key': config.data_api_key,
				'Content-Type': 'application/json'
			},
			data: data
		} )
		.then( apiResponse => {
			if ( apiResponse.data.success === true ) {
				return true;
			} return false;
		} )
		.catch( error => {
			throw error;
		} );
	}
	console.error( 'Response timestamp not found.' );
	return false;
};

const getOrderedResponses = function( obj, limit ) {
	let sort_array = Object.entries( obj );

	if ( typeof limit === 'number' ) {
		// Sort in reverse chronological order. (Newest -> Oldest)
		sort_array = sort_array.sort( function ( a, b ) {
			return b[ 0 ] - a[ 0 ];
		} );

		// Get just the first (earliest) n items. (Newest[0:limit])
		sort_array = sort_array.slice( 0, limit );
	}

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

const readBannedIps = function() {
	return axios( {
		method: 'GET',
		baseURL: config.data_api_root,
		url: `/b/${ config.bans_bin_id }`,
		headers: {
			'secret-key': config.data_api_key
		}
	} )
	.then( response => response )
	.catch( error => {
		throw error;
	} );
};

const notBannedIP = async function( ip ) {
	for ( const banned_ip in await readBannedIps ) {
		if ( ip.includes( banned_ip ) ) {
			return false;
		}
	}

	return true;
};

const domainCheck = function( origin ) {

	const hostname = getHostname( origin );

	if ( hostname.includes( 'scottsmith.is' ) || hostname.includes( 'now.sh' ) ) {
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
	const hook_url = config.slackWebhookURL;
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

	axios( {
		method: 'POST',
		url: hook_url,
		headers: {
			'secret-key': config.data_api_key,
			'Content-Type': 'application/json'
		},
		data: payload
	} )
	.catch( error => {
		console.error( 'Upload failed:', error );
		if ( typeof response !== 'undefined' ) {
			console.error( 'Response:', response );
			if ( typeof response.statusCode !== 'undefined' ) {
				console.error( 'Responded with code:', response.statusCode );
			}
		}
	} );
};

module.exports = {
	readData: readData,
	writeToData: writeToData,
	deleteFromData: deleteFromData,
	getOrderedResponses: getOrderedResponses,
	getTimestamp: getTimestamp,
	isNonemptyResponse: isNonemptyResponse,
	isUniqueResponse: isUniqueResponse,
	notBannedIP: notBannedIP,
	sanitiseInput: sanitiseInput,
	domainCheck: domainCheck,
	getBaseURL: getBaseURL,
	postSlackWebhook: postSlackWebhook
};
