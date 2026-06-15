import * as math from "./math.js";

export function randomChoice(choices) {
  const index = math.randomInt(choices.length);
  return choices[index];
}

const NOTES = [
  "A",
  "Ash",
  "B",
  "C",
  "Csh",
  "D",
  "Dsh",
  "E",
  "F",
  "Fsh",
  "G",
  "Gsh",
];

export function calculateWestNote(frequency) {
  // A4 = 440Hz
  const noteNum = 12 * math.baseLog(2, frequency / 440) + 48;
  const noteNumInt = Math.floor(noteNum + 0.5);
  const letterIndex = noteNumInt % 12; // A = 0
  const octave = Math.floor((noteNum + 9.5) / 12);
  const semitonesOffset = noteNum - noteNumInt;
  return {
    name: `${NOTES[letterIndex]}${octave}`,
    semitonesOffset: semitonesOffset, // between -0.5 and 0.5
  };
}

export function getSupportedAudioFormat() {
  const audio = document.createElement("audio");

  if (audio.canPlayType('audio/ogg; codecs="opus"')) {
    return "opus";
  } else if (audio.canPlayType("audio/mpeg")) {
    return "mp3";
  } else {
    return null; // No supported format found
  }
}

export function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Win/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac";
  if (/Linux/i.test(ua)) return "linux";
  return null;
}
