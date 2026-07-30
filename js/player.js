/* Плеер: очередь из отфильтрованных треков, waveform-перемотка,
   связь с туманностью (анализ баса через Web Audio). */
(function () {
  const audio = document.getElementById('audioEl');
  const playerEl = document.getElementById('player');
  const btnToggle = document.getElementById('playerToggle');
  const btnPrev = document.getElementById('playerPrev');
  const btnNext = document.getElementById('playerNext');
  const titleEl = document.getElementById('playerTitle');
  const projectEl = document.getElementById('playerProject');
  const timeEl = document.getElementById('playerTime');
  const volEl = document.getElementById('playerVolume');
  const waveCanvas = document.getElementById('playerWave');
  const waveCtx = waveCanvas.getContext('2d');

  const Player = {
    queue: [],        // текущий отфильтрованный список id треков
    current: null,    // объект трека
    onChange: null,   // колбэк для main.js (обновить подсветку строк)
  };
  window.Player = Player;

  audio.volume = parseFloat(volEl.value);

  /* ---- Web Audio: анализатор для туманности ---- */
  let analyser = null, freqData = null, audioCtxFailed = false;
  function ensureAnalyser() {
    if (analyser || audioCtxFailed) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      audioCtxFailed = true; // например, при открытии с диска (file://)
    }
  }

  window.Nebula.getLevel = function () {
    if (audio.paused) return 0;
    if (analyser) {
      analyser.getByteFrequencyData(freqData);
      let sum = 0;
      const n = 10; // нижние бины ≈ бас
      for (let i = 0; i < n; i++) sum += freqData[i];
      return Math.pow(sum / n / 255, 1.4) * 0.9;
    }
    // запасной вариант без анализатора: пульс из предрассчитанной формы волны
    const peaks = window.PEAKS[Player.current && Player.current.id];
    if (!peaks || !audio.duration) return 0.25;
    const idx = Math.min(peaks.length - 1, Math.floor(audio.currentTime / audio.duration * peaks.length));
    return peaks[idx] * 0.6;
  };

  /* ---- Waveform ---- */
  function drawWave(canvas, ctx, peaks, progress, playedColor, restColor) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const n = peaks.length;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const p = Math.max(peaks[i], 0.04);
      const bh = p * (h - 4);
      ctx.fillStyle = (i / n) <= progress ? playedColor : restColor;
      const x = i * bw;
      ctx.beginPath();
      ctx.roundRect(x + bw * 0.15, (h - bh) / 2, Math.max(bw * 0.7, 1), bh, 2);
      ctx.fill();
    }
  }

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function renderWaves() {
    if (Player.current) {
      const peaks = window.PEAKS[Player.current.id] || [];
      const progress = audio.duration ? audio.currentTime / audio.duration : 0;
      if (peaks.length) drawWave(waveCanvas, waveCtx, peaks, progress, css('--yellow'), 'rgba(139,92,246,0.45)');
      // мини-волна в строке играющего трека
      const row = document.querySelector('.track[data-id="' + Player.current.id + '"] .track-wave');
      if (row) drawWave(row, row.getContext('2d'), peaks, progress, css('--yellow'), 'rgba(157,147,184,0.35)');
      timeEl.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration || (Player.current.dur || 0));
    }
    requestAnimationFrame(renderWaves);
  }
  requestAnimationFrame(renderWaves);

  // волны в строках списка (не играющих) рисует main.js после рендера списка
  Player.drawStaticWave = function (canvas, trackId) {
    const peaks = window.PEAKS[trackId];
    if (!peaks) return;
    drawWave(canvas, canvas.getContext('2d'), peaks, -1, css('--yellow'), 'rgba(157,147,184,0.35)');
  };

  function fmt(s) {
    if (!isFinite(s)) return '0:00';
    s = Math.round(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---- Управление ---- */
  Player.play = function (track) {
    ensureAnalyser();
    if (Player.current && Player.current.id === track.id) { Player.toggle(); return; }
    Player.current = track;
    audio.src = track.file;
    audio.play().catch(() => {});
    playerEl.classList.add('visible');
    playerEl.setAttribute('aria-hidden', 'false');
    window.Nebula.kick = 0.8; // всплеск туманности при старте
    updateUI();
  };

  Player.toggle = function () {
    if (!Player.current) return;
    ensureAnalyser();
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  };

  Player.step = function (dir) {
    if (!Player.current || !Player.queue.length) return;
    let i = Player.queue.findIndex((t) => t.id === Player.current.id);
    i = (i + dir + Player.queue.length) % Player.queue.length;
    Player.play(Player.queue[i]);
  };

  function updateUI() {
    const t = Player.current;
    if (!t) return;
    titleEl.textContent = window.loc(t.title);
    const proj = window.CONTENT.projects.find((p) => p.id === t.project);
    projectEl.textContent = proj ? window.loc(proj.name) : '';
    btnToggle.textContent = audio.paused ? '▶' : '❚❚';
    document.querySelectorAll('.track').forEach((el) => {
      el.classList.toggle('playing', el.dataset.id === t.id && !audio.paused);
    });
    if (Player.onChange) Player.onChange();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: window.loc(t.title),
        artist: 'Pardus (Артём Лиджиев)',
        album: proj ? window.loc(proj.name) : '',
      });
    }
  }

  audio.addEventListener('play', updateUI);
  audio.addEventListener('pause', updateUI);
  audio.addEventListener('ended', () => Player.step(1));

  btnToggle.addEventListener('click', () => Player.toggle());
  btnPrev.addEventListener('click', () => Player.step(-1));
  btnNext.addEventListener('click', () => Player.step(1));
  volEl.addEventListener('input', () => { audio.volume = parseFloat(volEl.value); });

  // Перемотка по волне
  function seek(e) {
    if (!audio.duration) return;
    const r = waveCanvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    audio.currentTime = Math.max(0, Math.min(1, x)) * audio.duration;
  }
  waveCanvas.addEventListener('pointerdown', (e) => {
    seek(e);
    const move = (ev) => seek(ev);
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });

  // Пробел = пауза (если фокус не в поле ввода)
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && Player.current && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) {
      e.preventDefault();
      Player.toggle();
    }
  });
})();
