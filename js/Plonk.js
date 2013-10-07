/** SSS.Plonk.js

**/

var SSS = SSS || {};

SSS.actx = null;

if (typeof AudioContext == "function") {
	SSS.actx = new AudioContext();
} else if (typeof webkitAudioContext == "function") {
	SSS.actx = new webkitAudioContext();
}
else {
	throw('This browser does not support Web Audio Context');	
}

// http://www.html5rocks.com/en/tutorials/webaudio/intro/
SSS.Patch = new Class({
	aBuffers:	[],	// List of list of loaded audio buffers for user sounds
	pulses:		null,
	ready: 		false,
	
	initialize: function( baseUri, pulses ){
		var self = this;
		this.pulses = pulses;
		if (typeof pulses == 'object' && pulses.length==0)
			this.pulses = null;
		this.baseUri = baseUri;
		var uris = [];
		for (var note=1; note <= 11; note++){
			uris.push(  baseUri + '/'+note+'.wav' );
		}
		var bufferLoader = new BufferLoader(
			SSS.actx,
			uris,
			function(bufferList){
				self.aBuffers = bufferList;
				self.ready = true;
				console.log("Loaded "+bufferList.length+" from "+self.baseUri);
			}
		);
		bufferLoader.load();
	},
	
	/* Play at the specified pitch,
	   optinally specifying gain and pan */
	playNow: function( pitch, gain, pan ){
		if (!this.ready) return;
		pan = pan || 0;
		gain = gain || 1;
		var node = SSS.actx.createBufferSource();
		node.buffer = this.aBuffers[pitch];
		var gainNode = SSS.actx.createGainNode();
		gainNode.gain.value = gain;
		node.connect( gainNode );
		var panNode;
		if (pan){
			panNode = SSS.actx.createPanner();
			panNode.setPosition( pan, 0, 1);
			gainNode.connect( panNode );
		} else {
			panNode = gainNode	
		}
		panNode.connect( SSS.actx.destination );
		node.noteOn(0);
	}

});

