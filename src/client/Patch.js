import BufferLoader from './BufferLoader';

let ACTX;

export default class Patch {
  urls = [];
  aBuffers = [];	// List of list of loaded audio buffers for user sounds
  pulses = null;
  ready = false;

  constructor(baseUrl, pulses = null) {
    this.baseUrl = baseUrl;
    this.pulses = pulses;

     ACTX = new AudioContext(); // Wait for call because Chromium requires user interaction for audio

    for (let note = 1; note <= 11; note++) {
      this.urls.push(baseUrl + '/' + note + '.wav');
    }
  }

  /**
   * @returns Promise<AudioBuffer[]>
   */
  async load() {
    for (var i = 0; i < this.urls.length; ++i) {
      const bufferLoader = new BufferLoader(ACTX);
      this.aBuffers.push(
        await bufferLoader.load(this.urls[i])
      );
    }

    return this.aBuffers;
  };

  /** Play at the specified pitch, optinally specifying gain and pan */
  playNow(pitch, gain = 1, pan = 0) {
    const node = new AudioBufferSourceNode(ACTX);
    node.buffer = this.aBuffers[pitch];
    this.gainNode = this.gainNode || ACTX.createGain();
    this.gainNode.gain.value = gain;
    node.connect(this.gainNode);
    this.panNode = this.panNode || ACTX.createPanner();
    this.panNode.setPosition(pan, 0, 1);
    this.gainNode.connect(this.panNode);
    this.panNode.connect(ACTX.destination);
    node.start(0);
  }
};
