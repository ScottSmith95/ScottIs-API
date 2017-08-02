module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps : [
    {
      name   : 'ScottSmith.is API',
      script : 'api.js',
      watch  : true,
      ignore_watch: ["data.json", "node_modules"],
      env : {
	    'PORT': 2370
      },
      env_development: {
	    "BASE_URL": 'http://dev.scottsmith.is'
      }
    }
  ]
};
