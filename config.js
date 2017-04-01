const config  = {};
config.baseURL = process.env.BASE_URL || 'https://api.scottsmith.is/';
config.port = process.env.PORT || 8080;
config.api_version = 1.1;
config.data_file = process.env.DATA_FILE || 'data.json';

module.exports = config