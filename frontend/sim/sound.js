/* TutinGuard — звук: процедурные эффекты (Web Audio, без файлов) + голосовые объявления СОУЭ (mp3).
 * Подключается обычным <script src> и в 3D-сцене, и на пульте: window.TGSound.
 * Браузер разрешает звук только после первого клика — unlock() вызывается на первый pointerdown. */
(function () {
  const BASE = (document.currentScript && document.currentScript.src.replace(/sound\.js.*$/, '')) || '/sim/';
  const VOICE = {
    evac: ['voice_evac_kz.mp3', 'voice_evac_ru.mp3'],
    gas: ['voice_gas_ru.mp3'],
    test: ['voice_test_ru.mp3'],
    allclear: ['voice_allclear_ru.mp3'],
  };
  let ctx = null, master = null, noiseBuf = null, brownBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('tg-muted') === '1'; } catch (e) { /* storage недоступен */ }
  const loops = {};
  const listeners = [];
  const voiceBufs = {};
  let voiceJob = null; // { kind, stop }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = makeBuf(2, () => Math.random() * 2 - 1);
    let last = 0; brownBuf = makeBuf(4, () => { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; return last * 3.5; });
    for (const k of Object.keys(VOICE)) for (const f of VOICE[k]) loadVoice(f);
    return ctx;
  }
  function makeBuf(sec, fn) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fn(i, d.length);
    return b;
  }
  async function loadVoice(f) {
    if (voiceBufs[f]) return voiceBufs[f];
    voiceBufs[f] = fetch(BASE + 'sounds/' + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(a => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej)))
      .catch(e => { console.warn('[TGSound] нет файла', f, e); return null; });
    return voiceBufs[f];
  }
  const now = () => ctx.currentTime;
  function noiseSrc(buf = noiseBuf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); return s; }
  function env(g, t0, a, peak, d) { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  function tone(freq, t0, dur, { type = 'sine', vol = 0.3, a = 0.005, out = master, slideTo } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, a, vol, dur); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + a + dur + 0.05);
  }
  function burst(t0, dur, { f = 3000, q = 1, type = 'bandpass', vol = 0.3, out = master } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); env(g, t0, 0.002, vol, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  // ---------- непрерывные звуки: громкость задаётся setLoop(name, 0..1) ----------
  const LOOP_BUILD = {
    // оповещатель «вой»: пила 750–1250 Гц, качание ~1,6 Гц (как типовые звуковые оповещатели СОУЭ)
    siren() {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 1000;
      const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 1.6;
      const depth = ctx.createGain(); depth.gain.value = 250; lfo.connect(depth); depth.connect(o.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const g = ctx.createGain(); g.gain.value = 0.16; o.connect(lp); lp.connect(g);
      o.start(); lfo.start(); return { out: g, stop: () => { o.stop(); lfo.stop(); } };
    },
    // огонь: низкий гул + потрескивание
    crackle() {
      const buf = makeBuf(4, (i, n) => 0);
      const d = buf.getChannelData(0), sr = ctx.sampleRate; let lp = 0;
      for (let i = 0; i < d.length; i++) { lp += 0.03 * ((Math.random() * 2 - 1) - lp); d[i] = lp * 1.6; }
      for (let k = 0; k < 140; k++) { // щелчки
        const at = Math.floor(Math.random() * (d.length - sr * 0.03)), len = Math.floor(sr * (0.002 + Math.random() * 0.02)), a = 0.25 + Math.random() * 0.7;
        for (let j = 0; j < len; j++) d[at + j] += (Math.random() * 2 - 1) * a * Math.exp(-j / (len / 4));
      }
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0.55; s.connect(g); s.start(); return { out: g, stop: () => s.stop() };
    },
    // тление / перегрев: тихое шипение с медленным «дыханием»
    smoulder() {
      const s = noiseSrc(); const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0.07; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.3; const lg = ctx.createGain(); lg.gain.value = 0.03;
      lfo.connect(lg); lg.connect(g.gain); s.connect(hp); hp.connect(g); s.start(); lfo.start(); return { out: g, stop: () => { s.stop(); lfo.stop(); } };
    },
    // утечка газа: ровное высокое шипение
    gas() {
      const s = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6500; bp.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = 0.12; s.connect(bp); bp.connect(g); s.start(); return { out: g, stop: () => s.stop() };
    },
    // пожарная машина: сирена «вой» (медленный подъём и спад тона)
    firetruck() {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 900;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = .45;
      const depth = ctx.createGain(); depth.gain.value = 420; lfo.connect(depth); depth.connect(o.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const g = ctx.createGain(); g.gain.value = 0.09; o.connect(lp); lp.connect(g);
      o.start(); lfo.start(); return { out: g, stop: () => { o.stop(); lfo.stop(); } };
    },
    // струя воды: широкополосный шум
    water() {
      const s = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = .4;
      const g = ctx.createGain(); g.gain.value = 0.22; s.connect(bp); bp.connect(g); s.start(); return { out: g, stop: () => s.stop() };
    },
    // фон офиса: вентиляция + гул серверов
    ambience() {
      const s = noiseSrc(brownBuf); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const hum = ctx.createOscillator(); hum.frequency.value = 100; const hg = ctx.createGain(); hg.gain.value = 0.012;
      const g = ctx.createGain(); g.gain.value = 0.10; s.connect(lp); lp.connect(g); hum.connect(hg); hg.connect(g);
      s.start(); hum.start(); return { out: g, stop: () => { s.stop(); hum.stop(); } };
    },
    // шаги эвакуирующихся (≈2 шага/с, с разбросом)
    footsteps() {
      const sr = ctx.sampleRate, buf = makeBuf(4, () => 0), d = buf.getChannelData(0);
      for (let t = 0.05; t < 3.9; t += 0.42 + Math.random() * 0.2) {
        const at = Math.floor(t * sr), len = Math.floor(sr * 0.07); let lp = 0;
        for (let j = 0; j < len && at + j < d.length; j++) { lp += 0.15 * ((Math.random() * 2 - 1) - lp); d[at + j] += (lp * 2.5 + Math.sin(j / sr * 2 * Math.PI * 90) * 0.5) * Math.exp(-j / (len / 5)); }
      }
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const g = ctx.createGain(); g.gain.value = 0.5; s.connect(g); s.start();
      return { out: g, stop: () => s.stop() };
    },
  };
  function setLoop(name, level) {
    if (!ctx || ctx.state !== 'running') return;
    level = Math.max(0, Math.min(1, level || 0));
    let L = loops[name];
    if (!L && level < 0.005) return;
    if (!L) { const b = LOOP_BUILD[name](); const v = ctx.createGain(); v.gain.value = 0; b.out.connect(v); v.connect(master); L = loops[name] = { ...b, vol: v, level: 0 }; }
    if (Math.abs(L.level - level) < 0.01) return;
    L.level = level; L.vol.gain.setTargetAtTime(level, now(), 0.15);
  }
  function duck(on) { const L = loops.siren; if (L) L.vol.gain.setTargetAtTime(on ? L.level * 0.18 : L.level, now(), 0.2); }

  // ---------- короткие эффекты ----------
  const FX = {
    // извещатель перешёл в «пожар»: три писка 3,2 кГц
    detector(vol = 1) { const t = now(); for (let i = 0; i < 3; i++) tone(3200, t + i * 0.22, 0.12, { type: 'square', vol: 0.06 * vol }); },
    // «внимание» (предтревога): одиночный короткий чирп
    chirp(vol = 1) { tone(2900, now(), 0.06, { type: 'square', vol: 0.04 * vol }); },
    // искрение проводки
    spark(vol = 1) { const t = now(); const n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) burst(t + i * (0.02 + Math.random() * 0.05), 0.015 + Math.random() * 0.03, { f: 4500, q: 0.7, type: 'highpass', vol: 0.35 * vol }); },
    // электромагнитный замок выхода
    door(vol = 1) { const t = now(); burst(t, 0.03, { f: 1800, q: 2, vol: 0.4 * vol }); tone(110, t + 0.02, 0.18, { vol: 0.25 * vol, slideTo: 70 }); burst(t + 0.16, 0.02, { f: 2500, q: 3, vol: 0.25 * vol }); },
    // ---- пульт оператора ----
    uiAlarm() { const t = now(); for (let i = 0; i < 3; i++) { tone(988, t + i * 0.36, 0.16, { type: 'square', vol: 0.09 }); tone(740, t + i * 0.36 + 0.18, 0.16, { type: 'square', vol: 0.09 }); } },
    uiAttention() { const t = now(); tone(660, t, 0.12, { type: 'triangle', vol: 0.22 }); tone(660, t + 0.2, 0.12, { type: 'triangle', vol: 0.22 }); },
    uiForecast() { const t = now(); tone(523, t, 0.9, { vol: 0.16, a: 0.01 }); tone(784, t + 0.14, 0.9, { vol: 0.12, a: 0.01 }); tone(1047, t + 0.28, 0.8, { vol: 0.07, a: 0.01 }); },
    uiOffline() { tone(392, now(), 0.35, { type: 'triangle', vol: 0.2, slideTo: 196 }); },
    uiEscalation() { const t = now(); for (let i = 0; i < 6; i++) tone(1200, t + i * 0.12, 0.06, { type: 'square', vol: 0.08 }); },
    uiResolved() { const t = now(); [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.1, 0.25, { type: 'triangle', vol: 0.15 })); },
  };
  function play(name, vol) { if (!ctx || ctx.state !== 'running' || muted) return; if (FX[name]) FX[name](vol ?? 1); }

  // ---------- голосовые объявления ----------
  function playBuf(buf, onEnd) {
    const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = 1.0;
    s.connect(g); g.connect(master); s.onended = onEnd; s.start(); return s;
  }
  /** kind: evac | gas | test | allclear. repeat=true — по кругу (казахский → русский → пауза), пока не stopVoice() */
  async function voice(kind, { repeat = false, pause = 3 } = {}) {
    if (!ensure()) return;
    stopVoice();
    const job = { kind, alive: true, src: null, timer: null };
    voiceJob = job;
    const files = VOICE[kind] || [];
    const bufs = (await Promise.all(files.map(loadVoice))).filter(Boolean);
    if (!bufs.length || !job.alive) return;
    let i = 0;
    const next = () => {
      if (!job.alive) return;
      if (i >= bufs.length) {
        duck(false);
        if (!repeat) { if (voiceJob === job) voiceJob = null; return; }
        i = 0; job.timer = setTimeout(next, pause * 1000); return;
      }
      duck(true); job.src = playBuf(bufs[i++], next);
    };
    next();
  }
  function stopVoice() {
    if (!voiceJob) return;
    voiceJob.alive = false; clearTimeout(voiceJob.timer);
    try { voiceJob.src && voiceJob.src.stop(); } catch (e) { /* уже остановлен */ }
    voiceJob = null; duck(false);
  }
  const voiceKind = () => voiceJob ? voiceJob.kind : null;

  // ---------- включение / выключение ----------
  function unlock() { if (!ensure()) return; if (ctx.state !== 'running') ctx.resume().then(emit); else emit(); }
  function setMuted(m) {
    muted = !!m; try { localStorage.setItem('tg-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.05);
    if (!muted) unlock(); emit();
  }
  const isOn = () => !!ctx && ctx.state === 'running' && !muted;
  function emit() { listeners.forEach(f => f(isOn())); }
  function onChange(f) { listeners.push(f); }
  /** Кнопка «🔊/🔇» — переключает звук и показывает состояние */
  function bindButton(btn) {
    const upd = (on) => { const T = window.TGUI; btn.innerHTML = T ? T.icon(on ? 'volume' : 'mute') + '<span>' + T.t('Звук') + '</span>' : (on ? 'Звук: вкл' : 'Звук: выкл'); btn.classList.toggle('on', on); btn.title = on ? 'Выключить звук' : 'Включить звук'; };
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (isOn()) setMuted(true); else setMuted(false); });
    onChange(upd); upd(isOn());
  }
  addEventListener('pointerdown', function first() { if (!muted) unlock(); removeEventListener('pointerdown', first, true); }, true);
  addEventListener('keydown', function first() { if (!muted) unlock(); removeEventListener('keydown', first, true); }, true);

  window.TGSound = { unlock, setMuted, isOn, onChange, bindButton, setLoop, play, voice, stopVoice, voiceKind, get muted() { return muted; } };
})();
