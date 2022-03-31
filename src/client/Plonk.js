let ACTX;

import BufferLoader from './BufferLoader';

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
		const node = new AudioBufferSourceNode(ACTX);
		node.buffer = this.aBuffers[pitch];
		const gainNode = ACTX.createGain();
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
		node.start(0);
	}
};

export default class Plonk {
	x = null;										// Mouse position
	y = null;										// Mouse position
	playNote = false;						// Is a note being played?
	xCtrl = 'nothing';					// Notes what horizontal mouse movement controls
	canvas = null;							// The canvas this code creates
	ctx = null;									// Canvas context
	wsUri = null;								// Web socket server URI sans port
	wsPort = 3000;							// Web socket server port
	element = null;							// Inst from options.element
	websocket = null;						// Instance of the obvious
	cursors = null;							// State from server
	cursorStack = [];						// Previouos cursors; for scrollig graphics; on subarray per pulse
	pulseNumber = 0;						// keep a beat
	pulseTimer = null;					// setTimeout
	scrollTimer = null;					// setTimeout
	scaleCursor = null;					// Controls circle size/growth
	patchIndex = 1;							// Initial patch= 0 must be percission
	gain = 1;										// volume
	pan = 0;										// pan
	userId = 'Plonker';					// Displayed by cursor
	patches = [];								// Loaded on instantiation
	percNames = ['kick', 'snare', 'hat_closed'];	// For ease of programming

	options = {
		element: null,						// DOM element into which to insert this app
		xcontrolsElement: null,		// Element into which to place controller options
		cursorX: 700,							// x position of cursor relative to canvas
		circleRadius: 5,					// Circles that represent sound
		cursorScaleIncrement: .3,	// Amount by which to increase cursor size
		initialScaleFactor: .4,		// Relates to changing size of circles

		scrollPx: 4,							// Pixels to scroll each scrollMS
		scrollMS: 1000 / 32,			// Frames per second

		pulseMS: 1000 / 8,				// Sending to server, and rendering sound and cursors

		// Sounds:
		patchHeight: 20,					// Patch selector
		patchWidth: 20,					// Patch selector

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

		this.ctx = this.canvas.getContext('2d');
		this.ctx.font = '12px Sans';

		this.wsUri = this.options.wsUri || "ws://" + window.location.hostname + ':' + this.options.wsPort;
		this.connect();
	};

