#!/usr/bin/env node
var WebSocketServer = require('websocket').server;
var http = require('http');

var cursors = {};

var server = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(8080, function() {
    console.log((new Date()) + ' Server is listening on port 8080');
});

var wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    maxReceivedFrameSize: 50
});

function originIsAllowed(origin) {
  // put logic here to detect whether the specified origin is allowed.
  return true;
}

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
      // Make sure we only accept requests from an allowed origin
      request.reject();
      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
      return;
    }

    var connection = request.accept('sec-websocket-protocol', request.origin);
    console.log((new Date()) + ' Connection accepted.');

	var id =  connection.socket._peername.family
		+':'+connection.socket._peername.address
		+':'+connection.socket._peername.port;
		
   connection.on('message', function(message) {
    		if (message.type === 'utf8') {
            // console.log('Received Message: ' + message.utf8Data);

            var csv = message.utf8Data.split(',');
            cursors[id] = {
            		userId: 		 csv[0],
            		xy: 			 [ parseInt(csv[1]), parseInt(csv[2])],
            		scaleCursor: parseInt(csv[3]),
            		gain:		 parseInt(csv[4]),
            		pain:		 parseInt(csv[5]),
            		patch:		 parseInt(csv[6]),
            		pitch:		 parseInt(csv[7]),
            };
            connection.sendUTF(JSON.stringify({ cursors: cursors} ));
        }
        else if (message.type === 'binary') {
            console.warn('Ignoring received Binary Message of ' + message.binaryData.length + ' bytes');
            connection.close();
        }
    });
    
    connection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    		delete cursors[id];
    });
});
