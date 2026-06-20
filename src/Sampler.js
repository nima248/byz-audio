import * as math from "./math.js";
import * as util from "./util.js";

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
    sampleBank,
    audioType,
    { nVoices = DEFAULT_N_VOICES, volumeMult = 1.0, debug = false } = {},
  ) {
    this._sampleBank = sampleBank;
    this._nVoices = nVoices;
    this._volumeMult = volumeMult;
    this._debug = debug;

    this._audioType = audioType;
    this._playbackRequested = false;
    this._lastNote = null;
    this._playTimeoutIds = new Set();
    this._playingPlayers = [];
    this._restartTimeoutId = null;
    this._nextRestart = 0;
  }

  initialise() {
    this._refreshNoteChangeSpread();
    this._calculateVolume();
    this._calculatePanValues();

    if (this._debug) {
      console.debug(`nVoices is ${this._nVoices}`);
    }
  }

  getPlaybackRequestedState() {
    return this._playbackRequested;
  }

  getAudioType() {
    return this._audioType;
  }

  loadSound(frequencies) {
    const notes = frequencies.map((f) => util.calculateWestNote(f));
    this._sampleBank.loadSound(this._audioType, notes);
  }

  haveAudioForFreq(frequency, noMatchOk = false) {
    const note = util.calculateWestNote(frequency);
    return this._sampleBank.haveAudioForNote(
      this._audioType,
      note.name,
      noMatchOk,
    );
  }

  playFrequency(frequency, noMatchOk = false) {
    const note = util.calculateWestNote(frequency);
    if (!this._sampleBank.haveAudioForNote(this._audioType, note.name)) {
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
    const samplePlayers = this._sampleBank.getSamplePlayers(
      this._audioType,
      note.name,
      this._nVoices,
    );
    samplePlayers.forEach((player) => {
      player.setSemitonesOffset(note.semitonesOffset);
    });
    const startPlayerI = math.randomInt(samplePlayers.length);
    for (let i = 0; i < this._nVoices; i++) {
      const thisPlayerI = (startPlayerI + i) % samplePlayers.length;
      const id = setTimeout(() => {
        const pan = this._panValues[i];
        samplePlayers[thisPlayerI].play(this._volume, pan);
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
      this._sampleBank
        .getSamplePlayers(this._audioType, this._lastNote.name)
        .forEach((player) => {
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

  _calculateVolume() {
    this._volume = (0.8 / this._nVoices ** (3 / 5)) * this._volumeMult;
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
