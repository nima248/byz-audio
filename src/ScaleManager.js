/* Manages the calculations from Byzantine paralagi
 * (Ni, Pa...) to frequency values.
 */

// Frequency multipliers of notes
const SCALES = {
  diatonic: {
    basis: "ni",
    ni: 1,
    pa: 9 / 8,
    bou: 5 / 4,
    ga: 4 / 3,
    di: 3 / 2,
    ke: (3 / 2) * (9 / 8),
    zo_flat: (4 / 3) * (4 / 3),
    zo: (3 / 2) * (5 / 4),
  },
};

// Use Ni as the home basis frequency.
// With whole semitone shifts, Ni will always be equal tempered.
const DEFAULT_NI_FREQ = 130.813; // Concert C3

const DEFAULT_BASIS_FREQS = {
  ni: DEFAULT_NI_FREQ,
  di: DEFAULT_NI_FREQ * (3 / 2),
};

export class ScaleManager {
  constructor() {
    this.scale = SCALES.diatonic;
    this.semitonesShift = -2;
    this.basisFrequency = null;
    this._calculateBasisFrequency();
  }

  getFreq(note, octave) {
    let freq = this.basisFreq * this.scale[note];
    if (octave === -1) {
      freq /= 2;
    } else if (octave === 1) {
      freq *= 2;
    }
    return freq;
  }

  getSemitonesShift() {
    return this.semitonesShift;
  }

  changeSemitonesShift(semitonesChange) {
    this.semitonesShift += semitonesChange;
    this._calculateBasisFrequency();
    return this.semitonesShift;
  }

  _calculateBasisFrequency() {
    // Convert semitones shift to a frequency multiplier
    const shiftMult = 2 ** (this.semitonesShift / 12);
    this.basisFreq = DEFAULT_BASIS_FREQS[this.scale.basis] * shiftMult;
  }
}
