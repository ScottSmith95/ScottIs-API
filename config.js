const semver = require( 'semver' );
const api_semver = require( './package.json' )[ 'version' ];

const config  = {};
config.base_url = process.env.BASE_URL || 'https://api.scottsmith.is/';
config.port = process.env.PORT || 8080;
config.api_version = `${ semver.major( api_semver ) }.${ semver.minor( api_semver ) }`;
config.data_file = process.env.DATA_FILE || 'data.json';
config.slackWebhookURL = process.env.SLACK_WEBHOOK;
config.banned = require( './bans' );

module.exports = config;
