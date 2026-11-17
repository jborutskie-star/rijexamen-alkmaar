// Sound. Three music tracks come from a free library (credits on the end card);
// the engine, tyres, bells, fanfare and crowd are all synthesised here.
export function makeAudio() {
  const raw = {}; for (const k of ['calm', 'chase', 'win']) raw[k] = fetch(`assets/${k}.mp3`).then((r) => r.arrayBuffer());
  let ctx, out, noise, eng, scr; const buf = {}, playing = {};
  const now = () => ctx.currentTime, hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

  async function start() { // call from a tap, browsers will not play sound otherwise
    if (ctx) return ctx.resume();
    ctx = new (window.AudioContext || window.webkitAudioContext)(); out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
    for (const k in raw) buf[k] = await ctx.decodeAudioData(await raw[k]);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    g.gain.value = 0; lp.type = 'lowpass'; o1.type = 'sawtooth'; o2.type = 'square'; o1.connect(lp); o2.connect(lp); lp.connect(g).connect(out); o1.start(); o2.start(); eng = { g, lp, o1, o2 };
    const sg = ctx.createGain(), bp = ctx.createBiquadFilter(), n = ctx.createBufferSource();
    sg.gain.value = 0; bp.type = 'bandpass'; bp.Q.value = 5; n.buffer = noise; n.loop = true; n.connect(bp).connect(sg).connect(out); n.start(); scr = { g: sg, bp };
  }

  function stop(name, fade = 1) {
    const p = playing[name]; if (!p) return; delete playing[name];
    p.g.gain.cancelScheduledValues(now()); p.g.gain.setValueAtTime(p.g.gain.value, now()); p.g.gain.linearRampToValueAtTime(0.0001, now() + fade); p.src.stop(now() + fade + 0.05);
  }
  function music(name, vol = 0.5, fade = 0.6) {
    if (!ctx || !buf[name]) return; stop(name, 0.05);
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf[name]; src.loop = true;
    g.gain.setValueAtTime(0.0001, now()); g.gain.linearRampToValueAtTime(vol, now() + fade); src.connect(g).connect(out); src.start(); playing[name] = { src, g };
  }
  const rate = (name, r) => playing[name]?.src.playbackRate.setTargetAtTime(r, now(), 0.06);

  const tone = (f, t0, dur, vol = 0.2, type = 'sine', f1 = f) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  };
  const hiss = (t0, dur, vol, freq, q = 1, type = 'bandpass') => {
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noise; n.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); n.connect(f).connect(g).connect(out); n.start(t0, Math.random()); n.stop(t0 + dur + 0.05);
  };
  const chord = (notes, t0, dur, vol) => notes.forEach((n) => { tone(hz(n), t0, dur, vol, 'triangle'); tone(hz(n), t0, dur * 0.8, vol * 0.35, 'square'); });

  const fx = {
    bell() { for (const d of [0, 0.16]) { tone(2350, now() + d, 0.5, 0.1); tone(3120, now() + d, 0.35, 0.05); } },
    ding() { tone(1175, now(), 0.5, 0.12); tone(1568, now(), 0.3, 0.05); },
    thud() { tone(110, now(), 0.3, 0.6, 'sine', 38); hiss(now(), 0.18, 0.35, 300, 0.7, 'lowpass'); },
    whoosh() { hiss(now(), 0.5, 0.25, 900, 1.5); },
    stamp() { tone(160, now(), 0.2, 0.7, 'sine', 50); hiss(now(), 0.08, 0.5, 2500, 1); },
    drumroll() { for (let i = 0; i < 44; i++) hiss(now() + i * 0.046, 0.05, 0.06 + i * 0.006, 2400, 0.8, 'highpass'); },
    scream(dur = 3.4) { // one long, slowed-down "aaaa" for the jump
      const t = now(), o = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(205, t + dur);
      v.frequency.value = 5.5; vg.gain.value = 9; v.connect(vg).connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.15); g.gain.setValueAtTime(0.5, t + dur - 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      for (const [f, q] of [[780, 6], [1150, 7]]) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; o.connect(b).connect(g); }
      g.connect(out); o.start(t); v.start(t); o.stop(t + dur + 0.1); v.stop(t + dur + 0.1);
    },
    fanfare() { // an original little victory tune
      const t = now() + 0.05, lead = [[67, 0, 0.14], [72, 0.14, 0.14], [76, 0.28, 0.14], [79, 0.42, 0.22], [76, 0.66, 0.12], [79, 0.8, 0.12], [84, 0.94, 0.62]];
      lead.forEach(([n, at, d]) => { tone(hz(n), t + at, d + 0.12, 0.2, 'triangle'); tone(hz(n), t + at, d, 0.07, 'square'); });
      chord([60, 64, 67], t, 0.6, 0.08); chord([60, 64, 67, 72], t + 0.94, 0.62, 0.08);
      chord([65, 69, 72, 77], t + 1.62, 0.3, 0.12); chord([67, 71, 74, 79], t + 1.96, 0.3, 0.12); chord([60, 64, 67, 72, 76, 79, 84], t + 2.3, 1.9, 0.1);
      [84, 88, 91, 96, 91, 96].forEach((n, i) => tone(hz(n), t + 2.34 + i * 0.09, 0.5, 0.06));
      hiss(t + 2.3, 1.2, 0.12, 7000, 0.6, 'highpass'); tone(65, t + 2.3, 0.5, 0.5, 'sine', 45);
    },
    cheer() {
      const t = now(), n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
      n.buffer = noise; n.loop = true; f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.6; l.frequency.value = 7; lg.gain.value = 0.05; l.connect(lg).connect(g.gain);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.3); g.gain.setValueAtTime(0.22, t + 3.2); g.gain.linearRampToValueAtTime(0.0001, t + 5.5);
      n.connect(f).connect(g).connect(out); n.start(t); l.start(t); n.stop(t + 5.6); l.stop(t + 5.6);
      for (let i = 0; i < 7; i++) { const a = t + 0.1 + Math.random() * 2.6, f0 = 520 + Math.random() * 380; tone(f0, a, 0.5, 0.05, 'triangle', f0 * 1.6); }
    },
    blip(f = 220) { tone(f, now(), 0.07, 0.11, 'square', f * 0.92); }, // one syllable of game-style talking
    boom() { const t = now(); tone(90, t, 1.3, 0.9, 'sine', 26); tone(140, t, 0.5, 0.5, 'triangle', 40); hiss(t, 1.6, 0.8, 420, 0.5, 'lowpass'); hiss(t + 0.05, 0.5, 0.4, 2600, 0.7); },
    rocket() { const t = now(), f = 900 + Math.random() * 700; tone(f, t, 0.5, 0.05, 'sine', f * 2.2); hiss(t, 0.45, 0.05, 5200, 2); },
    pop() { const t = now(); tone(180 + Math.random() * 80, t, 0.22, 0.28, 'sine', 60); hiss(t, 0.5, 0.16, 3600 + Math.random() * 2500, 0.8); },
    quack(n = 2) { for (let i = 0; i < n; i++) { const t = now() + i * 0.19; tone(640, t, 0.13, 0.13, 'sawtooth', 430); tone(1290, t, 0.1, 0.05, 'square', 880); } },
    plop() { const t = now(); tone(430, t, 0.13, 0.16, 'sine', 130); hiss(t, 0.16, 0.08, 1900, 1); },
    flash() { hiss(now(), 0.12, 0.45, 6000, 0.8, 'highpass'); tone(2300, now(), 0.07, 0.12, 'square', 1700); }, // the speed camera
    heli(dur = 6) { const t = now(); for (let i = 0; i < dur * 11; i++) { tone(72, t + i / 11, 0.07, 0.3, 'sine', 44); hiss(t + i / 11, 0.06, 0.1, 900, 0.8); } }, // rotor blades
    speak() { try { const u = new SpeechSynthesisUtterance('Congratulations!'); u.lang = 'en-US'; u.pitch = 1.3; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* no voice on this device, the fanfare is enough */ } },
  };
  const safe = Object.fromEntries(Object.entries(fx).map(([k, f]) => [k, (...a) => { if (ctx) try { f(...a); } catch (e) { console.warn(e); } }]));

  function engine(v, slide, air, ts = 1) {
    if (!ctx) return; const gear = Math.min(4, Math.floor(v / 8)), rev = (v - gear * 8) / 8, f = (62 + rev * 70 + gear * 10) * (air ? 1.5 : 1) * (0.5 + 0.5 * ts);
    eng.o1.frequency.setTargetAtTime(f, now(), 0.05); eng.o2.frequency.setTargetAtTime(f * 0.503, now(), 0.05); eng.lp.frequency.setTargetAtTime(500 + rev * 900, now(), 0.05);
    eng.g.gain.setTargetAtTime(v > 0.3 ? 0.06 : 0, now(), 0.1); scr.g.gain.setTargetAtTime(air ? 0 : Math.min(0.18, slide * 0.2), now(), 0.05); scr.bp.frequency.setTargetAtTime(1500 + slide * 700, now(), 0.1);
  }
  const quiet = () => { if (!ctx) return; eng.g.gain.setTargetAtTime(0, now(), 0.15); scr.g.gain.setTargetAtTime(0, now(), 0.1); };
  return { start, music, stop: (n, f) => ctx && stop(n, f), rate: (n, r) => ctx && rate(n, r), engine, quiet, fx: safe };
}