SSS.Plonk = new Class({
	Implements: [Options],
	
	x:				null,		// Mouse position
	y:				null,		// Mouse position
	pitch:			null,		// current pitch, from this.y
	playNote:		false,		// Is a note being played?
	xCtrl:			'nothing',	// Notes what horizontal mouse movement controls
	canvas:			null,		// The canvas this code creates
	ctx:				null,		// Canvas context
	wsUri:			null,		// Web socket server URI sans port
	wsPort:  		3000,		// Web socket server port
	anchor:			null,		// Cursor offset relative to canvas
	element:			null,		// Inst from options.element
	websocket:		null,		// Instance of the obvious
	cursors:			null,		// State from server
	cursorStack:	 	[],			// Previouos cursors, for scrollig graphics, on subarray per pulse
	pulseNumber: 	0,			// keep a beat
	pulseTimer:		null,		// setTimeout
	scrollTimer:		null,		// setTimeout
	scaleCursor:		null,		// Controls circle size/growth
	patch:			1,			// Initial patch: 0 must be percission
	gain:			1,			// volume
	pan:				0,			// pan
	userId:			'Plonker',	// Displayed by cursor
	percNames:		['kick','snare','hat_closed'],	// For ease of programming
	patches:			[],			// Loaded on instantiation
	
	options: {
		element: 				null,	// DOM element into which to insert this app 
		xcontrolsElement: 		null,	// Element into which to place controller options
		canvasWidth:				700,		// Size of the canvas for its
		canvasHeight:			500,		// Attributes and CSS.
		cursorX:					700,		// x position of cursor relative to canvas
		circleRadius:			5,		// Circles that represent sound
		cursorScaleIncrement:	.3,		// Amount by which to increase cursor size
		initialScaleFactor:		.4,		// Relates to changing size of circles
		
		scrollPx:				4,		// Pixels to scroll each scrollMS
		scrollMS:				1000/32,	// Frames per second

		pulseMS:					1000/8,// Sending to server, and rendering sound and cursors

		// Sounds:
		patchHeight:				20,		// Patch selector
		// XXX TODO Replace these bland colours:
		patchClrs: 				['purple','indigo','blue','green','yellow', 'orange', 'red'],
		// These always pulse:
		percussion: {
			kick:  [[4,1]],
			snare: [[16,2]],
			hat_closed: [[1,0],[4,2]]
		},
		
		// XXX TODO Add more patch pulses:
		patches: [
			{ uri: 'samples/percussion'},
			{ uri: 'samples/ambient_house_chords', pulses:[
				[2,1],
			] },
			{ uri: 'samples/eighties_phaser_pulse'},
			{ uri: 'samples/pluck'},
			{ uri: 'samples/dark_pluck_bass'},
		]
	},
    
	initialize: function( options ){
		var self = this;
		this.setOptions(options);

		// Load samples:
		this.options.patches.each( function(i){
			self.patches.push( new SSS.Patch(
				i.uri,
				i.pulses!=='undefined'? i.pulses : null
			) );
		});

		this.makeGUI();
		this.anchor = this.canvas.getPosition();
		this.ctx		= this.canvas.getContext('2d');
		this.ctx.font = '12px Arial';
		
		this.wsUri	= this.options.wsUri || "ws://" + window.location.hostname + ':'+ this.options.wsPort;
		console.log("Connect to wsUri of "+this.wsUri );
		this.connect();
	},
	
	/* Add event listeners */
	initEvents: function() {
		var self = this;
		
		// React to movement of the mouse
		this.canvas.addEvent('mousemove', function(e){ 
			// Make co-ords absolute within canvas
			self.x = e.page.x - self.anchor.x;
			self.y = e.page.y - self.anchor.y;
		});

		// Mouse down to make a note:
		this.element.addEvent('mousedown', function(e){ 
			self.playNote = true; e.stop() 
		});

		// Mouse up to stop making a note:
		this.element.addEvent('mouseup', function(e){ 
			self.playNote = false; e.stop() 
		});
		
		// Scroll the canvas
		this.scrollTimer = this.scroll.periodical( 
			this.options.scrollMS,
			this
		);
		
		// Periodically send the cursor position and redraw
		this.pulseTimer = this.pulse.periodical( 
			this.options.pulseMS,
			this
		);
	},
	
	/* Kill the timers used for playing and rendering */
	destroy: function(){
		// this.canvas.fade('out');
		this.canvas.removeEvent('mousemove');
		clearInterval(this.scrollTimer);
		clearInterval(this.pulseTimer);
	},
	
	makeGUI: function(){
		var self = this;

		this.element = document.id(this.options.element);
		this.ctrlsEl = document.id(this.options.xcontrolsElement);
		if (this.options.fillWindow)
			this.options.canvasHeight = window.getSize().y
		
		this.element.setStyle('position', 'relative');
		this.canvas = new Element('canvas', {
			'class': 'plonk',
			width: this.options.canvasWidth,		// parseInt(this.element.getStyle('width')),
			height: this.options.canvasHeight,	// parseInt(this.element.getStyle('height')),
			styles: {
				width:  this.options.canvasWidth+'px', // parseInt(this.element.getStyle('width'))   +'px',
				height: this.options.canvasHeight+'px'  // parseInt(this.element.getStyle('height')) +'px'
			}
		});
		this.element.adopt( this.canvas );
		
		// Controls for patch change:
		var patches = new Element('div', {
			html: "&nbsp;",
			id: 'patches',
			styles: {
				top: ( this.options.canvasHeight 
						- ( this.options.patchHeight * this.patches.length )
					) / 2
			}
		});
		
		for (var i=0; i<this.patches.length; i++){
			console.info("Set patch ctrl "+i);
			var p = new Element('div', {
				'class': 'patch'	,
				styles: { 
					height: this.options.patchHeight ,
					width: this.options.patchHeight ,
					background: this.options.patchClrs[i]
				},
				events: { click: function(e){
					e.stop();
					// Retrieve the patch number stored in the elemenet obj
					self.patch = this.retrieve('patch');
				}}
			});
			// Store the patch number in the element object
			p.store( 'patch', i );
			patches.adopt(p);
		}
		this.element.adopt( patches );
		
		// User name
		var p = new Element('p',{html: 'User ID:&nbsp;'}).inject( self.ctrlsEl );
		p.adopt( new Element('input', {type:'text',value:self.userId, events:{
			change: function(e){
				self.userId = e.target.value
			}
		}}));
		
		// X-cursor options:
		['nothing', 'volume', 'pan'].each( function(i){
			var p = new Element('p');
			p.adopt( new Element('input', {
				type:'radio', name:'x', id:'ctl'+i, value:i, title:i,
				checked: i == 'nothing'? true : false,
				events: {change: function(e){ self.xCtrl = i }}
			}));
			p.adopt( new Element('label', {'for':'ctl'+i, text:i }));
			self.ctrlsEl.adopt(p);
		});
	},
	
	toElement: function(){
		return this.element;
	},

	connect: function() {
		console.log('Enter connect');
		var self = this;
		if (window.MozWebSocket) {
			window.WebSocket = window.MozWebSocket;
		}
		else if (!window.WebSocket) {
			alert('This browser does not support Web Sockets');
			return;
		}
		
		this.websocket = new WebSocket( this.wsUri, 'sec-websocket-protocol' );
		console.debug( this.websocket);
		this.websocket.onopen	= function(e) { self.open(e) };
		this.websocket.onclose	= function(e) { self.close(e) };
		this.websocket.onmessage	= function(e) { self.receive(e) };
		this.websocket.onerror	= function(e) { self.error(e) };
		
		console.log('Leave connect');
	},
	
	open: function(e){
		console.log('Enter open');
		// This is a bit hacky: should really
		// check at intervals for the .ready state of
		// each of the samples loaded above.
		this.initEvents.delay(1000, this);	
	},
	
	close: function(e){
		console.log('Enter close');
		console.log(e);
		this.destroy();
	},	
	
	error: function(e){
		console.log('Enter error');
		console.error( e );
		this.websocket.close();
		this.close();
		throw(e);
	},
	
	/* Receive data on all connected users' cursors, including
	   our own, which are stored in the caller and rendered by
	   at regular intervals, elsewhere. */
	receive: function(e){
		var res = JSON.decode(e.data);
		// console.debug( res );
		this.cursors = res.cursors;
	},

	/* Send the user options and cursor position. */
	send: function() {
		if (!this.y) return;
		this.gain = 1;
		this.panning = 0;
		
		if (this.xCtrl == 'volume'){
			// 1 - sum makes the right-side loud, left-side quiet
			this.gain = 1 - (
				((this.canvas.width - this.x) 
					/ this.canvas.width)
			);
		}
		// What are the units for a panning node?!
		else if (this.xCtrl == 'pan'){
			this.pan = (this.x / (this.canvas.width / 10)) -5;
		}

		if (this.playNote){
			this.pitch = parseInt(
				((this.canvas.height - this.y)
				   / this.canvas.height
				) * this.patches[this.patch].aBuffers.length
			);
		}
		else {
			this.pitch = '';	
		}
		
		this.websocket.send( 
			this.userId
			+ ','
			+ this.x+','+this.y 
			+ ','
			+ this.scaleCursor
			+ ','
			+ this.gain
			+ ','
			+ this.pan
			+ ','
			+ this.patch
			+ ','
			+ this.pitch 
		);
	},
	
	/* Send current user-state data to the server.
	   Render all stored cursors visually,
	   play the latest generation of cursors.
	   play whatever percussion we have  */
	pulse: function(){
		var self = this;
		this.send();
		if (!this.cursors) return;

		this.pulseNumber ++;
		
		// Add a frame to the cursor stack to represent this pulse
		this.cursorStack.unshift( this.cursors );

		// Play each sound distributed by the server
		Object.keys(this.cursors).sort().each( function( i ){
			var play = false;
			// Server sends a pitch, otherwise it is just cursor display:
			if ( self.cursors[i].pitch != null ){
				// This patch may have an associated pulse:
				if (self.patches[ self.cursors[i].patch ].pulses ){
					self.patches[ self.cursors[i].patch].pulses.each( function(p){
						if (self.pulseNumber %  p[0] == p[1] ){
							play = true;
							return;
						}
					});
				} 
				else {
					play = true;
				}
			
				if (play)
					self.patches[ self.cursors[i].patch ].playNow(
						self.cursors[i].pitch,
						self.cursors[i].gain,
						self.cursors[i].pan
					);
			}
		});
		
		// Play percussion track:
		this.scaleCursor = this.options.initialScaleFactor 
			+ (this.gain/2);
		var pitch=0;
		if (this.options.percussion !== undefined){
			this.percNames.each( function(instrument){
				self.options.percussion[instrument].each( function(i){
					if (self.pulseNumber % i[0] == i[1]){
						self.patches[0].playNow( pitch );
						self.scaleCursor += self.options.cursorScaleIncrement;
					}
				});
				pitch ++;
			});
		}
	},
	
	/* Render visually a single cursor
	   Note the bad JSON type-casting from server. */
	drawCursor: function( cursor, x, generation ){
		// Graphics
		var y = parseInt( cursor.xy[1] ) + (this.options.circleRadius); 
		this.ctx.fillStyle = this.ctx.strokeStyle = this.options.patchClrs[ cursor.patch ];
  		this.ctx.beginPath();
		this.ctx.arc( 
			x, y,
			this.options.circleRadius * 2 * (cursor.scaleCursor),
			0,Math.PI*2, true
		);
		this.ctx.closePath();
		this.ctx.stroke();
		if (generation && generation==1){
			this.ctx.strokeStyle = this.ctx.fillStyle = '#EEE';
			this.ctx.beginPath();
			this.ctx.arc( 
				x, y,
				this.options.circleRadius,
				0,Math.PI*2, true
			);
			this.ctx.closePath();
			this.ctx.stroke();
			// User name slightly off-centred from cursor
			this.ctx.beginPath();
			this.ctx.fillText(
				cursor.userId,
				x+10, y-10,	
				200
			);
			this.ctx.closePath();
			this.ctx.stroke();
		}
	
		// Fill the cursor if the note is currently playing:
		if ( cursor.pitch != null && cursor.pitch > -1 )
			this.ctx.fill();
	},

	/* Scroll the screen. 
	   No longer copies the canvas and pastes as an image -
	   that was too heavy. Now calls for a rendering of
	   every cursor stored. */
	scroll: function(){
		if (!this.cursorStack) return;
		if (!this.patches[0].aBuffers)  return;
		
		var self = this;
		// Wipe canvas
		// this.canvas.width = this.canvas.width;
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		
		// Note dividing lines
		var unit = this.canvas.height / this.patches[0].aBuffers.length;
		this.ctx.fillStyle = this.ctx.strokeStyle = "#555";
		for (var i=1; i <= this.patches[0].aBuffers.length; i++){
			this.ctx.beginPath();
			var y = (i * unit) + this.options.circleRadius;
			this.ctx.moveTo(0, y);
			this.ctx.lineTo(this.canvas.width, y);
			this.ctx.closePath();
			this.ctx.stroke();
		}
		
		var x = this.options.cursorX + this.options.circleRadius;
		
		var newStack = [];	// Limit size of stack to that on screen
		var generation = 0;
		// cursorStack is chronological - newest first
		this.cursorStack.each( function( frame ){
			Object.keys(frame).sort().each( function( i ){
				self.drawCursor( frame[i], x, ++generation );
			});
			x -= self.options.circleRadius*2;
			if (x > 0) newStack.push( frame );
			else return;	
		});
		
		this.cursorStack = newStack;
	}
});

// EOF

