// http://www.html5rocks.com/en/tutorials/webaudio/intro/js/buffer-loader.js
// via http://www.html5rocks.com/en/tutorials/webaudio/intro/

export default class BufferLoader {
	bufferList = [];
	loadCount = 0;

	constructor(context) {
		this.context = context;
	}

	load(url) {
		const xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";

		return new Promise((resolve, reject) => {
			xhr.onload = () => {
				console.debug('loaded audio');
				this.context.decodeAudioData(xhr.response, (buffer) => {
					return buffer ? resolve(buffer) : reject('error decoding file data: ' + url);
				});
			}

			xhr.onerror = () => reject(`BufferLoader XHR error: ${url}`);
			xhr.send();
		});
	}

}
