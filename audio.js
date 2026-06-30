/**
 * 游戏音效（Web Audio API 合成，无需外部音频文件）
 */
(function () {
  let ctx = null;
  let master = null;
  let ambienceGain = null;
  let ambienceOsc = null;
  let ambienceNoise = null;
  let enabled = true;
  let lastShoot = 0;
  let lastExplosion = 0;

  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        return Promise.resolve(false);
      }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") {
      return ctx.resume().then(() => true);
    }
    return Promise.resolve(true);
  }

  function tone(options) {
    if (!enabled || !ctx || !master) {
      return;
    }
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const dur = options.duration || 0.1;
    const vol = options.volume || 0.12;
    osc.type = options.type || "square";
    osc.frequency.setValueAtTime(options.freq || 440, t);
    if (options.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.freqEnd), t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (options.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(options) {
    if (!enabled || !ctx || !master) {
      return;
    }
    const t = ctx.currentTime;
    const dur = options.duration || 0.2;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = options.filterFreq || 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(options.volume || 0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  function startAmbience() {
    if (!enabled || !ctx || ambienceOsc) {
      return;
    }
    ambienceGain = ctx.createGain();
    ambienceGain.gain.value = 0.06;
    ambienceGain.connect(master);

    ambienceOsc = ctx.createOscillator();
    ambienceOsc.type = "sine";
    ambienceOsc.frequency.value = 55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(ambienceOsc.frequency);
    const ag = ctx.createGain();
    ag.gain.value = 0.04;
    ambienceOsc.connect(ag);
    ag.connect(ambienceGain);
    ambienceOsc.start();
    lfo.start();

    const bufLen = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i += 1) {
      ch[i] = Math.random() * 2 - 1;
    }
    ambienceNoise = ctx.createBufferSource();
    ambienceNoise.buffer = buf;
    ambienceNoise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 400;
    nf.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.035;
    ambienceNoise.connect(nf);
    nf.connect(ng);
    ng.connect(ambienceGain);
    ambienceNoise.start();
  }

  function stopAmbience() {
    if (ambienceOsc) {
      try {
        ambienceOsc.stop();
      } catch (e) {
        /* ignore */
      }
      ambienceOsc = null;
    }
    if (ambienceNoise) {
      try {
        ambienceNoise.stop();
      } catch (e) {
        /* ignore */
      }
      ambienceNoise = null;
    }
    ambienceGain = null;
  }

  window.GameAudio = {
    init: ensureContext,
    startAmbience,
    stopAmbience,
    setEnabled(v) {
      enabled = v;
      if (!enabled) {
        stopAmbience();
      }
    },

    shoot() {
      const now = performance.now();
      if (now - lastShoot < 45) {
        return;
      }
      lastShoot = now;
      tone({ freq: 920, freqEnd: 280, duration: 0.05, type: "sawtooth", volume: 0.07 });
    },

    missileLaunch() {
      tone({ freq: 180, freqEnd: 420, duration: 0.12, type: "triangle", volume: 0.09 });
      noiseBurst({ duration: 0.08, volume: 0.05, filterFreq: 600 });
    },

    explosion(kind) {
      const now = performance.now();
      if (now - lastExplosion < 55) {
        return;
      }
      lastExplosion = now;
      const scale = kind === "boss" ? 1.35 : kind === "heavy" ? 1.1 : kind === "large" ? 1.5 : 1;
      noiseBurst({
        duration: 0.22 * scale,
        volume: 0.14 * scale,
        filterFreq: kind === "large" ? 700 : 1100
      });
      tone({ freq: 120, freqEnd: 40, duration: 0.25 * scale, type: "sine", volume: 0.1 * scale });
    },

    hit(amount) {
      const heavy = amount >= 50;
      tone({ freq: heavy ? 140 : 220, freqEnd: 60, duration: heavy ? 0.18 : 0.1, type: "square", volume: heavy ? 0.12 : 0.08 });
      noiseBurst({ duration: heavy ? 0.12 : 0.06, volume: heavy ? 0.1 : 0.06, filterFreq: 500 });
    },

    powerup() {
      tone({ freq: 520, freqEnd: 880, duration: 0.08, type: "sine", volume: 0.1 });
      tone({ freq: 880, freqEnd: 1320, duration: 0.1, type: "sine", volume: 0.08, attack: 0.02 });
    },

    nuke() {
      noiseBurst({ duration: 0.55, volume: 0.22, filterFreq: 400 });
      tone({ freq: 80, freqEnd: 25, duration: 0.6, type: "sine", volume: 0.15 });
      tone({ freq: 200, freqEnd: 50, duration: 0.4, type: "sawtooth", volume: 0.08, attack: 0.05 });
    },

    crash() {
      noiseBurst({ duration: 0.35, volume: 0.2, filterFreq: 800 });
      tone({ freq: 300, freqEnd: 30, duration: 0.35, type: "sawtooth", volume: 0.12 });
    },

    gameOver() {
      tone({ freq: 330, freqEnd: 110, duration: 0.35, type: "triangle", volume: 0.1 });
      tone({ freq: 220, freqEnd: 55, duration: 0.5, type: "sine", volume: 0.09, attack: 0.15 });
    }
  };
})();
