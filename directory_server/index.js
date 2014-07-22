const http = require("http")
const fs = require("fs")
const url = require("url")

var config = JSON.parse(fs.readFileSync(process.argv[2]))


// {ip:{uuid1: {expiryTime:unix, payload:{handlePing payload buffer}}}}
var things = {}

// make sure errors are not cached
function fail(response, code, message) {
  response.writeHead(code, {"Content-Type": "text/plain",
                            "Content-Length": message.length,
                           });
  response.write(message);
  console.log("fail", code, message, things);
  response.end();
}

function ok(response, message) {
  response.writeHead(200, {"Content-Type": "text/plain",
                           "Content-Length": message.length
                          });
  response.write(message);
  console.log("ok", message, things);
  response.end();
}

function putPing(uuid, remoteAddress, payload) {
  var network = things[remoteAddress];
  console.log("PUTPING network :  ", network);
  if (!network) {
    things[remoteAddress] = network = {};
  }
  var thing = network[uuid];
  if (!thing) {
    console.log("got no thing");
    network[uuid] = thing = {};
    console.log("network is ", network);
  }
  thing.expiryTime = Date.now();
  thing.payload = payload;
  console.log("PUTPING thing is ", thing);
  console.log("PUTPING payload is ",payload.toString());
  console.log("PUTPING things is ", things);
  console.log("PUTPING network ", network);
}

/** put json to /thing/stable-uuid 
 {'uuid':x, 'localurl':y, 'tags':["tag1", ..], 'description':"raspberry pi"}
 repeat calls here should just PUT an empty body...Server will 404 if body not already present
*/
function handlePing(uuid, request, response) {
  if (!('content-length' in request.headers)) {
    return fail(response, 500, "Missing content-length header");
  }
  console.log("HANDLEPING uuid", uuid);
  var content_length = request.headers['content-length'] * 1
  var buf = new Buffer(content_length); 
  var pos = 0;
  request.on('data', function(chunk) {
    chunk.copy(buf, pos);
    pos += chunk.length;
    console.log("i have data for uuid ", uuid, "data", chunk);
  }) 
  request.on('end', function() {
    var remoteAddress = request.connection.remoteAddress;
    console.log("request.connection.remoteAddress", request.connection.remoteAddress)
    putPing(uuid, remoteAddress, buf);
    ok(response, "OK");
  });
}

function handleGet(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST"); //?put
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  console.log("GOT A GET");
  var pathname = url.parse(request.url).pathname;
  console.log("in request the path is -----", pathname);
  var remoteAddress = request.connection.remoteAddress;
  console.log("my remote address is ------", remoteAddress);
  var network = things[remoteAddress];
  if (!network)
    network = {}

  if (pathname == "/ls") {
    console.log("LS: ", network, things);
    //astea le-am adaugat acu
    return ok(response, JSON.stringify(Object.keys(network)));
  } if (pathname.substr(0, 7) == "/thing/") {
    console.log("network is", network, things);
    var uuid = pathname.substr(7);
    var thing = network[uuid];

    if (!thing)
      return fail(response, 404, "No thing " + uuid + " in " + remoteAddress + " network");
    console.log("THINGS IS  :", things);
    console.log("PAYLOAD IS :", thing.payload);
    return ok(response, thing.payload);
  } else {
    return fail(response, 404, pathname + " not found");
  }
}

function handlePut(request, response) {
  var pathname = url.parse(request.url).pathname;
  if (pathname.substr(0,7) == "/thing/") {
    console.log("HANDLEPUT  i am in a put request and i make a request at ", pathname);
    return handlePing(pathname.substr(7), request, response);
  }
  response.write(pathname);
  console.log("handlePut: pathname----", pathname, things);
  response.end();
}

http.createServer(function(request, response) {
  var pathname = url.parse(request.url).pathname;
  console.log("my pathname is ----", pathname);
  console.log(request.method, pathname);
  if (request.method == "GET" || request.method == "HEAD") {
    return handleGet(request, response);
  } else if (request.method == "PUT") {
    return handlePut(request, response);
  } else {
    fail(response, 500, "what is this method:"+request.method);
  }
  //also handle CONNECT for proxying
}).listen(config.port, config.host);

console.log("Server running at\n  =>"+config.host+":" + config.port + "/\nCTRL + C to shutdown");
