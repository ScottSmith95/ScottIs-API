import config from './config.js';

async function storageRequest( key, options = {} ) {
	if ( !config.cf_accountid || !config.cf_kv_namespace_id
		|| !( config.cf_api_token || ( config.cf_auth_email && config.cf_auth_key ) ) ) {
		throw new Error( 'Storage is not configured.' );
	}
	const auth = config.cf_api_token
		? { Authorization: `Bearer ${ config.cf_api_token }` }
		: { 'X-Auth-Email': config.cf_auth_email, 'X-Auth-Key': config.cf_auth_key };
	const response = await fetch(
		`${ config.data_api_root }accounts/${ config.cf_accountid }/storage/kv/namespaces/${ config.cf_kv_namespace_id }/values/${ key }`,
		{
			...options,
			headers: { ...auth, 'Content-Type': 'application/json' },
			signal: AbortSignal.timeout( 8000 )
		}
	);
	if ( !response.ok ) throw new Error( `Storage request failed (${ response.status }).` );
	return response.json();
}

async function readData( limit = null ) {
	const data = await storageRequest( 'responses' );
	if ( !data || typeof data !== 'object' || Array.isArray( data )
		|| Object.entries( data ).some( ( [ key, value ] ) => !isTimestamp( key ) || typeof value !== 'string' ) ) {
		throw new Error( 'Invalid responses in storage.' );
	}
	return getOrderedResponses( data, limit );
}

async function saveData( data ) {
	const result = await storageRequest( 'responses', { method: 'PUT', body: JSON.stringify( data ) } );
	if ( result?.success !== true ) throw new Error( 'Storage did not confirm the write.' );
	return true;
}

async function writeToData( input, timestamp, existingData ) {
	const data = existingData ?? await readData();
	// This avoids a collision in this snapshot; KV cannot make concurrent writes atomic.
	while ( Object.hasOwn( data, timestamp ) ) timestamp += 1;
	await saveData( { ...data, [ timestamp ]: input } );
	return timestamp;
}

async function deleteFromData( timestamp ) {
	const data = await readData();
	if ( !Object.hasOwn( data, timestamp ) ) return false;
	delete data[ timestamp ];
	await saveData( data );
	return true;
}

function getOrderedResponses( data, limit = null ) {
	const entries = Object.entries( data ).sort( ( a, b ) => Number( a[ 0 ] ) - Number( b[ 0 ] ) );
	return Object.fromEntries( limit === null ? entries : entries.slice( -limit ) );
}

function parseLimit( value ) {
	if ( value === undefined ) return null;
	if ( typeof value !== 'string' || !/^[1-9]\d*$/.test( value ) || !Number.isSafeInteger( Number( value ) ) ) {
		throw new Error( 'Limit must be a positive integer.' );
	}
	return Number( value );
}

function getTimestamp() {
	return Date.now();
}

function isTimestamp( value ) {
	return typeof value === 'string' && /^[1-9]\d{0,15}$/.test( value ) && Number.isSafeInteger( Number( value ) );
}

function isNonemptyResponse( input ) {
	return typeof input === 'string' && input.trim().length > 0;
}

function isUniqueResponse( input, data ) {
	return !Object.values( data ).some( value => value.toLowerCase() === input.toLowerCase() );
}

function sanitiseInput( input ) {
	if ( typeof input !== 'string' ) return '';
	return input.trim()
		.replace( /\b[-~=+_.,;^&*:*&$%#!?‽[\]{}()`"']+\B|\B[-~=+_.,;^&*:*&$%#!?‽[\]{}()`"']+\b/g, '' )
		.replace( /(<([^>]+)>)/ig, '' )
		.trim();
}

async function notBannedIP( ip ) {
	const bannedIps = await storageRequest( 'bans' );
	if ( !Array.isArray( bannedIps ) || bannedIps.some( value => typeof value !== 'string' ) ) {
		throw new Error( 'Invalid IP bans in storage.' );
	}
	return !bannedIps.includes( ip );
}

function clientIP( req ) {
	// Vercel supplies x-forwarded-for. A different host must configure a trusted proxy.
	const forwarded = req.headers[ 'x-forwarded-for' ];
	return typeof forwarded === 'string' ? forwarded.split( ',' )[ 0 ].trim() : req.socket?.remoteAddress;
}

function domainCheck( origin ) {
	if ( typeof origin !== 'string' ) return false;
	try {
		const url = new URL( origin );
		if ( url.origin !== origin ) return false;
		if ( config.allowed_origins.includes( origin ) ) return true;
		return url.protocol === 'https:' && !url.port
			&& ( url.hostname === 'scottsmith.is' || url.hostname.endsWith( '.scottsmith.is' ) );
	} catch {
		return false;
	}
}

function deletionURL( timestamp ) {
	return new URL( `v${ config.api_version }/delete_response/${ timestamp }`, `${ config.base_url.replace( /\/+$/, '' ) }/` ).href;
}

async function postWebhook( url, payload ) {
	const response = await fetch( url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( payload ),
		signal: AbortSignal.timeout( 5000 )
	} );
	if ( !response.ok ) throw new Error( `Webhook request failed (${ response.status }).` );
	return response.text();
}

async function postSlackWebhook( response, timestamp ) {
	if ( !config.slackWebhookURL ) return null;
	const deleteURL = deletionURL( timestamp );
	return postWebhook( config.slackWebhookURL, {
		attachments: [ {
			fallback: response,
			title: response,
			text: `<${ deleteURL }|Delete>`,
			color: '#167EDA'
		} ]
	} );
}

async function postPushcutWebhook( response, timestamp ) {
	if ( !config.pushcutWebhookURL ) return null;
	const deleteURL = deletionURL( timestamp );
	return postWebhook( config.pushcutWebhookURL, {
		text: response,
		id: `${ timestamp }`,
		actions: [ { name: 'Delete Response', input: `${ timestamp }`, url: deleteURL } ]
	} );
}

export default {
	readData, writeToData, deleteFromData, getOrderedResponses, parseLimit, getTimestamp,
	isTimestamp, isNonemptyResponse, isUniqueResponse, notBannedIP, sanitiseInput,
	clientIP, domainCheck, deletionURL,
	postSlackWebhook, postPushcutWebhook
};
