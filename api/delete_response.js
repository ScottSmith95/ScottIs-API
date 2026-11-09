import utils from '../utilities.js';
import { prepareResponse, methodNotAllowed, storageFailure } from '../http.js';

export default async ( req, res ) => {
	prepareResponse( res );
	res.setHeader( 'Referrer-Policy', 'no-referrer' );
	res.setHeader( 'Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" );
	if ( req.method !== 'GET' && req.method !== 'POST' ) return methodNotAllowed( res, 'GET, POST' );

	const timestamp = req.query?.timestamp;
	if ( !utils.isTimestamp( timestamp ) ) {
		return res.status( 400 ).json( { status: 'Invalid response timestamp.' } );
	}

	if ( req.method === 'GET' ) {
		// The timestamp has been restricted to digits before HTML interpolation.
		// GET must never mutate data: notification previews can follow these links.
		res.setHeader( 'Content-Type', 'text/html; charset=utf-8' );
		return res.status( 200 ).send( `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Delete response</title><h1>Delete this response?</h1><p>This cannot be undone.</p><form method="post" action=""><button type="submit">Delete response</button></form></html>` );
	}

	try {
		const deleted = await utils.deleteFromData( timestamp );
		return res.status( deleted ? 200 : 404 ).json( { status: deleted ? 'Success. Response deleted.' : 'Response not found.' } );
	} catch ( error ) {
		return storageFailure( res, error );
	}
};
