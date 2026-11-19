// All sound is synthesised with WebAudio: no audio files, no network.
// Short effects (engine hum, siren, gunshot, punch, coin, crash, pickup) are
// built from oscillators and filtered noise; a light bass-and-hat loop keeps
// the city feeling alive. Everything is created lazily on the first user
// gesture, so the game never tries to play before the browser allows it.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let musicOn = false;
  let muted = false;
  let step = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function noise(dur, vol, lowpass) {
    if (!ctx || muted) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  const sfx = {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    click() { tone(660, 0.07, 'square', 0.12); },
    coin() { tone(880, 0.09, 'sine', 0.2); setTimeout(() => tone(1320, 0.14, 'sine', 0.2), 70); },
    punch() { noise(0.12, 0.5, 900); tone(140, 0.1, 'sine', 0.3, 70); },
    shoot() { noise(0.16, 0.7, 2400); tone(220, 0.08, 'square', 0.25, 60); },
    crash() { noise(0.35, 0.8, 700); tone(90, 0.3, 'sine', 0.4, 40); },
    siren() { tone(720, 0.5, 'sine', 0.1, 980); },
    pickup() { tone(520, 0.1, 'triangle', 0.25); setTimeout(() => tone(780, 0.16, 'triangle', 0.25), 90); },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.28), i * 110));
    },
    busted() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.2), i * 160)); },
    hurt() { tone(180, 0.15, 'sawtooth', 0.3, 90); },
    engineStart() { tone(120, 0.4, 'sawtooth', 0.2, 320); },
  };

  function startEngine() {
    if (!ctx || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 70;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineOsc.connect(filter).connect(engineGain).connect(master);
    engineOsc.start();
  }

  function setEngine(speed01, on) {
    if (!ctx || !engineOsc) return;
    engineGain.gain.setTargetAtTime(on && !muted ? 0.05 + speed01 * 0.06 : 0.0, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(60 + speed01 * 130, ctx.currentTime, 0.1);
  }

  // A tiny two-bar loop: a walking bass line and a hat tick, scheduled ahead.
  const BASS = [55, 0, 65.4, 0, 49, 0, 58.3, 73.4];
  function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true;
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      const note = BASS[step % BASS.length];
      if (note) tone(note, 0.24, 'triangle', 0.22);
      if (step % 2 === 0) noise(0.03, 0.08, 6000);
      step += 1;
    }, 230);
  }

  function stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    musicOn = false;
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }

  return { sfx, startEngine, setEngine, startMusic, stopMusic, setMuted, toggleMuted, isMuted: () => muted };
}
