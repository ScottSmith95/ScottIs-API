const utils  = require( '../utilities' );

module.exports = async ( req, res ) => {
	const reqLimit = req.query.limit;

	const data = await utils.readData( reqLimit );

	if ( typeof data !== 'undefined' ) {
		return res.status( 200 ).json( data );
	}
	return res.status( 500 ).send();
};
