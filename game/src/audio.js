// Synthesised sound: no audio files, everything comes from WebAudio
// oscillators — the engine drone, the ring chime, the landing fanfare and the
// crash thud. M toggles mute; nothing plays before the first user gesture.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    muted: false,
    started: false,
  };

  audio.ensure = () => {
    if (audio.started) return;
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) return;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(audio.ctx.destination);
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 52;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      audio.started = true;
    } catch {
      // Audio is decoration; a browser without it still plays.
    }
  };

  audio.setEngine = (throttle, speed) => {
    if (!audio.started) return;
    const t = audio.ctx.currentTime;
    audio.engineOsc.frequency.setTargetAtTime(46 + throttle * 70 + speed * 0.12, t, 0.1);
    audio.engineGain.gain.setTargetAtTime(0.02 + throttle * 0.05, t, 0.1);
  };

  audio.blip = (freq, dur, type = 'sine', vol = 0.16) => {
    if (!audio.started) return;
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + dur);
  };

  audio.ring = () => {
    audio.blip(880, 0.35, 'sine', 0.2);
    setTimeout(() => audio.blip(1318, 0.4, 'sine', 0.16), 90);
  };

  audio.land = () => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audio.blip(f, 0.5, 'triangle', 0.18), i * 130));
  };

  audio.crash = () => {
    audio.blip(70, 0.7, 'sawtooth', 0.3);
    setTimeout(() => audio.blip(45, 0.9, 'square', 0.2), 120);
  };

  audio.toggleMute = () => {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
    return audio.muted;
  };

  return audio;
}
