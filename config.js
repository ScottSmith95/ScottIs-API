const semver = require( 'semver' );
const api_semver = require( './package.json' )[ 'version' ];

const config  = {};
config.base_url = process.env.BASE_URL || 'https://api.scottsmith.is/';
config.api_version = `${ semver.major( api_semver ) }.${ semver.minor( api_semver ) }`;
config.data_api_root = 'https://api.jsonbin.io';
config.data_bin_id = process.env.JSONBIN_DATA_ID;
config.data_api_key = process.env.JSONBIN_KEY;
config.slackWebhookURL = process.env.SLACK_WEBHOOK;
config.bans_bin_id = process.env.JSONBIN_BANS_ID;

module.exports = config;
