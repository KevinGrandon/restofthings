var defaultUrl = "localhost:8090/?action=stream"
var http = require("http");
var url = require("url");
var express = require('express');
var getRawBody = require('raw-body');
var cors = require('cors');
var gpio = require("pi-gpio");
var request = require("superagent");
var argv = process.argv;
var app = express();
var port = argv[2];

//handle post/put
app.use(function (req, res, next) {
  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: 'utf8'
  }, function (err, string) {
    if (err)
      return next(err);
    req.text = string;
    next();
  })
});

app.use(cors());

app.get("/", function(req, res) {
        res.send(defaultUrl);
});
app.listen(port);