	initEvents() {
		// React to movement of the mouse
		this.canvas.addEventListener('mousemove', (e) => {
			// Make co-ords absolute within canvas
			this.x = e.pageX;
			this.y = e.pageY;
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

		/** The height of a pitch on the canvas */
		this._cavnasUnit = this.canvas.offsetHeight / this.patches[0].aBuffers.length;

		window.requestAnimationFrame(this.scroll.bind(this));

		/** Periodically send the cursor position and redraw */
		this.pulseTimer = setInterval(
			this.pulse.bind(this),
			this.options.pulseMS
		);
	};

	/** Kills the timers used for playing and rendering */
	destroy() {
		clearInterval(this.scrollTimer);
		clearInterval(this.pulseTimer);
	};

	makeGUI() {
		this.ctrlsEl = document.getElementById(this.options.xcontrolsElement);
		this.element = document.getElementById(this.options.element);
		this.canvas = document.getElementById('canvas');

		const rect = this.element.getBoundingClientRect();
		this.canvas.width = rect.width;
		this.canvas.height = rect.height;

		// Controls for patch change:
		for (let i = 0; i < this.patches.length; i++) {
			const el = document.createElement('span');
			el.setAttribute('class', 'patch');
			el.setAttribute('style', 'background-color: ' + this.options.patchClrs[i]);
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				console.info("Set patch to " + i, this.patches[i], e.target.dataset.patch);
				this.patchIndex = i;
			});
			this.ctrlsEl.appendChild(el);
		}


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
			document.getElementById(i).addEventListener('change', (e) => this.xCtrl = i);
		});
	};

	connect() {
		if (window.MozWebSocket) {
			window.WebSocket = window.MozWebSocket;
		}
		else if (!window.WebSocket) {
			alert('This browser does not support Web Sockets');
			return;
		}

		console.info("Connect to wsUri of " + this.wsUri);
		this.websocket = new WebSocket(this.wsUri, 'sec-websocket-protocol');
		this.websocket.onopen = this.open.bind(this);
		this.websocket.onclose = this.destroy.bind(this);
		this.websocket.onmessage = this.receive.bind(this);
		this.websocket.onerror = this.error.bind(this);
	};

	open() {
		console.log('Enter open');
		// This is a bit hacky: should really check at intervals for the .ready state of
		// each of the samples loaded above.
		setTimeout(() => this.initEvents(), 1000);
	};

	error(e) {
		if (this.websocket) {
			this.websocket.close();
		}
		this.destroy();
		throw e;
	};

	/* Receive data on all connected users' cursors, including
		 our own, which are stored in the caller and rendered by
		 at regular intervals, elsewhere. */
	receive(e) {
		const res = JSON.parse(e.data);
		this.cursors = res.cursors;
	};

	/* Send the user options and cursor position. */
	send() {
		if (!this.y) {
			return;
		}

		// if (!this.playNote) {
		// 	return;
		// }

		if (this.xCtrl.value === 'volume') {
			// 1 - sum makes the right-side loud, left-side quiet
			this.gain = 1 - (
				((this.canvas.width - this.x)
					/ this.canvas.width)
			);
		}

		// What are the units for a panning node?!
		else if (this.xCtrl.value === 'pan') {
			this.pan = (this.x / (this.canvas.width / 10)) - 5;
		}

		const msg = [
			this.userId,
			this.scaleCursor,
			this.gain,
			this.pan,
			this.patchIndex,
			this.playNote ? this.pitchIndexFromY(this.y) : -1,
		].join(',');

		this.websocket.send(msg);
	};

	yFromPitchIndexFrom(pitchIndex) {
		return parseInt(
			this.canvas.height - (
				pitchIndex * (this.canvas.height / this.patches[this.patchIndex].aBuffers.length)
			)
		);
	}

	pitchIndexFromY(y) {
		return parseInt(
			(
				(this.canvas.height - y)
				/ this.canvas.height
			) * this.patches[this.patchIndex].aBuffers.length
		);
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
			if (this.cursors[i].pitch !== null) {
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
		this.scaleCursor = this.options.initialScaleFactor + (this.gain / 2);

		let pitch = 0;

		if (this.options.percussion !== undefined) {
			this.percNames.forEach((instrument) => {
				this.options.percussion[instrument].forEach((i) => {
					if (this.pulseNumber % i[0] === i[1]) {
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
		const y = this.yFromPitchIndexFrom(cursor.pitch);

		// this.ctx.beginPath();
		// this.ctx.strokeStyle = this.ctx.fillStyle = '#EEE';
		// this.ctx.arc(
		// 	x, y,
		// 	this.options.circleRadius,
		// 	0, Math.PI * 2, true
		// );
		// this.ctx.closePath();
		// this.ctx.stroke();

		if (generation === 1) {
			// User name slightly off-centred from cursor
			// this.ctx.strokeStyle = this.ctx.fillStyle = '#EEE';
			this.ctx.beginPath();
			this.ctx.fillText(
				cursor.userId,
				x + 10, y - 10,
				200
			);
			this.ctx.closePath();
		}
		// Past generations
		else {
			this.ctx.beginPath();
			this.ctx.fillStyle = this.ctx.strokeStyle = this.options.patchClrs[cursor.patch];
			this.ctx.arc(
				x, y,
				this.options.circleRadius * 2 * (cursor.scaleCursor),
				0, Math.PI * 2, true
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

		let newStack = [];	// Limit size of stack to that on screen - as screens vary, server should do this
		let generation = 0;

		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		this.ctx.lineWidth = 1;
		this.ctx.fillStyle = null;
		this.ctx.strokeStyle = "#555";

		for (let i = 1; i <= this.patches[0].aBuffers.length; i++) {
			this.ctx.beginPath();
			const y = (i * this._cavnasUnit) + this.options.circleRadius;
			this.ctx.moveTo(0, y);
			this.ctx.lineTo(this.canvas.width, y);
			this.ctx.closePath();
			this.ctx.stroke();
		}

		let x = this.options.cursorX + this.options.circleRadius;

		// cursorStack is chronological - newest first
		this.cursorStack.forEach((cursorsOverTime) => {
			Object.keys(cursorsOverTime).sort().forEach((i) => {
				this.drawCursor(cursorsOverTime[i], x, ++generation);
			});
			x -= this.options.circleRadius * 2;
			if (x > 0) {
				newStack.push(cursorsOverTime);
			} else {
				return;
			}
		});

		this.cursorStack = newStack;

		window.requestAnimationFrame(this.scroll.bind(this));
	}
}