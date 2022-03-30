// http://www.html5rocks.com/en/tutorials/webaudio/intro/js/buffer-loader.js
// via http://www.html5rocks.com/en/tutorials/webaudio/intro/

export default class BufferLoader {
	bufferList = [];
	loadCount = 0;

	constructor(context, urlList, callback) {
		this.context = context;
		this.urlList = urlList;
		this.onload = callback;
	}

	loadBuffer(url, index) {
		const xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";

		xhr.onload = () => {
			this.context.decodeAudioData(xhr.response, (buffer) => {
				if (!buffer) {
					alert('error decoding file data: ' + url);
					return;
				}

				this.bufferList[index] = buffer;

				if (++this.loadCount === this.urlList.length) {
					this.onload(this.bufferList);
				}
			});
		}

		xhr.onerror = () => {
			alert('BufferLoader: XHR error');
		}

		xhr.send();
	}

	load() {
		for (var i = 0; i < this.urlList.length; ++i) {
			this.loadBuffer(this.urlList[i], i);
		}
	}
}
