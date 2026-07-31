/* Мелкие интерактивные детали: прелоадер, анимация букв,
   бегущая строка ролей, пианино-пасхалка, Konami-код, тосты. */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Тост ---- */
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  window.showToast = function (msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  };

  /* ---- Прелоадер: эквалайзер + имя по буквам ---- */
  const pre = document.getElementById('preloader');
  const eq = document.getElementById('preloaderEq');
  const nameEl = document.getElementById('preloaderName');
  for (let i = 0; i < 7; i++) {
    const bar = document.createElement('span');
    bar.style.animationDelay = (i * 0.09) + 's';
    eq.appendChild(bar);
  }
  const nameText = nameEl.textContent;
  nameEl.textContent = '';
  [...nameText].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.animationDelay = (0.15 + i * 0.08) + 's';
    nameEl.appendChild(s);
  });
  const hidePre = () => { pre.classList.add('done'); setTimeout(() => pre.remove(), 700); };
  if (reduced) hidePre();
  else {
    const minTime = new Promise((res) => setTimeout(res, 1350));
    const loaded = new Promise((res) => {
      if (document.readyState === 'complete') res();
      else addEventListener('load', res);
    });
    Promise.all([minTime, loaded]).then(hidePre);
    setTimeout(hidePre, 4000); // страховка
  }

  /* ---- Разбивка текста на буквы + появление при скролле ---- */
  window.splitLetters = function (el) {
    const text = el.textContent;
    el.textContent = '';
    let i = 0;
    const words = text.split(' ').filter(Boolean);
    words.forEach((word, wi) => {
      // слово — неразрывный блок: перенос возможен только между словами
      const w = document.createElement('span');
      w.className = 'word';
      for (const ch of word) {
        const s = document.createElement('span');
        s.className = 'ltr';
        s.textContent = ch;
        s.style.animationDelay = (i * 0.028) + 's';
        w.appendChild(s);
        i++;
      }
      el.appendChild(w);
      if (wi < words.length - 1) { el.appendChild(document.createTextNode(' ')); i++; }
    });
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); }
    });
  }, { threshold: 0.25 });

  window.observeAnims = function () {
    document.querySelectorAll('[data-anim]').forEach((el) => {
      el.classList.remove('in-view');
      io.observe(el);
    });
  };

  /* ---- Бегущая строка ролей (эффект печатной машинки) ---- */
  const rotEl = document.getElementById('roleRotator');
  let roles = [], rTimer = null;
  window.RoleRotator = {
    set(list) {
      roles = list || [];
      clearTimeout(rTimer);
      if (!roles.length) return;
      let wi = 0;
      const typeWord = () => {
        const word = roles[wi % roles.length];
        let ci = 0, deleting = false;
        const tick = () => {
          rotEl.textContent = word.slice(0, ci);
          if (!deleting) {
            ci++;
            if (ci > word.length) { deleting = true; rTimer = setTimeout(tick, 1700); return; }
            rTimer = setTimeout(tick, 55 + Math.random() * 45);
          } else {
            ci--;
            if (ci < 0) { wi++; rTimer = setTimeout(typeWord, 250); return; }
            rTimer = setTimeout(tick, 28);
          }
        };
        tick();
      };
      if (reduced) { rotEl.textContent = roles[0]; return; }
      typeWord();
    },
  };

  /* ---- Шапка: фон при скролле, бургер ---- */
  const header = document.getElementById('siteHeader');
  addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 30), { passive: true });

  const burger = document.getElementById('burger');
  const nav = document.getElementById('siteNav');
  burger.addEventListener('click', () => nav.classList.toggle('open'));
  nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') nav.classList.remove('open'); });

  /* ---- Пианино-пасхалка ---- */
  const piano = document.getElementById('piano');
  const pianoToggle = document.getElementById('pianoToggle');
  const pianoHint = document.getElementById('pianoHint');
  let audioCtx = null;

  // Ноты одной октавы: [нота, полутоны от C4, клавиша на клавиатуре, чёрная?]
  const KEYS = [
    ['C', 0, 'A', false], ['C#', 1, 'W', true], ['D', 2, 'S', false], ['D#', 3, 'E', true],
    ['E', 4, 'D', false], ['F', 5, 'F', false], ['F#', 6, 'T', true], ['G', 7, 'G', false],
    ['G#', 8, 'Y', true], ['A', 9, 'H', false], ['A#', 10, 'U', true], ['B', 11, 'J', false],
    ['C2', 12, 'K', false],
  ];

  let whiteIndex = 0;
  KEYS.forEach((k) => {
    const el = document.createElement('button');
    el.className = 'piano-key' + (k[3] ? ' black' : '');
    el.dataset.semi = k[1];
    el.dataset.kbd = k[2];
    el.innerHTML = '<span class="key-hint">' + k[2] + '</span>';
    el.setAttribute('data-cursor', 'link');
    if (k[3]) el.style.left = (whiteIndex * 34 - 11) + 'px';
    else whiteIndex++;
    piano.appendChild(el);
    const start = (e) => { e.preventDefault(); playNote(parseInt(k[1], 10), el); };
    el.addEventListener('pointerdown', start);
  });

  // На мобильных AudioContext рождается «спящим» и просыпается асинхронно —
  // ноту нужно планировать только ПОСЛЕ resume(), иначе будет тишина.
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      const p = audioCtx.resume();
      try { // iOS дополнительно требует «толкнуть» контекст пустым буфером
        const b = audioCtx.createBufferSource();
        b.buffer = audioCtx.createBuffer(1, 1, 22050);
        b.connect(audioCtx.destination);
        b.start(0);
      } catch (e) { /* не критично */ }
      return (p && p.then) ? p : Promise.resolve();
    }
    return Promise.resolve();
  }

  function playNote(semi, el) {
    if (el) { // визуальный отклик мгновенно, не дожидаясь звука
      el.classList.add('pressed');
      setTimeout(() => el.classList.remove('pressed'), 180);
    }
    try {
      ensureAudio().then(() => {
        const f = 261.63 * Math.pow(2, semi / 12); // от C4
        const t0 = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc2.type = 'sine';
        osc.frequency.value = f;
        osc2.frequency.value = f * 2;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.22, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
        const g2 = audioCtx.createGain();
        g2.gain.value = 0.06;
        osc.connect(gain);
        osc2.connect(g2).connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t0); osc2.start(t0);
        osc.stop(t0 + 1.5); osc2.stop(t0 + 1.5);
        window.Nebula.kick = 0.5;
      }).catch(() => { /* молчим */ });
    } catch (e) { /* нет Web Audio — молчим */ }
  }

  // Разбудить аудио при самом первом касании экрана (важно для iOS)
  addEventListener('touchend', function unlockOnce() {
    try { ensureAudio(); } catch (e) { /* нет Web Audio */ }
  }, { once: true, passive: true });

  pianoToggle.addEventListener('click', () => {
    piano.classList.toggle('open');
    pianoHint.classList.toggle('open', piano.classList.contains('open'));
    if (piano.classList.contains('open')) playNote(0, null);
  });

  addEventListener('keydown', (e) => {
    if (!piano.classList.contains('open')) return;
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const key = e.key.toUpperCase();
    const el = piano.querySelector('[data-kbd="' + key + '"]');
    if (el && !e.repeat) playNote(parseInt(el.dataset.semi, 10), el);
  });

  /* ---- Konami-код: ↑↑↓↓←→←→BA — меняет палитру ---- */
  const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let pos = 0;
  addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = (k === seq[pos]) ? pos + 1 : (k === seq[0] ? 1 : 0);
    if (pos === seq.length) {
      pos = 0;
      const root = document.documentElement;
      if (root.hasAttribute('data-alt-theme')) root.removeAttribute('data-alt-theme');
      else root.setAttribute('data-alt-theme', '');
      window.Nebula.kick = 1;
      window.showToast(window.t ? window.t('toast.konami') : '🎮');
    }
  });
})();
