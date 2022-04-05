# plonk

    npm run ws    # WebScoket dev server
    npm run watch # Webpack dev server

    import Plonk from "./Plonk";

    const plonk = new Plonk({
        wsUri: 'ws://127.0.0.1:3000/'
    });

    plonk.run();

An homage to Dinahmoe's Plink, written in 2013, updated to modern JS in 2022.

When looking for something other than a chat server to impplement using HTML5 Web Sockets,
I came across Plink, by the Swedish compnay DinahMoe, and so ripped-off the idea for fun.

The server code is basically a chat server, without any security.
