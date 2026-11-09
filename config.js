import semver from 'semver';
import { readFileSync } from 'node:fs';

const appPackage = JSON.parse( readFileSync( new URL( './package.json', import.meta.url ), 'utf8' ) );
const api_semver = appPackage[ 'version' ];

const config  = {};
config.base_url = process.env.BASE_URL || 'https://api.scottsmith.is/';
config.api_version = `${ semver.major( api_semver ) }.${ semver.minor( api_semver ) }`;
config.data_api_root = 'https://api.cloudflare.com/client/v4/';
config.cf_accountid = process.env.CF_ACCOUNTID;
config.cf_kv_namespace_id = process.env.CF_KV_NAMESPACEID;
config.cf_auth_email = process.env.CF_AUTH_EMAIL;
config.cf_auth_key = process.env.CF_AUTH_KEY;
config.cf_api_token = process.env.CF_API_TOKEN;
config.allowed_origins = ( process.env.ALLOWED_ORIGINS || '' ).split( ',' ).map( origin => origin.trim() ).filter( Boolean );
config.deployHookURL = process.env.FRONTEND_DEPLOY_HOOK;
config.slackWebhookURL = process.env.SLACK_WEBHOOK;
config.pushcutWebhookURL = process.env.PUSHCUT_WEBHOOK;

export default config;
