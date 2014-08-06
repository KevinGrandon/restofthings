var net = require("net");
var http = require("http");
var crypto = require("crypto");
var url = require("url");
var express = require('express');
var getRawBody = require('raw-body');
var fs = require('fs');
var cors = require('cors');
var config = JSON.parse(fs.readFileSync(process.argv[2]));
var app = express();

app.use(cors());

//handle post/put
app.use(function (req, res, next) {
  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: 'utf8'
  }, function (err, string) {
    if (err)
      return next(err)

    req.text = string
    next()
  })
});

//in case you still want to run a tagging page on pi
//app.use(express.static(__dirname + '/public'));

var state = {};

try {
  state = JSON.parse(fs.readFileSync(config.tagFile));
} catch(e) {
  console.warn("Failed to parse " + config.tagFile + "\n" + e)
}

app.get("/tags/", function(req, res) {
  console.log('i am in get tags');
  res.json(state);
});

function commit(callback) {
  fs.writeFile(config.tagFile, JSON.stringify(state), callback);
  console.log('i an in commit file');
}

app.put(/^\/tags\/[A-z:0-9.-]+$/, function(req, res, next) {
  var tagName = req.path.substr("/tags/".length);
  console.log('i am in put and i want to write a tag : ', tagName);
  state[tagName] = req.text;
  commit(function(err) {
    if (err)
      return next(err);
    res.send("OK");
  });
});

app.delete(/^\/tags\/([A-z:0-9.-]+|\*)$/, function(req, res, next) {
  var tagName = req.path.substr("/tags/".length);
  delete state[tagName];
  if (tagName == "*")
    state = {};

  commit(function(err) {
    if (err)
      return next(err);
    res.send("OK");
  });
});

app.get("/features", function (req, res) {
  res.json(config.features);
});

var server = app.listen(config.port, function() {
    console.log('Listening on port %d', server.address().port);
});

function getUUID() {
  if (config.uuid !== undefined) {
      return config.uuid;
  }

  var dir = "/sys/class/net/";
  var interfaces = fs.readdirSync(dir);
  //interfaces.sort();
  var macs = interfaces.map(function (interface) {
       return fs.readFileSync(dir + interface + "/address");
  }).join("");
  var sha1 = crypto.createHash('sha1');
  sha1.update(macs);
  return sha1.digest('hex');
}

function getOwnAddress(port, hostname, callback) {
  var socket = net.createConnection(port, hostname);
  socket.on('connect', function () {
    //var self = "http://" + socket.address().address + ":" + config.port;
    var self = "http://" + socket.address().address + ":" + config.proxyport;
    socket.destroy();
    callback(null, self)
  });
  socket.on('error', function (err) {
    socket.destroy();
    callback(err);
  });
}

function registerWithDirectoryServer() {
  var retryTimeout = 5000;
  var directoryUrl = url.parse(config.directoryServer);

  function errorHandler(err) {
    console.error("Failed to connect to directory server:" + config.directoryServer, err.message);
    console.error("Will retry in " + retryTimeout/1000 + " seconds"); 
    setTimeout(registerWithDirectoryServer, retryTimeout);
  }

  getOwnAddress(directoryUrl.port, directoryUrl.hostname, function (err, url) {
    if (err) {
      return errorHandler(err);
    }
    
    var uuid = getUUID();
    //var payload = JSON.stringify({"uuid":uuid, "localURL":url});
    console.log("config.features are |0/ :", config.features);
    var payload = JSON.stringify({"uuid":uuid, "localURL":url, "features": config.features});
    var options = {
      host: directoryUrl.hostname,
      port: directoryUrl.port,
      path: '/thing/' + uuid,
      method: 'PUT',
      headers: {"Content-Length":payload.length}
    };

    var req = http.request(options, function(res) {
      console.log('STATUS: ' + res.statusCode);
      console.log('HEADERS: ' + JSON.stringify(res.headers));
      var ret = "";
      res.on('data', function (chunk) {
        ret += chunk;
      });
      res.on('end', function () {
        if (res.statusCode == 200) {
          console.log("Registered " + payload);
        } else {
          console.error("Directory server rejected with code "+res.statusCode+": " + ret);
        }
      });
    });

    req.on('error', function(e) {
      errorHandler(e);
    });

    // write data to request body
    req.write(payload);
    req.end();
  });
}

registerWithDirectoryServer();
