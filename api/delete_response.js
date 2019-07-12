const utils  = require( '../utilities' );

module.exports = ( req, res ) => {

	const timestamp = req.query.timestamp;

	return utils.deleteFromData( timestamp )
	.then( status => {
		if ( status ) {
			const response = { 'status': 'Success. Response deleted.' };
			res.status( 200 ).json( response );
		} else {
			const response = { 'status': 'Response not found.' };
			res.status( 202 ).json( response );
		}
	} )
	.catch( error => {
		console.error( error );
		res.status( 500 ).send( error );
	} )
};
