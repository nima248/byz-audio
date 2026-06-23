import * as math from "./math.js";
import * as util from "./util.js";

export class BasicSampler {
  constructor(
    sampleBank,
    audioType,
    { volume = 1.0, monophonic = false } = {},
  ) {
    this._sampleBank = sampleBank;
    this._audioType = audioType;
    this._volume = volume;

    this._monophonic = monophonic;
    this._lastPlayedPlayer = null;
  }

  initialise() {
    this._playerVolume = this._volume;
  }

  getAudioType() {
    return this._audioType;
  }

  loadSound(frequencies) {
    const notes = frequencies.map((f) => util.calculateWestNote(f));
    return this._sampleBank.loadSound(this._audioType, notes, true);
  }

  haveAudioForFreq(frequency, warnNoMatch = false) {
    const note = util.calculateWestNote(frequency);
    return this._sampleBank.haveAudioForNote(
      this._audioType,
      note.name,
      warnNoMatch,
    );
  }

  playFrequency(frequency) {
    const note = util.calculateWestNote(frequency);
    if (!this._sampleBank.haveAudioForNote(this._audioType, note.name, true)) {
      return false;
    }
    const players = this._sampleBank.getSamplePlayers(
      this._audioType,
      note.name,
    );
    if (players.length === 0) {
      console.warn(`No samplePlayers found for note: ${note.name}`);
      return;
    }
    const player = players[math.randomInt(players.length)];
    if (this._monophonic && this._lastNote) {
      this.stop(this._lastNote);
    }
    player.play(this._playerVolume);
    this._lastNote = note;
  }

  stop(note) {
    this._sampleBank
      .getSamplePlayers(this._audioType, note.name)
      .forEach((player) => {
        player.getPlayingIds().forEach((id) => {
          player.stopId(id, true);
        });
      });
  }
}
