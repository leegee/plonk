/** SSS.Plonk.js **/

let ACTX;

class Patch {
	aBuffers = [];	// List of list of loaded audio buffers for user sounds
	pulses = null;
	ready = false;

	constructor(baseUri, pulses) {
		this.pulses = pulses;
		if (!(pulses instanceof Array && pulses.length > 0)) {
			this.pulses = null;
		}

		this.baseUri = baseUri;

		var uris = [];

		for (let note = 1; note <= 11; note++) {
			uris.push(baseUri + '/' + note + '.wav');
		}

		const bufferLoader = new BufferLoader(
			ACTX,
			uris,
			(bufferList) => {
				this.aBuffers = bufferList;
				this.ready = true;
				console.log("Loaded " + bufferList.length + " from " + this.baseUri);
			}
		);
		bufferLoader.load();
	};

	/* Play at the specified pitch, optinally specifying gain and pan */
	playNow(pitch, gain = 1, pan = 0) {
		if (!this.ready) {
			return;
		}
		const node = ACTX.createBufferSource();
		node.buffer = this.aBuffers[pitch];
		const gainNode = ACTX.createGainNode();
		gainNode.gain.value = gain;
		node.connect(gainNode);
		let panNode;
		if (pan) {
			panNode = ACTX.createPanner();
			panNode.setPosition(pan, 0, 1);
			gainNode.connect(panNode);
		} else {
			panNode = gainNode
		}
		panNode.connect(ACTX.destination);
		node.noteOn(0);
	}
};

class Plonk {
	// Implements: [Options],

	x = null;		// Mouse position
	y = null;		// Mouse position
	pitch = null;		// current pitch; from this.y
	playNote = false;		// Is a note being played?
	xCtrl = 'nothing';	// Notes what horizontal mouse movement controls
	canvas = null;		// The canvas this code creates
	ctx = null;		// Canvas context
	wsUri = null;		// Web socket server URI sans port
	wsPort = 3000;		// Web socket server port
	anchor = null;		// Cursor offset relative to canvas
	element = null;		// Inst from options.element
	websocket = null;		// Instance of the obvious
	cursors = null;		// State from server
	cursorStack = [];			// Previouos cursors; for scrollig graphics; on subarray per pulse
	pulseNumber = 0;			// keep a beat
	pulseTimer = null;		// setTimeout
	scrollTimer = null;		// setTimeout
	scaleCursor = null;		// Controls circle size/growth
	patch = 1;			// Initial patch= 0 must be percission
	gain = 1;			// volume
	pan = 0;			// pan
	userId = 'Plonker';	// Displayed by cursor
	percNames = ['kick', 'snare', 'hat_closed'];	// For ease of programming
	patches = [];			// Loaded on instantiation

