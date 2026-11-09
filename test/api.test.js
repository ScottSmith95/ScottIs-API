import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import utils from '../utilities.js';
import getResponses from '../api/responses_get.js';
import postResponse from '../api/responses_post.js';
import deleteResponse from '../api/delete_response.js';

const originalConfig = { ...config };
const realFetch = globalThis.fetch;
const contextSymbol = Symbol.for( '@vercel/request-context' );
const originalContext = globalThis[ contextSymbol ];
let calls;
let pending;
let responses;
let bans;
let readStatus;
let writeStatus;
let writeSuccess;
let webhookStatus;
let webhookGate;

beforeEach( () => {
	Object.assign( config, {
		cf_accountid: 'test-account', cf_kv_namespace_id: 'test-namespace',
		cf_auth_email: 'test@example.com', cf_auth_key: 'test-key', cf_api_token: undefined,
		allowed_origins: [],
		base_url: 'https://api.scottsmith.is/', slackWebhookURL: undefined, pushcutWebhookURL: undefined
	} );
	calls = [];
	pending = [];
	responses = { '1700000000000': 'nice', '1700000000001': 'funny' };
	bans = [];
	readStatus = 200;
	writeStatus = 200;
	writeSuccess = true;
	webhookStatus = 200;
	webhookGate = null;
	globalThis[ contextSymbol ] = { get: () => ( { waitUntil: promise => pending.push( promise ) } ) };
	globalThis.fetch = async ( url, options = {} ) => {
		calls.push( { url, ...options } );
		assert.ok( options.signal instanceof AbortSignal, 'Every upstream call has a deadline' );
		if ( url.startsWith( 'https://hooks.example.com/' ) ) {
			if ( webhookGate ) await webhookGate;
			return new Response( 'ok', { status: webhookStatus } );
		}
		if ( options.method === 'PUT' ) {
			if ( writeStatus === 200 && writeSuccess ) responses = JSON.parse( options.body );
			return Response.json( { success: writeSuccess }, { status: writeStatus } );
		}
		return Response.json( url.endsWith( '/bans' ) ? bans : responses, { status: readStatus } );
	};
} );

afterEach( async () => {
	await Promise.all( pending );
	Object.assign( config, originalConfig );
	globalThis.fetch = realFetch;
	if ( originalContext === undefined ) delete globalThis[ contextSymbol ];
	else globalThis[ contextSymbol ] = originalContext;
} );

function responseRecorder() {
	return {
		statusCode: 200, headers: {}, body: undefined,
		setHeader( key, value ) { this.headers[ key.toLowerCase() ] = value; },
		status( code ) { this.statusCode = code; return this; },
		json( body ) { this.body = body; return this; },
		send( body ) { this.body = body; return this; },
		end() { return this; }
	};
}

async function invoke( handler, overrides = {} ) {
	const res = responseRecorder();
	await handler( { method: 'GET', headers: {}, query: {}, ...overrides }, res );
	return res;
}

function submit( body, extra = {} ) {
	return invoke( postResponse, { method: 'POST', body, ...extra } );
}

test( 'GET preserves the timestamp map and selects newest entries in chronological order', async () => {
	const result = await invoke( getResponses, { query: { limit: '1' } } );
	assert.equal( result.statusCode, 200 );
	assert.deepEqual( result.body, { '1700000000001': 'funny' } );
	assert.equal( result.headers[ 'access-control-allow-origin' ], '*' );
	assert.equal( result.headers[ 'cache-control' ], 'no-store' );
} );

test( 'GET without a limit and an empty dataset remain supported', async () => {
	assert.deepEqual( ( await invoke( getResponses ) ).body, responses );
	responses = {};
	assert.deepEqual( ( await invoke( getResponses ) ).body, {} );
} );

test( 'invalid or repeated limits return 400 before reading storage', async () => {
	for ( const limit of [ '', '0', '-1', '1.5', 'abc', 'Infinity', '1e2', '9007199254740992', [ '1', '2' ] ] ) {
		assert.equal( ( await invoke( getResponses, { query: { limit } } ) ).statusCode, 400 );
	}
	assert.equal( calls.length, 0 );
} );

test( 'failed storage reads return a generic error and never leak the upstream response', async () => {
	readStatus = 403;
	responses = { errors: [ 'sensitive upstream details' ] };
	const result = await invoke( getResponses );
	assert.equal( result.statusCode, 503 );
	assert.doesNotMatch( JSON.stringify( result.body ), /sensitive|test-key/ );
} );

