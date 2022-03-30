// http://www.html5rocks.com/en/tutorials/webaudio/intro/js/buffer-loader.js
// via http://www.html5rocks.com/en/tutorials/webaudio/intro/

function BufferLoader(context, urlList, callback) {
	this.context = context;
	this.urlList = urlList;
	this.onload = callback;
	this.bufferList = new Array();
	this.loadCount = 0;
}

BufferLoader.prototype.loadBuffer = function (url, index) {
	const request = new XMLHttpRequest();
	request.open("GET", url, true);
	request.responseType = "arraybuffer";

	request.onload = () => {
		this.context.decodeAudioData(request.response, function (buffer) {
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

	request.onerror = () => {
		alert('BufferLoader: XHR error');
	}
	request.send();
}

BufferLoader.prototype.load = function () {
	for (var i = 0; i < this.urlList.length; ++i) {
		this.loadBuffer(this.urlList[i], i);
	}
}

