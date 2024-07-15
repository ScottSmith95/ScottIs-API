import utils from '../utilities.js';

export default async ( req, res ) => {

	const data = await utils.readData();

	const input = utils.sanitiseInput( req.body.response );
	const timestamp = utils.getTimestamp();
	const origin = req.headers.origin;
	const ip = req.headers[ 'x-forwarded-for' ] || req.connection.remoteAddress;
	let baseURL;
	if ( origin ) {
		baseURL = utils.getBaseURL( origin );
		// res.setHeader('Access-Control-Allow-Origin', baseURL);
	}

	if (
		utils.isNonemptyResponse( input )
		&& utils.isUniqueResponse( input, data )
		&& ( origin ? utils.domainCheck( origin ) : true )
		&& ( await utils.notBannedIP( ip ) )
	) {
		utils.writeToData( input, timestamp )
		.then( async () => {
			await utils.postSlackWebhook( input, timestamp );

			const response = { 'status': 'Success. Response recorded.' };
			response.response = input;
			res.status( 200 );
			res.json( response );
		} )
		.catch( error => {
			console.error( error );
			res.status( 500 ).send( error );
		} );
	} else {
		const response = { 'status': 'Response is a duplicate or empty.' };
		response.response = input;
		res.status( 202 ).json( response );
	}
};