test( 'malformed storage is rejected without overwriting it', async () => {
	for ( const invalid of [ null, [], { success: false }, { '1700000000000': 12 }, { '__bad_key__': 'nice' } ] ) {
		responses = invalid;
		assert.equal( ( await submit( { response: 'hello' } ) ).statusCode, 503 );
	}
	assert.ok( calls.every( call => call.method !== 'PUT' ) );
} );

test( 'GET and POST endpoints reject unsupported methods, including direct function requests', async () => {
	for ( const [ handler, method ] of [ [ getResponses, 'POST' ], [ postResponse, 'GET' ], [ deleteResponse, 'DELETE' ] ] ) {
		const result = await invoke( handler, { method } );
		assert.equal( result.statusCode, 405 );
		assert.ok( result.headers.allow );
	}
	assert.equal( calls.length, 0 );
} );

test( 'CORS preflight accepts JSON submissions without reading storage', async () => {
	for ( const handler of [ getResponses, postResponse ] ) {
		const result = await invoke( handler, { method: 'OPTIONS' } );
		assert.equal( result.statusCode, 204 );
		assert.match( result.headers[ 'access-control-allow-methods' ], /POST/ );
		assert.equal( result.headers[ 'access-control-allow-headers' ], 'Content-Type' );
	}
	assert.equal( calls.length, 0 );
} );

test( 'missing, non-string, oversized and empty input are rejected before storage', async () => {
	for ( const body of [ undefined, null, {}, { response: null }, { response: 123 }, { response: [] },
		{ response: {} }, { response: '' }, { response: '   ' }, { response: 'x'.repeat( 21 ) }, { response: '<b> </b>' } ] ) {
		assert.equal( ( await submit( body ) ).statusCode, 400 );
	}
	assert.equal( calls.length, 0 );
} );

test( 'a valid submission persists once and returns the front-end success contract', async () => {
	const result = await submit( { response: '  helpful! ' }, { headers: { origin: 'https://scottsmith.is' } } );
	assert.equal( result.statusCode, 200 );
	assert.equal( result.body.status, 'Success. Response recorded.' );
	assert.equal( result.body.response, 'helpful' );
	assert.equal( typeof result.body.timestamp, 'number' );
	assert.equal( responses[ result.body.timestamp ], 'helpful' );
	assert.equal( calls.filter( call => call.url.endsWith( '/responses' ) && call.method !== 'PUT' ).length, 1 );
	assert.equal( calls.filter( call => call.method === 'PUT' ).length, 1 );
} );

test( 'duplicates preserve 202 and do not write or notify', async () => {
	const result = await submit( { response: 'NICE' } );
	assert.equal( result.statusCode, 202 );
	assert.equal( result.body.response, 'NICE' );
	assert.ok( calls.every( call => call.method !== 'PUT' ) );
	assert.equal( pending.length, 0 );
} );

test( 'storage HTTP failures and unsuccessful write envelopes never report success', async () => {
	for ( const [ status, success ] of [ [ 403, false ], [ 429, false ], [ 500, false ], [ 200, false ] ] ) {
		writeStatus = status;
		writeSuccess = success;
		assert.equal( ( await submit( { response: 'hello' } ) ).statusCode, 503 );
	}
	assert.equal( pending.length, 0 );
} );

test( 'network errors and timeouts become controlled failures', async () => {
	globalThis.fetch = async () => { throw new DOMException( 'secret URL', 'TimeoutError' ); };
	assert.equal( ( await invoke( getResponses ) ).statusCode, 503 );
	assert.equal( ( await submit( { response: 'hello' } ) ).statusCode, 503 );
} );

test( 'origin checks reject lookalikes, shared hosting, invalid URLs and unexpected ports', async () => {
	for ( const origin of [ 'https://scottsmith.is.evil.com', 'https://evilscottsmith.is', 'https://evil.now.sh',
		'https://evil.vercel.app', 'http://scottsmith.is', 'https://scottsmith.is:9999', 'null', 'invalid', [ 'https://scottsmith.is' ] ] ) {
		assert.equal( ( await submit( { response: 'hello' }, { headers: { origin } } ) ).statusCode, 403 );
	}
	assert.equal( calls.length, 0 );
	assert.equal( utils.domainCheck( 'https://dev.scottsmith.is' ), true );
	config.allowed_origins = [ 'http://localhost:8080', 'https://specific-preview.vercel.app' ];
	assert.equal( utils.domainCheck( 'http://localhost:8080' ), true );
	assert.equal( utils.domainCheck( 'https://specific-preview.vercel.app' ), true );
} );

