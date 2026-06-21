import { SamplePlayer } from "./SamplePlayer.js";
import * as util from "./util.js";

export class SampleBank {
  /* Contains SamplePlayer objects which can be stopped
   * and started by Samplers.
   *
   * This allows multiple monophonic Samplers to play
   * together in polyphony, while loading only one
   * copy of each audio file.
   */

  constructor(urlRoot, audioFileManifestPath) {
    this._urlRoot = urlRoot;
    this._audioFileManifestPath = audioFileManifestPath;

    this._samplePlayers = new Map();

    this._audioFormat = null;
    this._audioManifest = null;
    this._audioManifestLoadedPromise = new Promise((resolve) => {
      this._audioManifestLoadedPromiseResolve = resolve;
    });
  }

  initialise() {
    this._audioFormat = util.getSupportedAudioFormat();
    if (this._audioFormat) {
      console.info(`Audio format: ${this._audioFormat}`);
    } else {
      throw "No supported audio format!";
    }
    this.startFetchAudioManifest().then(() => {
      this._audioManifestLoadedPromiseResolve();
    });
  }

  startFetchAudioManifest() {
    return fetch(`${this._urlRoot}${this._audioFileManifestPath}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("HTTP error " + response.status);
        }
        return response.json();
      })
      .then((json) => {
        this._audioManifest = json;
      })
      .catch((e) => {
        console.error(`audio manifest initialisation error: ${e}`);
      });
  }

  audioManifestLoaded() {
    return this._audioManifestLoadedPromise;
  }

  async getAudioTypes() {
    await this.audioManifestLoaded();
    return Object.keys(this._audioManifest[this._audioFormat]);
  }

  /* Loads the audio for a single voice for each of the
   * notes, if one is not already loaded.
   */
  loadSound(audioType, notes, nVoices = 1) {
    let loadedPromises = [];
    notes.forEach((n) => {
      const samplePlayers = this.getSamplePlayers(audioType, n.name, nVoices); // create a new player if none are present
      samplePlayers.forEach((sp) => {
        loadedPromises.push(sp.isLoaded());
      });
    });
    return Promise.all(loadedPromises);
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
  getSamplePlayers(audioType, noteName, nCreate = 0) {
    if (!this._samplePlayers.has(audioType)) {
      this._samplePlayers.set(audioType, new Map());
    }
    const audioTypeMap = this._samplePlayers.get(audioType);
    if (!audioTypeMap.has(noteName)) {
      audioTypeMap.set(noteName, []);
    }
    if (nCreate > 0) {
      const currNSamplePlayers = audioTypeMap.get(noteName).length;
      const nUrls = this.urlsOfNote(audioType, noteName).length;
      const maxNSamplePlayers = Math.min(nCreate, nUrls);
      for (let i = currNSamplePlayers; i < maxNSamplePlayers; i++) {
        const url = this.urlsOfNote(audioType, noteName)[i];
        let loopWithoutFade, volume;
        loopWithoutFade = false;
        audioTypeMap
          .get(noteName)
          .push(new SamplePlayer(url, loopWithoutFade, volume));
      }
    }
    return audioTypeMap.get(noteName);
  }

  urlsOfNote(audioType, noteName) {
    const files = this._audioManifest[this._audioFormat][audioType][noteName];
    return files.map(
      (f) => `${this._urlRoot}${this._audioFormat}/${audioType}/${f}`,
    );
  }

  haveAudioForNote(audioType, noteName, noMatchOk) {
    const hasAudio = Object.keys(
      this._audioManifest[this._audioFormat][audioType],
    ).includes(noteName);
    if (!hasAudio && !noMatchOk) {
      console.warn(`Note ${noteName} ${audioType} has no matching audio file`);
    }
    return hasAudio;
  }
}
