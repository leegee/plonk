#!/usr/bin/env node

/**
 * This is pretty much the basic example from the 'websocket' package's `README.md`.
**/

const WebSocketServer = require('websocket').server;
const http = require('http');

const PORT = 3000;

const CURSORS = {};

const httpServer = http.createServer((request, response) => {
    console.log((new Date()), 'Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});

const wsServer = new WebSocketServer({
    httpServer,
    autoAcceptConnections: false,
    maxReceivedFrameSize: 50
});

httpServer.listen(PORT, function () {
    console.log((new Date()), 'Server is listening on port 8080');
});

// Could test request.origin and request.reject();
wsServer.on('request', function (request) {
    const cx = request.accept('sec-websocket-protocol', request.origin);
    console.log((new Date()), 'Connection accepted from', request.remoteAddress);
    handleWsCx(cx);
});

// CURSORS was indexed by connection, but now by ID
// const cxId = [ cx.socket._peername.family, cx.socket._peername.address, cx.socket._peername.port ].join(':');
function handleWsCx(cx) {
    cx.on('message', (message) => {
        if (message.type === 'binary') {
            console.warn('Ignoring received Binary Message of ' + message.binaryData.length + ' bytes');
            cx.close();
        }

        // console.log('Received Message: ' + message.utf8Data);

        const csv = message.utf8Data.split(',');

        const userId = csv[0];

        CURSORS[userId] = {
            userId,
            xy: [parseInt(csv[1]), parseInt(csv[2])],
            scaleCursor: parseInt(csv[3]),
            gain: parseInt(csv[4]),
            pain: parseInt(csv[5]),
            patch: parseInt(csv[6]),
            pitch: parseInt(csv[7]),
        };

        cx.sendUTF(JSON.stringify({ cursors: CURSORS }));
    });

    cx.on('close', function (reasonCode, description) {
        console.log((new Date()), 'Peer ' + cx.remoteAddress + ' disconnected.', reasonCode, description);
        // delete CURSORS[cxId];
    });
}