test( 'a banned IP in a forwarded list cannot submit', async () => {
	bans = [ '192.0.2.1' ];
	const result = await submit( { response: 'hello' }, { headers: { 'x-forwarded-for': '192.0.2.1, 192.0.2.2' } } );
	assert.equal( result.statusCode, 403 );
	assert.equal( calls.length, 1 );
} );

test( 'malformed ban storage fails closed', async () => {
	bans = { success: false };
	assert.equal( ( await submit( { response: 'hello' } ) ).statusCode, 503 );
	assert.equal( calls.length, 1 );
} );

test( 'a timestamp already in the snapshot is not overwritten', async () => {
	const timestamp = await utils.writeToData( 'hello', 1700000000000, responses );
	assert.equal( timestamp, 1700000000002 );
	assert.equal( responses[ '1700000000000' ], 'nice' );
	assert.equal( responses[ timestamp ], 'hello' );
} );

test( 'background notification work is registered without delaying the response', async () => {
	config.slackWebhookURL = 'https://hooks.example.com/slack';
	config.pushcutWebhookURL = 'https://hooks.example.com/pushcut';
	let release;
	webhookGate = new Promise( resolve => { release = resolve; } );
	try {
		const result = await submit( { response: 'hello' } );
		assert.equal( result.statusCode, 200 );
		assert.equal( pending.length, 1 );
		const hooks = calls.filter( call => call.url.startsWith( 'https://hooks.example.com/' ) );
		assert.equal( hooks.length, 2 );
		assert.ok( hooks[ 0 ].body.includes( utils.deletionURL( result.body.timestamp ) ) );
		assert.equal( JSON.parse( hooks[ 1 ].body ).id, String( result.body.timestamp ) );
	} finally {
		release();
	}
} );

test( 'notification failure cannot turn a persisted submission into a failure', async () => {
	config.slackWebhookURL = 'https://hooks.example.com/slack';
	webhookStatus = 500;
	const result = await submit( { response: 'hello' } );
	assert.equal( result.statusCode, 200 );
	await Promise.all( pending );
	assert.equal( responses[ result.body.timestamp ], 'hello' );
} );

test( 'unconfigured webhooks are optional and generate no network calls', async () => {
	assert.equal( await utils.postSlackWebhook( 'hello', 1700000000000 ), null );
	assert.equal( await utils.postPushcutWebhook( 'hello', 1700000000000 ), null );
	assert.equal( calls.length, 0 );
} );

test( 'deletion links work without extra configuration and appear in notifications', async () => {
	const timestamp = '1700000000000';
	const url = utils.deletionURL( timestamp );
	assert.equal( url, `https://api.scottsmith.is/v1.5/delete_response/${ timestamp }` );
	config.pushcutWebhookURL = 'https://hooks.example.com/pushcut';
	await utils.postPushcutWebhook( 'hello', Number( timestamp ) );
	assert.equal( JSON.parse( calls[ 0 ].body ).actions[ 0 ].url, url );
} );

test( 'malformed and repeated deletion timestamps are rejected without storage access', async () => {
	for ( const method of [ 'GET', 'POST' ] ) {
		for ( const timestamp of [ undefined, '', '__proto__', '<script>', '-1', [ '1700000000000' ] ] ) {
			assert.equal( ( await invoke( deleteResponse, { method, query: { timestamp } } ) ).statusCode, 400 );
		}
	}
	assert.equal( calls.length, 0 );
} );

test( 'GET renders confirmation without touching storage', async () => {
	const timestamp = '1700000000000';
	const result = await invoke( deleteResponse, { query: { timestamp } } );
	assert.equal( result.statusCode, 200 );
	assert.match( result.body, /form method="post"/ );
	assert.ok( result.body.includes( 'action=""' ) );
	assert.equal( result.headers[ 'referrer-policy' ], 'no-referrer' );
	assert.match( result.headers[ 'content-security-policy' ], /frame-ancestors 'none'/ );
	assert.equal( result.headers[ 'access-control-allow-origin' ], undefined );
	assert.equal( calls.length, 0 );
} );

test( 'POST deletes the selected response and returns 404 on repeat', async () => {
	const request = { method: 'POST', query: { timestamp: '1700000000000' } };
	assert.equal( ( await invoke( deleteResponse, request ) ).statusCode, 200 );
	assert.deepEqual( responses, { '1700000000001': 'funny' } );
	assert.equal( ( await invoke( deleteResponse, request ) ).statusCode, 404 );
} );

