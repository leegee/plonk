export default class BufferLoader {
	constructor(context) {
		this.context = context;
	}

	load(url) {
		const xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";

		return new Promise((resolve, reject) => {
			xhr.onload = () => {
				this.context.decodeAudioData(xhr.response, (buffer) => {
					return buffer ? resolve(buffer) : reject(`BufferLoader error decoding file data from ${url}`);
				});
			}

			xhr.onerror = () => reject(`BufferLoader XHR error from ${url}`);
			xhr.send();
		});
	}

}
