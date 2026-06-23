import { LayerSampler } from "../src/LayerSampler.js";
import { SampleBank } from "../src/SampleBank.js";
import { ScaleManager } from "../src/ScaleManager.js";

const MAX_PITCH_SHIFT = 12;
const MIN_PITCH_SHIFT = -14;
const ACTIVE_NOTE_CLASS = "active-note";
const NO_AUDIO_AVAILABLE_CLASS = "no-audio-available";
const DEFAULT_AUDIO_TYPE = "vox1";

const sampleBank = new SampleBank(
  "https://audio.byzison.xyz/",
  "manifest.json",
);
const audioType = DEFAULT_AUDIO_TYPE;
const samplerA = new LayerSampler(sampleBank, audioType, {
  nVoices: 4,
  volumeMult: 0.7,
  debug: false,
});
const samplerB = new LayerSampler(sampleBank, audioType, {
  nVoices: 4,
  volumeMult: 0.7,
  debug: false,
});

sampleBank.initialise();
samplerA.initialise();
samplerB.initialise();
sampleBank.getAudioTypes().then((types) => {
  let log = `${types.length} available audio types:`;
  types.forEach((type) => {
    log += `\n  - ${type}`;
  });
  console.log(log);
});
console.log("initial audio type set to ", audioType);
let activeSampler = samplerA;

const scaleManager = new ScaleManager();

const noteButtons = document.querySelectorAll(".note-btn");
const pitchButtons = document.querySelectorAll(".pitch-btn");
const body = document.querySelector("body");

let activeNoteButton = null;

function freqOfButton(button) {
  let note = button.id.replace("note-", "");
  let octave = 0;
  if (note.startsWith("low-")) {
    note = note.replace("low-", "");
    octave = -1;
  } else if (note.startsWith("high-")) {
    note = note.replace("high-", "");
    octave = 1;
  }
  note = note.replace("-", "_");
  return scaleManager.getFreq(note, octave);
}

async function setNotesAudioAvailableStatusAsync() {
  await sampleBank.audioManifestLoaded();
  let haveAnyAudio = false;
  noteButtons.forEach((button) => {
    const freq = freqOfButton(button);
    if (activeSampler.haveAudioForFreq(freq, false)) {
      haveAnyAudio = true;
      button.classList.remove(NO_AUDIO_AVAILABLE_CLASS);
    } else {
      button.classList.add(NO_AUDIO_AVAILABLE_CLASS);
    }
  });
  if (!haveAnyAudio) {
    console.error(
      "No available audio for audio type ",
      activeSampler.getAudioType(),
    );
  }
}

function loadAudioAvailableNotes() {
  const enBut = getAudioAvailableButtons();
  const freqs = enBut.map((b) => freqOfButton(b));
  activeSampler.loadSound(freqs);
}

function getAudioAvailableButtons() {
  const audioAvailableButtons = [];
  noteButtons.forEach((button) => {
    if (!button.classList.contains(NO_AUDIO_AVAILABLE_CLASS)) {
      audioAvailableButtons.push(button);
    }
  });
  return audioAvailableButtons;
}

function activateNoteButton(button) {
  button.classList.add(ACTIVE_NOTE_CLASS);
  activeNoteButton = button;
}

async function turnOffSound() {
  activeSampler.stop();
  if (activeNoteButton) {
    activeNoteButton.classList.remove(ACTIVE_NOTE_CLASS);
    activeNoteButton = null;
  }
}

// Help with glitchy vertical height calculation on first load
function forceReflow() {
  setTimeout(() => {
    window.scrollTo(0, 0);
  }, 100);
}
if (document.readyState === "complete") {
  forceReflow();
} else {
  window.addEventListener("load", () => {
    forceReflow();
  });
}

addEventListener("DOMContentLoaded", () => {
  setNotesAudioAvailableStatusAsync()
    .then(() => {
      loadAudioAvailableNotes();
    })
    .then(() => {
      console.log("Initial audio load complete");
    });
});

noteButtons.forEach((button) => {
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    noteHandler(button);
  });
});

async function noteHandler(button) {
  if (
    button.classList.contains(ACTIVE_NOTE_CLASS) ||
    button.classList.contains(NO_AUDIO_AVAILABLE_CLASS)
  ) {
    // deactivate
    turnOffSound();
  } else if (button === activeNoteButton) {
    // do nothing, it's already playing
  } else {
    // activate
    if (activeNoteButton) {
      activeNoteButton.classList.remove(ACTIVE_NOTE_CLASS);
    }
    button.classList.add(ACTIVE_NOTE_CLASS);
    activeNoteButton = button;
    const freq = freqOfButton(button);
    activeSampler.playFrequency(freq);
  }
}

body.addEventListener("click", async (event) => {
  turnOffSound();
  console.log("body clicked");
});

const pitchDownBtn = document.querySelector("#pitch-down");
const pitchUpBtn = document.querySelector("#pitch-up");
const pitchShiftP = document.querySelector("#pitch-shift");
pitchShiftP.textContent = scaleManager.getSemitonesShift();

pitchButtons.forEach((button) => {
  button.addEventListener("click", async (event) => {
    event.stopPropagation();

    const semitonesChange = button.id === "pitch-up" ? 1 : -1;
    scaleManager.changeSemitonesShift(semitonesChange);
    setNotesAudioAvailableStatusAsync().then(() => loadAudioAvailableNotes());
    if (activeNoteButton !== null) {
      const freq = freqOfButton(activeNoteButton);
      if (activeSampler.haveAudioForFreq(freq)) {
        activeSampler.playFrequency(freq);
      } else {
        activeNoteButton.classList.add(NO_AUDIO_AVAILABLE_CLASS);
        turnOffSound();
      }
    }

    // update pitch buttons UI
    const newPitchShift = scaleManager.getSemitonesShift();
    pitchShiftP.textContent = newPitchShift;
    if (semitonesChange === 1) {
      pitchDownBtn.disabled = false;
      if (newPitchShift === MAX_PITCH_SHIFT) {
        pitchUpBtn.disabled = true;
      }
    } else {
      pitchUpBtn.disabled = false;
      if (newPitchShift === MIN_PITCH_SHIFT) {
        pitchDownBtn.disabled = true;
      }
    }
  });
});
