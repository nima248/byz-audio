import { SamplePlayer } from "./SamplePlayer.js";
import * as math from "./math.js";
import * as util from "./util.js";

const audioDir = "/assets/audio/";

const DEFAULT_N_VOICES = 3;
const NOTE_CHANGE_SPREAD_MS = 350;
const TOTAL_RESTART_TIME_MS = 9000; // should be approx length of audios

export class Sampler {
  /* Manages SamplePlayer objects by directing them when to play.
   * Plays one note (e.g. D) at a time with multiple voices starting at
   * different times.
   * If multiple samples are given per note, a random one is played.
   * If nVoices is > 1, multiple instances are played simultaneously
   * with randomised timing, and different samples are used if available.
   * If nVocies is greater than the number of samples available,
   * some or all samples will be reused to make the required voices.
   */

  constructor(
    audioFileManifestPath,
    { nVoices = DEFAULT_N_VOICES, debug = false } = {},
  ) {
    this._audioFileManifestPath = audioFileManifestPath;
    this._nVoices = nVoices;
    this._debug = debug;

    this._samplePlayers = new Map();
    this.audioManifest = null;
    this._audioManifestLoadedPromise = new Promise((resolve) => {
      this._audioManifestLoadedPromiseResolve = resolve;
    });
    this._audioType = null;
    this._audioFormat = null;
    this._maxPitchShiftSemitones = null;
    this._playbackRequested = false;
    this._lastNote = null;
    this._playTimeoutIds = new Set();
    this._playingPlayers = [];
    this._restartTimeoutId = null;
    this._nextRestart = 0;
  }

  initialise(audioType, maxPitchShiftSemitones = 99) {
    this._audioFormat = util.getSupportedAudioFormat();
    if (this._audioFormat) {
      console.info(`Audio format: ${this._audioFormat}`);
    } else {
      throw "No supported audio format!";
    }
    this.startFetchAudioManifest().then(() => {
      this._audioManifestLoadedPromiseResolve();
      this.setAudioType(audioType);
    });
    this._refreshNoteChangeSpread();
    this._calculatePanValues();

    if (this._debug) {
      console.debug(`nVoices is ${this._nVoices}`);
    }
  }

  audioTypeAvailable(audioType) {
    if (
      Object.keys(this.audioManifest[this._audioFormat]).includes(audioType)
    ) {
      return true;
    }
    return false;
  }

  setAudioType(audioType) {
    if (!this.audioTypeAvailable(audioType)) {
      throw new Error(`Audio type ${audioType} unavailable!`);
    }
    if (audioType === this._audioType) {
      return;
    }
    this._stop(true);
    this._audioType = audioType;
    if (!this._samplePlayers[audioType]) {
      this._samplePlayers[audioType] = new Map();
    }
    if (this._playbackRequested) {
      const playOk = this.playNote(this._lastNote, true);
      if (!playOk) {
        this._playbackRequested = false; // we can no longer honor the request
      }
    }
  }

  getPlaybackRequestedState() {
    return this._playbackRequested;
  }

  getAudioType() {
    return this._audioType;
  }

