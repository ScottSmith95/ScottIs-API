export function prepareResponse( res ) {
	res.setHeader( 'Cache-Control', 'no-store' );
	res.setHeader( 'X-Content-Type-Options', 'nosniff' );
}

export function publicCORS( res ) {
	res.setHeader( 'Access-Control-Allow-Origin', '*' );
	res.setHeader( 'Access-Control-Allow-Methods', 'GET, POST, OPTIONS' );
	res.setHeader( 'Access-Control-Allow-Headers', 'Content-Type' );
}

export function methodNotAllowed( res, methods ) {
	res.setHeader( 'Allow', methods );
	return res.status( 405 ).json( { status: 'Method not allowed.' } );
}

export function storageFailure( res, error ) {
	// Only controlled messages reach logs; never return upstream bodies or credentials.
	console.error( 'Storage operation failed:', error.name );
	return res.status( 503 ).json( { status: 'Storage is temporarily unavailable. Please try again.' } );
}
