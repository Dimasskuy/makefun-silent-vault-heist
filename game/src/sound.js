// Generated sound only: every effect is a short WebAudio oscillator phrase,
// no audio files. The context is created on the first user gesture (or the
// first call that has one), and M toggles mute. Nothing here throws when
// audio is unavailable.

function createSound() {
  let ctx = null;
  let muted = false;

  function context() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = 0) {
    if (muted) return;
    const ac = context();
    if (!ac) return;
    try {
      const t0 = ac.currentTime + when;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Audio is a garnish: a failure here must never break the game.
    }
  }

  return {
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    /** A soft blip when loot or the diamond is grabbed. */
    pickup() {
      tone(880, 0.09, 'sine', 0.12);
      tone(1320, 0.12, 'sine', 0.1, 0.07);
    },
    /** A low beep when a camera panel is cut. */
    panel() {
      tone(520, 0.08, 'square', 0.06);
      tone(390, 0.1, 'square', 0.06, 0.08);
    },
    /** A short tick when a guard grows suspicious. */
    tick() {
      tone(660, 0.06, 'triangle', 0.09);
    },
    /** The alarm sting when the meter trips. */
    alarm() {
      tone(220, 0.35, 'sawtooth', 0.08, 0, 440);
      tone(220, 0.35, 'sawtooth', 0.08, 0.35, 440);
    },
    /** A rising arpeggio on a clean getaway. */
    success() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'sine', 0.12, i * 0.09));
    },
    /** A low thud when the heist ends in handcuffs. */
    busted() {
      tone(160, 0.4, 'sawtooth', 0.14, 0, 55);
      tone(90, 0.5, 'sine', 0.16, 0.05, 40);
    },
    /** A click for menus and cards. */
    click() {
      tone(700, 0.05, 'sine', 0.08);
    },
  };
}