	options = {
		element: null,	// DOM element into which to insert this app
		xcontrolsElement: null,	// Element into which to place controller options
		canvasWidth: 700,		// Size of the canvas for its
		canvasHeight: 500,		// Attributes and CSS.
		cursorX: 700,		// x position of cursor relative to canvas
		circleRadius: 5,		// Circles that represent sound
		cursorScaleIncrement: .3,		// Amount by which to increase cursor size
		initialScaleFactor: .4,		// Relates to changing size of circles

		scrollPx: 4,		// Pixels to scroll each scrollMS
		scrollMS: 1000 / 32,	// Frames per second

		pulseMS: 1000 / 8,// Sending to server, and rendering sound and cursors

		// Sounds:
		patchHeight: 20,		// Patch selector
		// XXX TODO Replace these bland colours:
		patchClrs: ['purple', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red'],
		// These always pulse:
		percussion: {
			kick: [[4, 1]],
			snare: [[16, 2]],
			hat_closed: [[1, 0], [4, 2]]
		},

		// XXX TODO Add more patch pulses:
		patches: [
			{ uri: 'samples/percussion' },
			{
				uri: 'samples/ambient_house_chords', pulses: [
					[2, 1],
				]
			},
			{ uri: 'samples/eighties_phaser_pulse' },
			{ uri: 'samples/pluck' },
			{ uri: 'samples/dark_pluck_bass' },
		]
	};

	constructor(options) {
		this.options.element = options.element;
		this.options.xcontrolsElement = options.xcontrolsElement;
		this.options.wsUri = options.wsUri;

		if (typeof AudioContext === "function") {
			ACTX = new AudioContext();
		} else if (typeof webkitAudioContext === "function") {
			ACTX = new webkitAudioContext();
		}
		else {
			throw ('This browser does not support Web Audio Context');
		}

		// Load samples:
		this.options.patches.forEach((patch) => {
			this.patches.push(new Patch(
				patch.uri,
				typeof patch.pulses !== 'undefined' ? patch.pulses : null
			));
		});

		this.makeGUI();

		const rect = this.canvas.getBoundingClientRect();
		this.anchor = { x: rect.left, y: rect.top };
		this.ctx = this.canvas.getContext('2d');
		this.ctx.font = '12px Sans';

		this.wsUri = this.options.wsUri || "ws://" + window.location.hostname + ':' + this.options.wsPort;
		console.log("Connect to wsUri of " + this.wsUri);
		this.connect();
	};

	/* Add event listeners */
	initEvents() {
		console.log('Enter initEvents');

		// React to movement of the mouse
		this.canvas.addEventListener('mousemove', (e) => {
			// Make co-ords absolute within canvas
			this.x = e.pageX - this.anchor.x;
			this.y = e.pageY - this.anchor.y;
		});

		// Mouse down to make a note:
		this.element.addEventListener('mousedown', (e) => {
			this.playNote = true;
			e.stopPropagation();
		});

		// Mouse up to stop making a note:
		this.element.addEventListener('mouseup', (e) => {
			this.playNote = false;
			e.stopPropagation();
		});

		// Scroll the canvas
		this.scrollTimer = setInterval(
			this.scroll.bind(this),
			this.options.scrollMS
		);

		// Periodically send the cursor position and redraw
		this.pulseTimer = setInterval(
			this.pulse.bind(this),
			this.options.pulseMS
		);

		console.log('Leave initEvents');
	};

	/* Kill the timers used for playing and rendering */
	destroy() {
		clearInterval(this.scrollTimer);
		clearInterval(this.pulseTimer);
	};

	makeGUI() {
		this.element = document.getElementById(this.options.element);
		this.ctrlsEl = document.getElementById(this.options.xcontrolsElement);

		if (this.options.fillWindow) {
			this.options.canvasHeight = window.getSize().y;
		}

		this.element.style.position = 'relative';

		this.canvas = document.getElementById('canvas');

		// Controls for patch change:
		const patches = document.createElement('div');

		patches.id = 'patches',
			patches.setAttribute('styles',
				'top:' + (this.options.canvasHeight - (this.options.patchHeight * this.patches.length)) / 2
			);

		for (var i = 0; i < this.patches.length; i++) {
			console.info("Set patch ctrl " + i);
			const p = document.createElement('div');
			p.setAttribute('class', 'patch');
			p.setAttribute('styles',
				'height: ' + this.options.patchHeight +
				'width: ' + this.options.patchHeight +
				'background: ' + this.options.patchClrs[i]
			);
			p.addEventListener('click', (e) => {
				e.stopPropagation();
				this.patch = p.patch;
			});

			p.patch = i;
			patches.appendChild(p);
		}

		this.element.appendChild(patches);

		// User name
		// var p = document.createElement('p', { html: 'User ID:&nbsp;' }).inject(this.ctrlsEl);
		// p.appendChild(new Element('input', {
		// 	type: 'text', value: this.userId, events: {
		// 		change:  (e) => {
		// 			this.userId = e.target.value
		// 		}
		// 	}
		// }));

		// X-cursor options:
		['nothing', 'volume', 'pan'].forEach((i) => {
			document.getElementById('ctrl-' + i).addEventListener('change', (e) => this.xCtrl = i);
		});
	};

	toElement() {
		return this.element;
	};

	connect() {
		console.log('Enter connect');
		if (window.MozWebSocket) {
			window.WebSocket = window.MozWebSocket;
		}
		else if (!window.WebSocket) {
			alert('This browser does not support Web Sockets');
			return;
		}

		this.websocket = new WebSocket(this.wsUri, 'sec-websocket-protocol');
		console.debug(this.websocket);
		this.websocket.onopen = this.open.bind(this);
		this.websocket.onclose = this.close.bind(this);
		this.websocket.onmessage = this.receive.bind(this);
		this.websocket.onerror = this.error.bind(this);

		console.log('Leave connect');
	};

	open() {
		console.log('Enter open');
		// This is a bit hacky: should really check at intervals for the .ready state of
		// each of the samples loaded above.
		setTimeout(() => this.initEvents(), 1000);
	};

	close() {
		this.destroy();
	};

	error(e) {
		if (this.websocket) {
			this.websocket.close();
		}
		this.close();
		throw e;
	};

	/* Receive data on all connected users' cursors, including
		 our own, which are stored in the caller and rendered by
		 at regular intervals, elsewhere. */
	receive(e) {
		const res = JSON.parse(e.data);
		// console.debug( res );
		this.cursors = res.cursors;
	};

	/* Send the user options and cursor position. */
	send() {
		if (!this.y) {
			return;
		}
		this.gain = 1;
		this.panning = 0;

		if (this.xCtrl == 'volume') {
			// 1 - sum makes the right-side loud, left-side quiet
			this.gain = 1 - (
				((this.canvas.width - this.x)
					/ this.canvas.width)
			);
		}
		// What are the units for a panning node?!
		else if (this.xCtrl == 'pan') {
			this.pan = (this.x / (this.canvas.width / 10)) - 5;
		}

		this.websocket.send([
			this.userId,
			this.x,
			this.y,
			this.scaleCursor,
			this.gain,
			this.pan,
			this.patch,
			this.computedPitch(),
		].join(','));
	};

	computedPitch() {
		if (this.playNote) {
			this.pitch = parseInt(
				((this.canvas.height - this.y)
					/ this.canvas.height
				) * this.patches[this.patch].aBuffers.length
			);
		}
		else {
			this.pitch = '';
		}
		return this.pitch;
	}

	/* Send current user-state data to the server.
		 Render all stored cursors visually,
		 play the latest generation of cursors.
		 play whatever percussion we have  */
	pulse() {
		this.send();

		if (!this.cursors) {
			return;
		}

		this.pulseNumber++;

		// Add a frame to the cursor stack to represent this pulse
		this.cursorStack.unshift(this.cursors);

		// Play each sound distributed by the server
		Object.keys(this.cursors).sort().forEach((i) => {
			let play = false;
			// Server sends a pitch, otherwise it is just cursor display:
			if (this.cursors[i].pitch != null) {
				// This patch may have an associated pulse:
				if (this.patches[this.cursors[i].patch].pulses) {
					this.patches[this.cursors[i].patch].pulses.forEach((p) => {
						if (this.pulseNumber % p[0] === p[1]) {
							play = true;
							return;
						}
					});
				}
				else {
					play = true;
				}

				if (play) {
					this.patches[this.cursors[i].patch].playNow(
						this.cursors[i].pitch,
						this.cursors[i].gain,
						this.cursors[i].pan
					);
				}
			}
		});

		// Play percussion track:
		this.scaleCursor = this.options.initialScaleFactor
			+ (this.gain / 2);
		let pitch = 0;
		if (this.options.percussion !== undefined) {
			this.percNames.forEach((instrument) => {
				this.options.percussion[instrument].forEach((i) => {
					if (this.pulseNumber % i[0] == i[1]) {
						this.patches[0].playNow(pitch);
						this.scaleCursor += this.options.cursorScaleIncrement;
					}
				});
				pitch++;
			});
		}
	};

	/* Render visually a single cursor
		 Note the bad JSON type-casting from server. */
	drawCursor(cursor, x, generation) {
		const y = parseInt(cursor.xy[1]) + (this.options.circleRadius);

		this.ctx.fillStyle = this.ctx.strokeStyle = this.options.patchClrs[cursor.patch];
		this.ctx.beginPath();
		this.ctx.arc(
			x, y,
			this.options.circleRadius * 2 * (cursor.scaleCursor),
			0, Math.PI * 2, true
		);
		this.ctx.closePath();
		this.ctx.stroke();

		if (generation && generation === 1) {
			this.ctx.strokeStyle = this.ctx.fillStyle = '#EEE';
			this.ctx.beginPath();
			this.ctx.arc(
				x, y,
				this.options.circleRadius,
				0, Math.PI * 2, true
			);
			this.ctx.closePath();
			this.ctx.stroke();

			// User name slightly off-centred from cursor
			this.ctx.beginPath();
			this.ctx.fillText(
				cursor.userId,
				x + 10, y - 10,
				200
			);
			this.ctx.closePath();
			this.ctx.stroke();
		}

		// Fill the cursor if the note is currently playing:
		if (cursor.pitch !== null && cursor.pitch > -1) {
			this.ctx.fill();
		}
	};

	/* Scroll the screen.
		 No longer copies the canvas and pastes as an image -
		 that was too heavy. Now calls for a rendering of
		 every cursor stored. */
	scroll() {
		if (!this.cursorStack) {
			console.debug('No cursors');
			return;
		};
		if (!this.patches[0].aBuffers) {
			console.debug('No audio buffers in patch 0');
			return;
		};

		let newStack = [];	// Limit size of stack to that on screen
		let generation = 0;

		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		// Note dividing lines
		this._cavnasUnit = this._cavnasUnit || this.canvas.height / this.patches[0].aBuffers.length;

		this.ctx.fillStyle = this.ctx.strokeStyle = "#555";

		for (let i = 1; i <= this.patches[0].aBuffers.length; i++) {
			this.ctx.beginPath();
			const y = (i * unit) + this.options.circleRadius;
			this.ctx.moveTo(0, y);
			this.ctx.lineTo(this.canvas.width, y);
			this.ctx.closePath();
			this.ctx.stroke();
		}

		let x = this.options.cursorX + this.options.circleRadius;

		// cursorStack is chronological - newest first
		this.cursorStack.forEach((frame) => {
			Object.keys(frame).sort().forEach((i) => {
				this.drawCursor(frame[i], x, ++generation);
			});
			x -= this.options.circleRadius * 2;
			if (x > 0) {
				newStack.push(frame);
			} else {
				return;
			}
		});

		this.cursorStack = newStack;
	}
}