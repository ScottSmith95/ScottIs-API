import semver from 'semver';
import { readFileSync } from 'fs';
import { join } from 'path';

const appPackage = JSON.parse( readFileSync( join( process.cwd(), 'package.json' ), 'utf8' ) );
const api_semver = appPackage[ 'version' ];

const config  = {};
config.base_url = process.env.BASE_URL || 'https://api.scottsmith.is/';
config.api_version = `${ semver.major( api_semver ) }.${ semver.minor( api_semver ) }`;
config.data_api_root = 'https://api.cloudflare.com/client/v4/';
config.cf_accountid = process.env.CF_ACCOUNTID;
config.cf_kv_namespace_id = process.env.CF_KV_NAMESPACEID;
config.cf_auth_email = process.env.CF_AUTH_EMAIL;
config.cf_auth_key = process.env.CF_AUTH_KEY;
config.slackWebhookURL = process.env.SLACK_WEBHOOK;

export default config;
