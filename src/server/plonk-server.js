#!/usr/bin/env node

/**
 * This is pretty much the basic example from the 'websocket' package's `README.md`.
 **/

const WebSocketServer = require('websocket').server;
const http = require('http');

const PORT = 3000;

const Cursors = {};
let Users_Seen = 0;

const httpServer = http.createServer((request, response) => {
  console.log(new Date(), 'Received request for ' + request.url);
  response.writeHead(404);
  response.end();
});

const wsServer = new WebSocketServer({
  httpServer,
  autoAcceptConnections: false,
  maxReceivedFrameSize: 50,
});

httpServer.listen(PORT, function () {
  console.log(new Date(), 'Server is listening on port 8080');
});

// Could test request.origin and request.reject();
wsServer.on('request', function (request) {
  const cx = request.accept('sec-websocket-protocol', request.origin);
  console.log(new Date(), 'Connection accepted from', request.remoteAddress);
  handleWsCx(cx);
});

function handleWsCx(cx) {
  // const userId = ++Users_Seen;

  cx.on('message', (message) => {
    if (message.type === 'binary') {
      console.warn(
        'Ignoring received Binary Message of ' +
          message.binaryData.length +
          ' bytes'
      );
      cx.close();
    }

    const csv = message.utf8Data.split(',');

    const userId = csv.shift();

    Cursors[userId] = {
      userId,
      scaleCursor: parseInt(csv.shift()),
      gain: parseInt(csv.shift()),
      pan: parseInt(csv.shift()),
      patch: parseInt(csv.shift()),
      pitch: parseInt(csv.shift()),
    };

    if (Cursors[userId].pitch === -1) {
      delete Cursors[userId];
    }

    cx.sendUTF(JSON.stringify({ cursors: Cursors }));

    console.log('Received Message: ' + message.utf8Data);
    console.log('Made Message: ' + JSON.stringify(Cursors[userId], null, 2));
  });

  cx.on('close', function (reasonCode, description) {
    console.log(
      new Date(),
      'Peer ' + cx.remoteAddress + ' disconnected.',
      reasonCode,
      description
    );
    // delete CURSORS[cxId];
  });
}
