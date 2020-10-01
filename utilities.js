const config = require( './config' );
const axios  = require( 'axios' );
const url    = require( 'url' );

function readData( reqLimit = null ) {
	let limit = reqLimit;
	if ( typeof limit === 'string' ) {
		limit = Number( reqLimit );
	}

	return axios( {
		method: 'GET',
		baseURL: config.data_api_root,
		url: `accounts/${ config.cf_accountid }/storage/kv/namespaces/${ config.cf_kv_namespace_id }/values/responses`,
		headers: {
			'X-Auth-Email': config.cf_auth_email,
			'X-Auth-Key': config.cf_auth_key
		}
	} )
	.then( apiResponse => getOrderedResponses( apiResponse.data, limit ) )
	.catch( error => {
		throw error;
	} );
};

async function writeToData( input, timestamp ) {
	const data = await readData();
	data[ timestamp ] = input;

	return axios( {
		method: 'PUT',
		baseURL: config.data_api_root,
		url: `accounts/${ config.cf_accountid }/storage/kv/namespaces/${ config.cf_kv_namespace_id }/values/responses`,
		headers: {
			'X-Auth-Email': config.cf_auth_email,
			'X-Auth-Key': config.cf_auth_key,
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

async function deleteFromData( timestamp ) {
	const data = await readData();

	if ( data[ timestamp ] ) {
		delete data[ timestamp ];

		return axios( {
			method: 'PUT',
			baseURL: config.data_api_root,
			url: `accounts/${ config.cf_accountid }/storage/kv/namespaces/${ config.cf_kv_namespace_id }/values/responses`,
			headers: {
				'X-Auth-Email': config.cf_auth_email,
				'X-Auth-Key': config.cf_auth_key,
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

function getOrderedResponses( obj, limit ) {
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

function getTimestamp() {
	return Date.now();
};

function isNonemptyResponse( input ) {
	if ( typeof input === 'undefined' ) {
		return false;
	}
	if ( input.length === 0 ) {
		return false;
	}
	return true;
};

function isUniqueResponse( input, data ) {
	const inputTest = input.toLowerCase();

	for ( const timestamp in data ) {
		if ( data[ timestamp ].toLowerCase() == inputTest ) {
			console.log( 'Duplicate response entered.' );
			return false;
		}
	}

	return true;
};

function sanitiseInput( input ) {
	let inputCleaned = input;
	inputCleaned = inputCleaned.trim();
	inputCleaned = inputCleaned.replace( /\b[-~=+_.,;^&*:*&$%#!?‽[\]{}()`"']+\B|\B[-~=+_.,;^&*:*&$%#!?‽[\]{}()`"']+\b/g, '' ); // Remove punctuation at beginning or end of words
	inputCleaned = inputCleaned.replace( /(<([^>]+)>)/ig, '' ); // Remove HTML tags

	return inputCleaned;
};

async function readBannedIps() {
	try {
		const bannedIps = await axios( {
			method: 'GET',
			baseURL: config.data_api_root,
			url: `accounts/${ config.cf_accountid }/storage/kv/namespaces/${ config.cf_kv_namespace_id }/values/bans`,
			headers: {
				'X-Auth-Email': config.cf_auth_email,
				'X-Auth-Key': config.cf_auth_key
			}
		} )
		return bannedIps.data;
	}
	catch ( error ) {
		console.error( error );
	}
};

async function notBannedIP( ip ) {
	const bannedIps = await readBannedIps();
	if ( bannedIps.includes( ip ) ) {
		return false;
	}

	return true;
};

function domainCheck( origin ) {

	const hostname = getHostname( origin );

	if ( hostname.includes( 'scottsmith.is' ) || hostname.includes( 'now.sh' ) ) {
		return true;
	}
	return false;
};

function getBaseURL( origin ) {
	const origin_parsed = url.parse( origin, true, true );
	const hostname = origin_parsed.hostname;
	const protocol = origin_parsed.protocol;
	const baseURL  = `${ protocol }//${ hostname }`;

	return baseURL;
};

function getHostname( origin ) {
	const origin_parsed = url.parse( origin, true, true );
	return origin_parsed.hostname;
};

async function postSlackWebhook( response, timestamp ) {
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

	try {
		return axios( {
			method: 'POST',
			url: hook_url,
			data: JSON.stringify( payload ),
			withCredentials: false,
			transformRequest: [
				( data, headers ) => {
					delete headers.post[ 'Content-Type' ];
					return data;
				}
			]
		} )
	}
	catch (error) {
		console.error( 'Upload failed:', error );
		if ( typeof response !== 'undefined' ) {
			console.error( 'Response:', response );
			if ( typeof response.statusCode !== 'undefined' ) {
				console.error( 'Responded with code:', response.statusCode );
			}
		}
	}
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
