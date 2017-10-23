module.exports = {
/**
 * Application configuration section
 * http://pm2.keymetrics.io/docs/usage/application-declaration/
 */
apps : [
	{
		name   : 'ScottSmith.is API',
		script : 'api.js',
		cwd    : '/var/www/scottsmith.is/api/',
		watch  : true,
		ignore_watch: [".git", "data.json", "node_modules"],
		env: {
			'PORT': 2370
		},
		env_development: {
			"BASE_URL": 'http://dev-api.scottsmith.is'
		}
	}
]
};