test( 'failed deletion writes return 503 and leave the record intact', async () => {
	writeSuccess = false;
	const timestamp = '1700000000000';
	assert.equal( ( await invoke( deleteResponse, { method: 'POST', query: { timestamp } } ) ).statusCode, 503 );
	assert.equal( responses[ timestamp ], 'nice' );
} );

test( 'scoped Cloudflare tokens take precedence over legacy global credentials', async () => {
	config.cf_api_token = 'test-scoped-token';
	await utils.readData();
	assert.equal( calls[ 0 ].headers.Authorization, 'Bearer test-scoped-token' );
	assert.equal( calls[ 0 ].headers[ 'X-Auth-Key' ], undefined );
} );

test( 'missing storage credentials fail without making a request', async () => {
	config.cf_auth_key = undefined;
	assert.equal( ( await invoke( getResponses ) ).statusCode, 503 );
	assert.equal( calls.length, 0 );
} );

const formHeaders = {
	origin: 'https://scottsmith.is',
	accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

test( 'native form success redirects without exposing input or returning HTML', async () => {
	const result = await submit( { response: 'helpful' }, { headers: formHeaders } );
	assert.equal( result.statusCode, 303 );
	assert.equal( result.headers.location, 'https://scottsmith.is/#sent' );
	assert.equal( result.headers[ 'cache-control' ], 'no-store' );
	assert.equal( result.body, undefined );
	assert.equal( calls.filter( call => call.method === 'PUT' ).length, 1 );
	assert.ok( Object.values( responses ).includes( 'helpful' ) );
} );

test( 'native form duplicate and validation errors redirect without writing', async () => {
	const duplicate = await submit( { response: 'nice' }, { headers: formHeaders } );
	assert.equal( duplicate.statusCode, 303 );
	assert.equal( duplicate.headers.location, 'https://scottsmith.is/#duplicate' );
	for ( const body of [ {}, { response: '   ' }, { response: 'x'.repeat( 21 ) } ] ) {
		const result = await submit( body, { headers: formHeaders } );
		assert.equal( result.statusCode, 303 );
		assert.equal( result.headers.location, 'https://scottsmith.is/#error' );
	}
	assert.ok( calls.every( call => call.method !== 'PUT' ) );
} );

test( 'native form storage failures and bans never redirect to success', async () => {
	writeSuccess = false;
	const failed = await submit( { response: 'helpful' }, { headers: formHeaders } );
	assert.equal( failed.statusCode, 303 );
	assert.equal( failed.headers.location, 'https://scottsmith.is/#error' );
	bans = [ '192.0.2.1' ];
	const banned = await submit( { response: 'helpful' }, { headers: { ...formHeaders, 'x-forwarded-for': '192.0.2.1' } } );
	assert.equal( banned.headers.location, 'https://scottsmith.is/#error' );
	assert.equal( pending.length, 0 );
} );

test( 'native form redirects use only validated origins or the fixed fallback', async () => {
	const dev = await submit( { response: 'nice' }, { headers: { ...formHeaders, origin: 'https://dev.scottsmith.is' } } );
	assert.equal( dev.headers.location, 'https://dev.scottsmith.is/#duplicate' );
	const denied = await submit( { response: 'hello' }, { headers: { ...formHeaders, origin: 'https://scottsmith.is.evil.com' } } );
	assert.equal( denied.headers.location, 'https://scottsmith.is/#error' );
	assert.ok( calls.every( call => call.method !== 'PUT' ) );
	const missing = await submit( { response: 'nice' }, { headers: { ...formHeaders, origin: undefined } } );
	assert.equal( missing.headers.location, 'https://scottsmith.is/#duplicate' );
} );

test( 'JSON and wildcard clients retain the API contract even for URL-encoded bodies', async () => {
	for ( const accept of [ 'application/json', '*/*', 'text/html;q=0', 'text/html,application/json' ] ) {
		const result = await submit( { response: 'nice' }, { headers: { ...formHeaders, accept } } );
		assert.equal( result.statusCode, 202 );
		assert.equal( result.body.response, 'nice' );
		assert.equal( result.headers.location, undefined );
	}
	const jsonBody = await submit( { response: 'nice' }, { headers: { ...formHeaders, 'content-type': 'application/json' } } );
	assert.equal( jsonBody.statusCode, 202 );
	assert.equal( jsonBody.headers.location, undefined );
} );
