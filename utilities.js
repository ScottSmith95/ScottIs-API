import config from './config.js';
import fetch from 'node-fetch';
import url from 'url';

async function readData( reqLimit = null ) {
	let limit = reqLimit;
	if ( typeof limit === 'string' ) {
		limit = Number( reqLimit );
	}

	const apiResponse = await fetch(
		`${config.data_api_root}accounts/${ config.cf_accountid }/storage/kv/namespaces/${ config.cf_kv_namespace_id }/values/responses`,
		{
			method: 'GET',
			headers: {
				'X-Auth-Email': config.cf_auth_email,
				'X-Auth-Key': config.cf_auth_key
			}
		}
	);
	return getOrderedResponses( await apiResponse.json(), limit );
}

async function writeToData( input, timestamp ) {
	const existingData = await readData();
	existingData[ timestamp ] = input;

	const apiResponse = await fetch(
		`${config.data_api_root}accounts/${ config.cf_accountid }/storage/kv/namespaces/${ config.cf_kv_namespace_id }/values/responses`,
		{
			method: 'PUT',
			headers: {
				'X-Auth-Email': config.cf_auth_email,
				'X-Auth-Key': config.cf_auth_key,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify( existingData )
		}
	);

	if ( apiResponse.success === true ) {
		return await apiResponse.json();
	} return false;
}

async function deleteFromData( timestamp ) {
	const existingData = await readData();

	if ( existingData[ timestamp ] ) {
		delete existingData[ timestamp ];

		const apiResponse = await fetch(
			`${config.data_api_root}accounts/${ config.cf_accountid }/storage/kv/namespaces/${ config.cf_kv_namespace_id }/values/responses`,
			{
				method: 'PUT',
				headers: {
					'X-Auth-Email': config.cf_auth_email,
					'X-Auth-Key': config.cf_auth_key,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify( existingData )
			}
		);

		const apiResponseJson = await apiResponse.json();

		if ( apiResponseJson.success === true ) {
			return true;
		} return false;
	}
	console.error( 'Response timestamp not found.' );
	return false;
}

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
}

function getTimestamp() {
	return Date.now();
}

function isNonemptyResponse( input ) {
	if ( typeof input === 'undefined' ) {
		return false;
	}
	if ( input.length === 0 ) {
		return false;
	}
	return true;
}

function isUniqueResponse( input, data ) {
	const inputTest = input.toLowerCase();

	for ( const timestamp in data ) {
		if ( data[ timestamp ].toLowerCase() == inputTest ) {
			console.log( 'Duplicate response entered.' );
			return false;
		}
	}

	return true;
}

function sanitiseInput( input ) {
	let inputCleaned = input;
	inputCleaned = inputCleaned.trim();
	inputCleaned = inputCleaned.replace( /\b[-~=+_.,;^&*:*&$%#!?‽[\]{}()`"']+\B|\B[-~=+_.,;^&*:*&$%#!?‽[\]{}()`"']+\b/g, '' ); // Remove punctuation at beginning or end of words
	inputCleaned = inputCleaned.replace( /(<([^>]+)>)/ig, '' ); // Remove HTML tags

	return inputCleaned;
}

async function readBannedIps() {
	const bannedIps = await fetch(
		`${config.data_api_root}accounts/${ config.cf_accountid }/storage/kv/namespaces/${ config.cf_kv_namespace_id }/values/bans`,
		{
			method: 'GET',
			headers: {
				'X-Auth-Email': config.cf_auth_email,
				'X-Auth-Key': config.cf_auth_key,
			}
		}
	);
	return await bannedIps.json();
}

async function notBannedIP( ip ) {
	const bannedIps = await readBannedIps();
	if ( bannedIps.includes( ip ) ) {
		return false;
	}

	return true;
}

function domainCheck( origin ) {

	const hostname = getHostname( origin );

	if ( hostname.includes( 'scottsmith.is' ) || hostname.includes( 'now.sh' ) ) {
		return true;
	}
	return false;
}

function getBaseURL( origin ) {
	const origin_parsed = url.parse( origin, true, true );
	const hostname = origin_parsed.hostname;
	const protocol = origin_parsed.protocol;
	const baseURL  = `${ protocol }//${ hostname }`;

	return baseURL;
}

function getHostname( origin ) {
	const origin_parsed = url.parse( origin, true, true );
	return origin_parsed.hostname;
}

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
		const slackResponse = await fetch(
			hook_url,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify( payload )
			}
		);

		return await slackResponse.text();
	} catch ( error ) {
		console.error( 'Notification failed:', error );
		if ( typeof response !== 'undefined' ) {
			console.error( 'Response:', response );
			if ( typeof response.statusCode !== 'undefined' ) {
				console.error( 'Responded with code:', response.statusCode );
			}
		}
	}
}

async function postPushcutWebhook( response, timestamp ) {
	const hook_url = config.pushcutWebhookURL;
	const delete_url = `${ config.base_url }v${ config.api_version }/delete_response/${ timestamp }`;
	const payload = {
		'text': response,
		'id': `${ timestamp }`,
		'actions': [
			{
				'name': 'Delete Response',
				'input': `${ timestamp }`,
				'url': delete_url
			}
		]
	};

	try {
		const pushcutResponse = await fetch(
			hook_url,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify( payload )
			}
		);

		return await pushcutResponse.text();
	} catch ( error ) {
		console.error( 'Notification failed:', error );
		if ( typeof response !== 'undefined' ) {
			console.error( 'Response:', response );
			if ( typeof response.statusCode !== 'undefined' ) {
				console.error( 'Responded with code:', response.statusCode );
			}
		}
	}
}

export default {
	readData,
	writeToData,
	deleteFromData,
	getOrderedResponses,
	getTimestamp,
	isNonemptyResponse,
	isUniqueResponse,
	notBannedIP,
	sanitiseInput,
	domainCheck,
	getBaseURL,
	postSlackWebhook,
	postPushcutWebhook
};