  startFetchAudioManifest() {
    return fetch(this._audioFileManifestPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error("HTTP error " + response.status);
        }
        return response.json();
      })
      .then((json) => {
        this.audioManifest = json;
      })
      .catch((e) => {
        console.error(`audio manifest initialisation error: ${e}`);
      });
  }

  audioManifestLoaded() {
    return this._audioManifestLoadedPromise;
  }

  /* Loads the audio for a single voice for each of the
   * frequencies, if one is not already loaded.
   */
  loadSound(frequencies) {
    const notes = frequencies.map((f) => util.calculateWestNote(f));
    notes.forEach((n) => {
      this._getSamplePlayers(n.name, 1); // create a new player if none are present
    });
  }

  /* Return the list of SamplePlayer objects
   * which have an audio file for the given note name.
   * noteName is like "C3", "F2", etc.
   * For nCreate > 0, that many new SamplePlayers
   * are created if they do not already exist.
   * The maximum number of SamplePlayers for each
   * note is the number of different audio files
   * available for that note.
   */
  _getSamplePlayers(noteName, nCreate = 0) {
    if (!this._samplePlayers[this._audioType].has(noteName)) {
      this._samplePlayers[this._audioType].set(noteName, []);
    }
    if (nCreate > 0) {
      const currNSamplePlayers =
        this._samplePlayers[this._audioType].get(noteName).length;
      const nUrls = this.urlsOfNote(noteName).length;
      const maxNSamplePlayers = Math.min(nCreate, nUrls);
      for (let i = currNSamplePlayers; i < maxNSamplePlayers; i++) {
        const url = this.urlsOfNote(noteName)[i];
        let loopWithoutFade, volume;
        loopWithoutFade = false;
        volume = 0.8 / this._nVoices ** (3 / 5);
        this._samplePlayers[this._audioType]
          .get(noteName)
          .push(new SamplePlayer(url, loopWithoutFade, volume));
      }
    }
    return this._samplePlayers[this._audioType].get(noteName);
  }

  playFrequency(frequency) {
    const note = util.calculateWestNote(frequency);
    return this.playNote(note);
  }

  playNote(note, noMatchOk = false) {
    if (!this._haveAudioForNote(note)) {
      if (!noMatchOk) {
        console.warn(`Note ${note.name} has no matching audio file`);
      }
      return false;
    }
    this._playbackRequested = true;
    if (this._lastNote) {
      if (this._debug)
        console.debug(`Stopping _lastNote ${this._lastNote.name}`);
      this._stop(true);
    }
    this._lastNote = note;
    if (this._debug) console.debug(`Scheduling note ${note.name}`);
    const samplePlayers = this._getSamplePlayers(note.name, this._nVoices);
    samplePlayers.forEach((player) => {
      player.setSemitonesOffset(note.semitonesOffset);
    });
    const startPlayerI = math.randomInt(samplePlayers.length);
    for (let i = 0; i < this._nVoices; i++) {
      const thisPlayerI = (startPlayerI + i) % samplePlayers.length;
      const id = setTimeout(() => {
        const pan = this._panValues[i];
        samplePlayers[thisPlayerI].play(pan);
        this._playingPlayers.push(samplePlayers[thisPlayerI]);
      }, this._noteChangeSpreadMs[i]);
      this._playTimeoutIds.add(id);
    }
    this._nextRestartIndex = 0;
    this._scheduleNextRestart();
    return true;
  }

  stop(fast = false) {
    this._playbackRequested = false;
    this._stop(fast);
  }

  _stop(fast = false) {
    /* Cancel all pending activities */
    this._playTimeoutIds.forEach((id) => {
      clearTimeout(id);
    });
    this._playTimeoutIds.clear();
    clearTimeout(this._restartTimeoutId);
    this._restartTimeoutId = null;
    this._playingPlayers = [];
    const playerIdPairs = [];
    if (this._lastNote) {
      this._getSamplePlayers(this._lastNote.name).forEach((player) => {
        player.cancelScheduledPlays();
        player.getPlayingIds().forEach((id) => {
          playerIdPairs.push([player, id]);
        });
      });
    }
    /* Schedule the stop actions */
    this._refreshNoteChangeSpread();
    for (const [i, pair] of playerIdPairs.entries()) {
      setTimeout(() => {
        const player = pair[0];
        const id = pair[1];
        player.stopId(id, fast);
      }, this._noteChangeSpreadMs[i]);
    }
  }

  _scheduleNextRestart() {
    let restartMs = TOTAL_RESTART_TIME_MS / this._nVoices;
    restartMs -= math.randomInt(restartMs * 0.25);
    this._restartTimeoutId = setTimeout(() => {
      if (this._nextRestartIndex > this._playingPlayers.length - 1) {
        this._nextRestartIndex = 0;
      }
      this._playingPlayers[this._nextRestartIndex].restartOldest();
      this._nextRestartIndex += 1;
      this._scheduleNextRestart();
    }, restartMs);
  }

  haveAudioForFreq(frequency) {
    const note = util.calculateWestNote(frequency);
    return this._haveAudioForNote(note);
  }

  _haveAudioForNote(note) {
    if (this._audioType == null) {
      return false;
    }
    return Object.keys(
      this.audioManifest[this._audioFormat][this._audioType],
    ).includes(note.name);
  }

  urlsOfNote(noteName) {
    const files =
      this.audioManifest[this._audioFormat][this._audioType][noteName];
    const prefix = this.audioManifest["urlPrefix"];
    return files.map(
      (f) => `${prefix}${this._audioFormat}/${this._audioType}/${f}`,
    );
  }

  _refreshNoteChangeSpread() {
    this._noteChangeSpreadMs = [0];
    if (this._nVoices > 1) {
      const inc = NOTE_CHANGE_SPREAD_MS / (this._nVoices - 1);
      const random = Math.floor(inc * 0.3);
      let last = 0;
      for (let i = 1; i < this._nVoices; i++) {
        last += inc + math.randomInt(random) - random / 2;
        this._noteChangeSpreadMs.push(last);
      }
    }
  }

  _calculatePanValues() {
    const pans = [];
    let maxPan = 0;
    if (this._nVoices === 1) {
      pans.push(0);
    } else {
      maxPan = Math.min((this._nVoices - 1) * 0.2, 1.0);
      const interval = (2 / (this._nVoices - 1)) * maxPan;
      const nLevels = Math.floor(this._nVoices / 2); // Excludes center level
      let level;
      if (this._nVoices % 2 === 1) {
        // Odd - one voice dead center
        pans.push(0);
        level = interval;
      } else {
        // Even - all voices panned
        level = interval / 2;
      }
      for (let i = 0; i < nLevels; i++) {
        pans.push(level, -level);
        level += interval;
      }
    }
    this._panValues = pans;
    if (this._debug)
      console.debug(
        `Pans ${this._nVoices} (${maxPan.toFixed(2)}): ${pans.map((p) => p.toFixed(2))}`,
      );
  }
}
