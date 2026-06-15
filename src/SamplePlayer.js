import { Mutex } from "./mutex.js";

const FADEIN = 200;
const FADEOUT_FAST = 200; // Changing to new note
const FADEOUT_SLOW = 600; // Ending playback

export class SamplePlayer {
  /* Wraps a Howler object for audio playback
   * of a single audio file.
   * Can play multiple instances of the same
   * file 
   */
  constructor(
    audioUrl,
    loopWithoutFade = false,
    fullVolume = 1.0,
    debug = false,
  ) {
    this._loadedPromiseResolve = null;
    this._loadedPromise = new Promise((resolve) => {
      this._loadedPromiseResolve = resolve;
    });
    this._stopPromises = new Map();
    this._stopPromiseResolves = new Map();
    this._playPromises = new Map();
    this._howl = new Howl({
      src: [audioUrl],
      volume: 0,
      onload: () => {
        this._loadedPromiseResolve();
      },
      loop: loopWithoutFade,
    });
    this._loopWithoutFade = loopWithoutFade;
    this._fullVolume = fullVolume;
    this._playingIds = new Set();
    this._restartMutex = new Mutex();
    this._allowPlay = false;
    this._rate = 1.0;

    const before = audioUrl.lastIndexOf("/");
    const after = audioUrl.lastIndexOf(".");
    this._logP = `${audioUrl.slice(before + 1, after)} -> `;
    this._debug = debug;
  }

  setSemitonesOffset(semitonesOffset) {
    this._rate = 2 ** (semitonesOffset / 12);
  }

  play(pan = 0) {
    this._allowPlay = true;
    this._addPlayback(pan);
  }

  cancelScheduledPlays() {
    this._allowPlay = false;
  }

  /* Add a new playing instance */
  _addPlayback(pan) {
    this._loadedPromise.then(() => {
      if (!this._allowPlay) {
        return;
      }
      const id = this._howl.play();
      this._howl.stereo(pan, id);
      this._playPromises.set(
        id,
        new Promise((resolve) => {
          this._howl.once(
            "play",
            () => {
              resolve(id);
              if (this._debug) console.debug(`${this._logP}Played ${id}`);
            },
            id,
          );
        }),
      );
      this._howl.rate(this._rate, id);
      this._playingIds.add(id);
      this._fadein(id);
    });
  }

  stopId(id, fast = false) {
    this._fadeoutAndStopId(id, fast);
  }

  restartOldest() {
    let pan;
    this._restartMutex
      .lock(this._logP)
      /* Critical section (don't restart the same Id) */
      .then(() => {
        if (this._playingIds.size > 0) {
          const id = [...this._playingIds][0];
          pan = this._howl.stereo(undefined, id);
          return this._fadeoutAndStopId(id, true);
        } else {
          console.warn(`${this._logP}Nothing to restart!`);
          throw new Error("BreakChain");
        }
      })
      /* End critical section */
      .then(() => {
        this._restartMutex.unlock();
        this._addPlayback(pan);
      })
      .catch((err) => {
        if (err.message !== "BreakChain") throw err;
      });
  }

  getPlayingIds() {
    return this._playingIds;
  }

  _fadein(id) {
    const currentVolume = this._howl.volume(id);
    if (currentVolume === this._fullVolume) {
      return;
    }
    const fadeinTime = FADEIN * (1 - currentVolume / this._fullVolume);
    this._howl.fade(currentVolume, this._fullVolume, fadeinTime, id);
  }

  async _fadeoutAndStopId(id, fast) {
    if (this._playPromises.get(id)) {
      await this._playPromises.get(id);
      this._playPromises.delete(id);
    }

    const currentVolume = this._howl.volume(id);
    if (currentVolume === 0) {
      this._stopId(id);
      return Promise.resolve(`id ${id} stopped immediately`);
    }
    this._howl.volume(currentVolume, id);
    //this._howl.off("fade", null, id);
    let fadeoutTime = fast ? FADEOUT_FAST : FADEOUT_SLOW;
    fadeoutTime *= currentVolume / this._fullVolume;
    this._howl.fade(currentVolume, 0, fadeoutTime, id);
    if (!this._stopPromises.has(id)) {
      let stopPromiseResolve;
      const stopPromise = new Promise((resolve) => {
        stopPromiseResolve = resolve;
      });
      this._stopPromises.set(id, stopPromise);
      this._howl.once(
        "fade",
        () => {
          this._stopId(id);
          stopPromiseResolve();
          this._stopPromises.delete(id);
        },
        id,
      );
    }
    return this._stopPromises.get(id);
  }

  _stopId(id) {
    this._howl.stop(id);
    if (this._debug) console.debug(`${this._logP}Stopped ${id}`);
    this._playingIds.delete(id);
  }
}
