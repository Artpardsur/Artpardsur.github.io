/* Плеер: большая «сцена» в секции «Музыка» + мини-плеер внизу экрана,
   когда сцена уехала за пределы окна. Очередь — текущий плейлист,
   перемотка по форме волны, связь с туманностью через Web Audio. */
(function () {
  const audio = document.getElementById('audioEl');

  const stage = document.getElementById('stage');
  const coverImg = document.getElementById('stageCoverImg');
  const coverVid = document.getElementById('stageCoverVid');
  const coverBlur = document.getElementById('stageCoverBlur');
  const titleEl = document.getElementById('stageTitle');
  const projectEl = document.getElementById('stageProject');
  const tagsEl = document.getElementById('stageTags');
  const waveCanvas = document.getElementById('stageWave');
  const waveCtx = waveCanvas.getContext('2d');
  const curEl = document.getElementById('stageCur');
  const totalEl = document.getElementById('stageTotal');
  const btnToggle = document.getElementById('stToggle');
  const btnPrev = document.getElementById('stPrev');
  const btnNext = document.getElementById('stNext');
  const btnShuffle = document.getElementById('stShuffle');
  const btnRepeat = document.getElementById('stRepeat');
  const btnMute = document.getElementById('stMute');
  const volEl = document.getElementById('stVolume');

  const minibar = document.getElementById('minibar');
  const miniCover = document.getElementById('miniCover');
  const miniCoverImg = document.getElementById('miniCoverImg');
  const miniTitle = document.getElementById('miniTitle');
  const miniProject = document.getElementById('miniProject');
  const miniToggle = document.getElementById('miniToggle');
  const miniPrev = document.getElementById('miniPrev');
  const miniNext = document.getElementById('miniNext');
  const miniProg = document.getElementById('miniProg');
  const miniProgFill = document.getElementById('miniProgFill');
  const miniTime = document.getElementById('miniTime');

  const Player = {
    queue: [],        // текущий плейлист (после фильтров)
    current: null,    // объект трека
    onChange: null,   // колбэк для main.js (подсветка строк списка)
    shuffle: false,
    repeat: false,
  };
  window.Player = Player;

  /* Громкость запоминается между визитами */
  const savedVol = parseFloat(localStorage.getItem('pardus-vol'));
  if (isFinite(savedVol)) volEl.value = savedVol;
  audio.volume = parseFloat(volEl.value);
  updateVolIcon();

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
    const peaks = peaksFor(Player.current);
    if (!peaks || !audio.duration) return 0.25;
    const idx = Math.min(peaks.length - 1, Math.floor(audio.currentTime / audio.duration * peaks.length));
    return peaks[idx] * 0.6;
  };

  /* ---- Форма волны ---- */
  // Для трека, добавленного вручную без пересчёта peaks.js, рисуем
  // ровную «заглушку», чтобы плеер не выглядел сломанным.
  const fallbackCache = {};
  function fallbackPeaks(id) {
    if (fallbackCache[id]) return fallbackCache[id];
    let seed = 0;
    for (let i = 0; i < (id || '').length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 9973;
    const arr = [];
    for (let i = 0; i < 110; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      arr.push(0.32 + (seed / 2147483648) * 0.22);
    }
    fallbackCache[id] = arr;
    return arr;
  }
  function peaksFor(track) {
    if (!track) return null;
    const p = window.PEAKS[track.id];
    return (p && p.length) ? p : fallbackPeaks(track.id);
  }

  function drawWave(canvas, ctx, peaks, progress, playedColor, restColor) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const n = peaks.length;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const p = Math.max(peaks[i], 0.05);
      const bh = p * (h - 4);
      ctx.fillStyle = (i / n) <= progress ? playedColor : restColor;
      const x = i * bw;
      ctx.beginPath();
      ctx.roundRect(x + bw * 0.15, (h - bh) / 2, Math.max(bw * 0.7, 1), bh, 2);
      ctx.fill();
    }
  }

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function fmt(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    s = Math.round(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function progress() {
    return audio.duration ? audio.currentTime / audio.duration : 0;
  }

  // Перерисовка — только когда музыка играет или что-то поменялось (трек,
  // перемотка, размер окна, Konami-тема): на паузе цикл почти ничего не делает.
  let waveDirty = true;
  let playedColor = css('--yellow');
  Player.markDirty = () => { waveDirty = true; };
  addEventListener('resize', () => { waveDirty = true; });
  new MutationObserver(() => { playedColor = css('--yellow'); waveDirty = true; })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-alt-theme'] });
  audio.addEventListener('seeked', () => { waveDirty = true; });

  function renderLoop() {
    if (Player.current && (waveDirty || !audio.paused)) {
      waveDirty = false;
      const peaks = peaksFor(Player.current);
      const pr = progress();
      // форму волны рисуем, только пока сцена на экране (когда она снова появится,
      // наблюдатель ниже пометит волну к перерисовке); мини-плеер — всегда
      if (stageVisible) drawWave(waveCanvas, waveCtx, peaks, pr, playedColor, 'rgba(139,92,246,0.4)');
      const dur = audio.duration || window.DURS[Player.current.id] || 0;
      curEl.textContent = fmt(audio.currentTime);
      totalEl.textContent = fmt(dur);
      miniProgFill.style.width = (pr * 100) + '%';
      miniTime.textContent = fmt(audio.currentTime);
      // тонкая полоска прогресса в строке играющего трека списка
      const row = document.querySelector('.track.playing .track-line-fill');
      if (row) row.style.width = (pr * 100) + '%';
    }
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  /* ---- Обложка ---- */
  const isVideo = (src) => /\.(mp4|webm|mov)$/i.test(src || '');

  // что показать в плеере: обложка проекта, иначе его медиа
  function coverFor(project) {
    if (!project) return null;
    return project.cover || project.media || null;
  }

  /* ---- Управление ---- */
  Player.load = function (track, autoplay) {
    if (!track) return;
    const same = Player.current && Player.current.id === track.id;
    Player.current = track;
    if (!same) {
      audio.src = track.file;
      audio.currentTime = 0;
    }
    if (autoplay) {
      ensureAnalyser();
      audio.play().catch(() => {});
      window.Nebula.kick = 0.8; // всплеск туманности при старте
    }
    updateUI();
  };

  Player.play = function (track) {
    if (Player.current && Player.current.id === track.id) { Player.toggle(); return; }
    Player.load(track, true);
  };

  Player.toggle = function () {
    if (!Player.current) {
      if (Player.queue.length) Player.load(Player.queue[0], true);
      return;
    }
    ensureAnalyser();
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  };

  Player.step = function (dir) {
    if (!Player.queue.length) return;
    if (!Player.current) { Player.load(Player.queue[0], true); return; }
    let i = Player.queue.findIndex((t) => t.id === Player.current.id);
    if (Player.shuffle && Player.queue.length > 1) {
      let j = i;
      while (j === i) j = Math.floor(Math.random() * Player.queue.length);
      i = j;
    } else {
      i = (i + dir + Player.queue.length) % Player.queue.length;
    }
    Player.play(Player.queue[i]);
  };

  Player.seekFraction = function (f) {
    if (!audio.duration || !isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(1, f)) * audio.duration;
  };

  Player.nudge = function (sec) {
    if (!audio.duration) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration - 0.2, audio.currentTime + sec));
  };

  function updateUI() {
    const tr = Player.current;
    if (!tr) return;
    waveDirty = true;
    const proj = window.CONTENT.projects.find((p) => p.id === tr.project);
    const title = window.loc(tr.title);
    const projName = proj ? window.loc(proj.name) : window.t('music.noProject');

    titleEl.textContent = title;
    projectEl.textContent = projName;
    miniTitle.textContent = title;
    miniProject.textContent = projName;

    // теги трека — только в плеере, чтобы список оставался спокойным
    tagsEl.innerHTML = '';
    (tr.genres || []).concat(tr.moods || []).forEach((k, i) => {
      const isMood = i >= (tr.genres || []).length;
      const s = document.createElement('span');
      s.className = 'stage-tag' + (isMood ? ' is-mood' : '');
      s.textContent = window.t((isMood ? 'mood.' : 'genre.') + k);
      tagsEl.appendChild(s);
    });

    const cover = coverFor(proj);
    const vid = isVideo(cover);
    // видео-обложка играет в плеере, но в маленький мини-плеер её не тащим
    if (cover && vid) {
      if (!coverVid.src.endsWith(cover)) coverVid.src = cover;
      coverVid.hidden = false;
      coverVid.play().catch(() => {});
      coverImg.hidden = true;
      coverImg.removeAttribute('src');
      coverBlur.style.backgroundImage = '';
    } else if (cover) {
      coverImg.src = cover;
      coverImg.hidden = false;
      coverBlur.style.backgroundImage = 'url("' + cover + '")';
      coverVid.hidden = true;
      coverVid.pause();
    } else {
      coverImg.hidden = true;
      coverImg.removeAttribute('src');
      coverVid.hidden = true;
      coverBlur.style.backgroundImage = '';
    }
    const miniCover = (cover && !vid) ? cover : null;
    if (miniCover) {
      miniCoverImg.src = miniCover;
      miniCoverImg.hidden = false;
    } else {
      miniCoverImg.hidden = true;
      miniCoverImg.removeAttribute('src');
    }

    stage.classList.toggle('playing', !audio.paused);
    minibar.classList.toggle('playing', !audio.paused);
    stage.classList.add('loaded');
    totalEl.textContent = fmt(audio.duration || window.DURS[tr.id] || 0);

    document.querySelectorAll('.track').forEach((el) => {
      const isCur = el.dataset.id === tr.id;
      el.classList.toggle('current', isCur);
      el.classList.toggle('playing', isCur && !audio.paused);
    });

    updateMinibar();
    if (Player.onChange) Player.onChange();

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: title,
          artist: 'Pardus (Артём Лиджиев)',
          album: proj ? window.loc(proj.name) : '',
          artwork: miniCover ? [{ src: new URL(miniCover, location.href).href, sizes: '512x512', type: 'image/jpeg' }] : [],
        });
      } catch (e) { /* не критично */ }
    }
  }
  Player.updateUI = updateUI;

  /* ---- Мини-плеер: показываем, когда сцена не видна ---- */
  // до первого запуска музыки не показываем: незачем занимать низ экрана
  let stageVisible = true, everPlayed = false;
  function updateMinibar() {
    const show = everPlayed && !!Player.current && !stageVisible;
    minibar.classList.toggle('visible', show);
    minibar.setAttribute('aria-hidden', show ? 'false' : 'true');
    // низ страницы не должен прятаться под мини-плеером
    document.body.classList.toggle('minibar-on', show);
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { stageVisible = e.isIntersecting; });
    if (stageVisible) waveDirty = true;
    updateMinibar();
  }, { threshold: 0.12 });
  io.observe(stage);

  miniCover.addEventListener('click', () => {
    document.getElementById('music').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---- События аудио ---- */
  audio.addEventListener('play', () => { everPlayed = true; updateUI(); });
  audio.addEventListener('pause', updateUI);
  audio.addEventListener('loadedmetadata', () => {
    if (Player.current) totalEl.textContent = fmt(audio.duration);
  });
  audio.addEventListener('ended', () => {
    if (Player.repeat) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    Player.step(1);
  });

  /* ---- Кнопки ---- */
  [btnToggle, miniToggle].forEach((b) => b.addEventListener('click', () => Player.toggle()));
  [btnPrev, miniPrev].forEach((b) => b.addEventListener('click', () => Player.step(-1)));
  [btnNext, miniNext].forEach((b) => b.addEventListener('click', () => Player.step(1)));

  btnShuffle.addEventListener('click', () => {
    Player.shuffle = !Player.shuffle;
    btnShuffle.classList.toggle('on', Player.shuffle);
    window.showToast(window.t('player.shuffle') + ': ' + window.t(Player.shuffle ? 'common.on' : 'common.off'));
  });
  btnRepeat.addEventListener('click', () => {
    Player.repeat = !Player.repeat;
    btnRepeat.classList.toggle('on', Player.repeat);
    window.showToast(window.t('player.repeat') + ': ' + window.t(Player.repeat ? 'common.on' : 'common.off'));
  });

  /* ---- Громкость ---- */
  let lastVol = parseFloat(volEl.value) || 0.9;
  function updateVolIcon() {
    btnMute.classList.toggle('muted', audio.volume === 0);
  }
  volEl.addEventListener('input', () => {
    audio.volume = parseFloat(volEl.value);
    if (audio.volume > 0) lastVol = audio.volume;
    localStorage.setItem('pardus-vol', String(audio.volume));
    updateVolIcon();
  });
  btnMute.addEventListener('click', () => {
    audio.volume = audio.volume > 0 ? 0 : (lastVol || 0.9);
    volEl.value = audio.volume;
    localStorage.setItem('pardus-vol', String(audio.volume));
    updateVolIcon();
  });

  /* ---- Перемотка: по волне в плеере и по полоске в мини-плеере ---- */
  function dragSeek(el, toFraction) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      toFraction(e);
      const move = (ev) => toFraction(ev);
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
  }
  dragSeek(waveCanvas, (e) => {
    const r = waveCanvas.getBoundingClientRect();
    Player.seekFraction((e.clientX - r.left) / r.width);
  });
  dragSeek(miniProg, (e) => {
    const r = miniProg.getBoundingClientRect();
    Player.seekFraction((e.clientX - r.left) / r.width);
  });

  /* ---- Клавиатура: пробел — пауза, стрелки — перемотка ---- */
  addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space' && Player.current) {
      if (document.activeElement.tagName === 'BUTTON') return; // не мешаем нажатию кнопки
      e.preventDefault();
      Player.toggle();
    } else if (e.code === 'ArrowRight' && Player.current && !e.altKey) {
      Player.nudge(5);
    } else if (e.code === 'ArrowLeft' && Player.current && !e.altKey) {
      Player.nudge(-5);
    }
  });
})();
