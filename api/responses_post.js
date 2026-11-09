import { waitUntil } from '@vercel/functions';
import utils from '../utilities.js';
import { prepareResponse, publicCORS, methodNotAllowed } from '../http.js';

export default async ( req, res ) => {
	prepareResponse( res );
	publicCORS( res );
	if ( req.method === 'OPTIONS' ) return res.status( 204 ).end();
	if ( req.method !== 'POST' ) return methodNotAllowed( res, 'POST, OPTIONS' );

	const origin = req.headers.origin;
	const acceptedTypes = ( req.headers.accept || '' ).split( ',' );
	const acceptsHTML = acceptedTypes.some( value => {
		const [ type, ...parameters ] = value.trim().toLowerCase().split( ';' );
		const quality = parameters.find( parameter => parameter.trim().startsWith( 'q=' ) );
		return type.trim() === 'text/html' && ( !quality || Number( quality.trim().slice( 2 ) ) > 0 );
	} );
	const htmlForm = req.headers[ 'content-type' ]?.split( ';' )[ 0 ].trim().toLowerCase() === 'application/x-www-form-urlencoded'
		&& acceptsHTML && !acceptedTypes.some( value => value.trim().toLowerCase().startsWith( 'application/json' ) );
	const returnOrigin = utils.domainCheck( origin ) ? origin : 'https://scottsmith.is';
	const reply = ( code, payload, result = 'error' ) => {
		if ( !htmlForm ) return res.status( code ).json( payload );
		res.setHeader( 'Location', `${ returnOrigin }/#${ result }` );
		return res.status( 303 ).end();
	};
	if ( origin !== undefined && !utils.domainCheck( origin ) ) {
		return reply( 403, { status: 'Origin is not allowed.' } );
	}
	const rawInput = req.body?.response;
	if ( typeof rawInput !== 'string' || rawInput.trim().length > 20 ) {
		return reply( 400, { status: 'Response must be a string of 1–20 characters.' } );
	}
	const input = utils.sanitiseInput( rawInput );
	if ( !utils.isNonemptyResponse( input ) ) {
		return reply( 400, { status: 'Response must not be empty.' } );
	}

	let timestamp;
	try {
		if ( !await utils.notBannedIP( utils.clientIP( req ) ) ) {
			return reply( 403, { status: 'Submission is not allowed.' } );
		}
		const data = await utils.readData();
		if ( !utils.isUniqueResponse( input, data ) ) {
			// Preserve the existing front-end contract for duplicates.
			return reply( 202, { status: 'Response is a duplicate or empty.', response: input }, 'duplicate' );
		}
		timestamp = await utils.writeToData( input, utils.getTimestamp(), data );
	} catch ( error ) {
		console.error( 'Storage operation failed:', error.name );
		return reply( 503, { status: 'Storage is temporarily unavailable. Please try again.' } );
	}

	// Keep the user's fast response while retaining work after the function returns.
	waitUntil( Promise.allSettled( [
		utils.postSlackWebhook( input, timestamp ),
		utils.postPushcutWebhook( input, timestamp )
	] ).then( results => {
		for ( const [ index, result ] of results.entries() ) {
			if ( result.status === 'rejected' ) console.error( `${ [ 'Slack', 'Pushcut' ][ index ] } notification failed.` );
		}
	} ) );
	return reply( 200, { status: 'Success. Response recorded.', response: input, timestamp }, 'sent' );
};
