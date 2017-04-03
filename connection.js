const mysql = require('mysql');

var connection = mysql.createConnection({
  host: 'localhost',
  user: 'leaderboard',
  password: 'redpaperheart',
  database: 'leaderboard',
  multipleStatements: true
});

connection.connect();

module.exports = { connection };
