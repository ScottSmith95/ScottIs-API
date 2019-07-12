const utils  = require( '../utilities' );

module.exports = async ( req, res ) => {

	const data = await utils.readData();

	const input = utils.sanitiseInput( req.body.response );
	const timestamp = utils.getTimestamp();
	const origin = req.headers.origin;
	const ip = req.headers[ 'x-forwarded-for' ] || req.connection.remoteAddress;
	let baseURL;

	if ( origin ) {
		baseURL = utils.getBaseURL( origin );
	}

	if (
		utils.isNonemptyResponse( input )
		&& utils.isUniqueResponse( input, data )
		&& ( origin ? utils.domainCheck( origin ) : true )
		&& ( await utils.notBannedIP( ip ) )
	) {
		utils.writeToData( input, timestamp )
		.then( () => {
			utils.postSlackWebhook( input, timestamp );

			const response = { 'status': 'Success. Response recorded.' };
			response.response = input;
			res.status( 200 );
			res.json( response );
		} )
		.catch( err => {
			console.error( err );
			res.status( 500 ).send( err );
		} );
	} else {
		if ( baseURL ) {
			res.append( 'Access-Control-Allow-Origin', baseURL ); // Since Nginx will not (by default) use add_headers on 202 responses.
		}
		const response = { 'status': 'Response is a duplicate or empty.' };
		response.response = input;
		res.status( 202 ).json( response );
	}
};
