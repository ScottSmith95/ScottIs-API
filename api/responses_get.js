import utils from '../utilities.js';
import { prepareResponse, publicCORS, methodNotAllowed, storageFailure } from '../http.js';

export default async ( req, res ) => {
	prepareResponse( res );
	publicCORS( res );
	if ( req.method === 'OPTIONS' ) return res.status( 204 ).end();
	if ( req.method !== 'GET' ) return methodNotAllowed( res, 'GET, OPTIONS' );

	let limit;
	try {
		limit = utils.parseLimit( req.query?.limit );
	} catch {
		return res.status( 400 ).json( { status: 'Limit must be a positive integer.' } );
	}
	try {
		return res.status( 200 ).json( await utils.readData( limit ) );
	} catch ( error ) {
		return storageFailure( res, error );
	}
};
