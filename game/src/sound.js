// Generated sound only: every effect is a short WebAudio oscillator burst, no files,
// no network. The context is created lazily on the first user gesture (browsers block
// audio before one) and every call is guarded, so a headless run without audio stays silent.

export function createSound() {
  let context = null;
  let muted = false;

  function ensure() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    } catch {
      return null;
    }
    return context;
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      amp.gain.setValueAtTime(gain, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(amp).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.12);
      setTimeout(() => tone(1320, 0.12, 'sine', 0.1), 60);
    },
    diamond() {
      [523, 659, 784, 1046].forEach((freq, i) => setTimeout(() => tone(freq, 0.16, 'triangle', 0.12), i * 70));
    },
    panel() {
      tone(1200, 0.07, 'square', 0.06);
      setTimeout(() => tone(1600, 0.09, 'square', 0.06), 80);
    },
    suspicious() {
      tone(440, 0.12, 'sine', 0.1, 620);
    },
    alarm() {
      tone(220, 0.5, 'sawtooth', 0.12, 110);
      tone(330, 0.5, 'sawtooth', 0.08, 165);
    },
    laser() {
      tone(1800, 0.2, 'sawtooth', 0.1, 300);
    },
    busted() {
      tone(160, 0.4, 'sawtooth', 0.16, 55);
    },
    clear() {
      [392, 523, 659, 784].forEach((freq, i) => setTimeout(() => tone(freq, 0.2, 'triangle', 0.12), i * 90));
    },
    click() {
      tone(700, 0.05, 'sine', 0.08);
    },
  };
}
