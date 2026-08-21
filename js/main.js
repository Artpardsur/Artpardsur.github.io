/* Главный модуль: локализация, статистика, фильтры-«окна», плейлист,
   рендер звуков, проектов, контактов и таймлайна. */
(function () {
  const C = window.CONTENT;
  const I = window.I18N;

  /* Цвета кружков в окнах выбора — чтобы жанры и настроения различались глазом */
  const GENRE_COLORS = {
    orchestral: '#ffd60a', ambient: '#67e8f9', dark: '#8b5cf6', electronic: '#38bdf8',
    lofi: '#f0abfc', jazz: '#fb923c', rock: '#f43f5e',
  };
  const MOOD_COLORS = {
    calm: '#7dd3fc', sad: '#818cf8', happy: '#fde047',
    tense: '#fb7185', epic: '#c084fc', cozy: '#fdba74',
  };

  /* ---------- Локализация ---------- */
  let lang = localStorage.getItem('pardus-lang');
  if (!lang) {
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    lang = I.langs.some((l) => l.code === nav) ? nav : 'en';
  }

  window.t = function (key) {
    const s = I.strings;
    return (s[lang] && s[lang][key]) || (s.en && s.en[key]) || (s.ru && s.ru[key]) || key;
  };
  window.loc = function (obj) {
    if (typeof obj === 'string') return obj;
    if (!obj) return '';
    return obj[lang] || obj.en || obj.ru || Object.values(obj)[0];
  };

  const langCurrent = document.getElementById('langCurrent');
  const langMenu = document.getElementById('langMenu');
  const langSwitch = document.getElementById('langSwitch');

  I.langs.forEach((l) => {
    const b = document.createElement('button');
    b.textContent = l.label;
    b.dataset.code = l.code;
    b.setAttribute('data-cursor', 'link');
    b.addEventListener('click', () => { setLang(l.code); langMenu.classList.remove('open'); });
    langMenu.appendChild(b);
  });
  langCurrent.addEventListener('click', (e) => { e.stopPropagation(); langMenu.classList.toggle('open'); });
  document.addEventListener('click', (e) => { if (!langSwitch.contains(e.target)) langMenu.classList.remove('open'); });

  function setLang(code) {
    lang = code;
    localStorage.setItem('pardus-lang', code);
    applyLang();
  }

  function applyLang() {
    document.documentElement.lang = lang;
    langCurrent.textContent = lang.toUpperCase();
    langMenu.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.code === lang));
    document.title = t('meta.title');

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });

    // анимация букв: после подстановки текста
    document.querySelectorAll('[data-anim="letters"]').forEach((el) => window.splitLetters(el));
    const nameReal = document.querySelector('.hero-name-real');
    if (nameReal) window.splitLetters(nameReal);

    window.RoleRotator.set(t('hero.roles').split('|'));

    renderStats();
    renderPicks();
    renderTracks();
    renderSfx();
    renderProjects();
    renderContacts();
    renderTimeline();
    if (window.Player.current) window.Player.updateUI();
    window.observeAnims();

    document.getElementById('footerCopy').textContent =
      '© ' + new Date().getFullYear() + ' · ' + t('footer.copy');
  }

  /* ---------- Статистика: цифры набегают при появлении ---------- */
  const statsEl = document.getElementById('stats');
  let statsObserver = null;

  function sfxCount() {
    return C.sfx.reduce((n, g) => n + g.items.length, 0);
  }

  function renderStats() {
    // цифры из content.js.stats важнее подсчёта: звуков и треков сделано
    // больше, чем выложено на сайт
    const st = C.stats || {};
    const data = [
      { key: 'stats.projects', value: st.projects || C.projects.length },
      { key: 'stats.tracks', value: st.tracks || C.tracks.length },
      { key: 'stats.sounds', value: st.sounds || sfxCount() },
    ];
    statsEl.innerHTML = '';
    data.forEach((d, i) => {
      const el = document.createElement('div');
      el.className = 'stat';
      el.style.setProperty('--d', (i * 0.12) + 's');
      el.innerHTML = '<div class="stat-num" data-value="' + d.value + '">0</div>' +
        '<div class="stat-cap"></div>';
      el.querySelector('.stat-cap').textContent = t(d.key);
      statsEl.appendChild(el);
    });

    if (statsObserver) statsObserver.disconnect();
    statsObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        statsObserver.unobserve(en.target);
        en.target.classList.add('in');
        countUp(en.target.querySelector('.stat-num'));
      });
    }, { threshold: 0.4 });
    statsEl.querySelectorAll('.stat').forEach((el) => statsObserver.observe(el));
  }

  function countUp(el) {
    const to = parseInt(el.dataset.value, 10) || 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to; return; }
    const dur = 1400;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * eased);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = to;
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Фильтры: кнопки открывают выдвигающееся окно ---------- */
  const state = { genre: null, mood: null, project: null };

  const pickGenre = document.getElementById('pickGenre');
  const pickMood = document.getElementById('pickMood');
  const pickProject = document.getElementById('pickProject');
  const pickReset = document.getElementById('pickReset');

  // сколько треков даст фильтр, если применить его поверх остальных
  function countWith(patch) {
    const s = Object.assign({}, state, patch);
    return C.tracks.filter((tr) => matches(tr, s)).length;
  }

  function matches(tr, s) {
    // '__none__' — треки, не привязанные ни к одному проекту
    const projOk = !s.project ||
      (s.project === '__none__' ? !tr.project : tr.project === s.project);
    return (!s.genre || (tr.genres || []).includes(s.genre)) &&
      (!s.mood || (tr.moods || []).includes(s.mood)) && projOk;
  }

  function setPickValue(btn, text, active) {
    btn.querySelector('.pick-val').textContent = text;
    btn.classList.toggle('active', !!active);
  }

  function renderPicks() {
    setPickValue(pickGenre, state.genre ? t('genre.' + state.genre) : t('music.anyGenre'), state.genre);
    setPickValue(pickMood, state.mood ? t('mood.' + state.mood) : t('music.anyMood'), state.mood);
    const proj = state.project && C.projects.find((p) => p.id === state.project);
    setPickValue(pickProject, proj ? loc(proj.name) : t('music.anyProject'), state.project);
    pickReset.hidden = !(state.genre || state.mood || state.project);
  }

  // для маленьких миниатюр годится только картинка
  function projectCover(p) {
    const c = p.cover || p.media;
    return (c && !/\.(mp4|webm|mov)$/i.test(c)) ? c : null;
  }

  pickGenre.addEventListener('click', () => {
    window.Sheet.open({
      title: t('music.genreLabel'),
      anchor: pickGenre,
      value: state.genre,
      options: [{ value: null, label: t('music.anyGenre'), count: countWith({ genre: null }) }].concat(
        C.genres.map((g) => ({
          value: g, label: t('genre.' + g), color: GENRE_COLORS[g], count: countWith({ genre: g }),
        }))),
      onPick: (v) => { state.genre = v; renderPicks(); renderTracks(); },
    });
  });

  pickMood.addEventListener('click', () => {
    window.Sheet.open({
      title: t('music.moodLabel'),
      anchor: pickMood,
      value: state.mood,
      options: [{ value: null, label: t('music.anyMood'), count: countWith({ mood: null }) }].concat(
        C.moods.map((m) => ({
          value: m, label: t('mood.' + m), color: MOOD_COLORS[m], count: countWith({ mood: m }),
        }))),
      onPick: (v) => { state.mood = v; renderPicks(); renderTracks(); },
    });
  });

  pickProject.addEventListener('click', () => {
    const withTracks = C.projects.filter((p) => C.tracks.some((tr) => tr.project === p.id));
    const opts = [{ value: null, label: t('music.anyProject'), count: countWith({ project: null }) }];
    withTracks.forEach((p) => {
      opts.push({ value: p.id, label: loc(p.name), img: projectCover(p), count: countWith({ project: p.id }) });
    });
    if (C.tracks.some((tr) => !tr.project)) {
      opts.push({ value: '__none__', label: t('music.noProject'), count: countWith({ project: '__none__' }) });
    }
    window.Sheet.open({
      title: t('music.projectLabel'),
      anchor: pickProject,
      value: state.project,
      options: opts,
      onPick: (v) => { state.project = v; renderPicks(); renderTracks(); },
    });
  });

  pickReset.addEventListener('click', () => {
    state.genre = state.mood = state.project = null;
    renderPicks();
    renderTracks();
  });

  /* ---------- Выдвижной плейлист ---------- */
  const drawer = document.getElementById('drawer');
  const listToggle = document.getElementById('listToggle');
  const wideScreen = window.matchMedia('(min-width: 900px)').matches;
  let drawerOpen = localStorage.getItem('pardus-drawer');
  drawerOpen = drawerOpen === null ? wideScreen : drawerOpen === '1';

  function applyDrawer() {
    drawer.classList.toggle('open', drawerOpen);
    drawer.setAttribute('aria-hidden', drawerOpen ? 'false' : 'true');
    listToggle.classList.toggle('open', drawerOpen);
    listToggle.setAttribute('aria-expanded', drawerOpen ? 'true' : 'false');
  }
  listToggle.addEventListener('click', () => {
    drawerOpen = !drawerOpen;
    localStorage.setItem('pardus-drawer', drawerOpen ? '1' : '0');
    applyDrawer();
  });
  applyDrawer();

  /* ---------- Плейлист ---------- */
  function filteredTracks() {
    return C.tracks.filter((tr) => matches(tr, state));
  }

  function fmt(s) {
    if (!s) return '—';
    s = Math.round(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function renderTracks() {
    const list = document.getElementById('trackList');
    const tracks = filteredTracks();
    window.Player.queue = tracks;
    list.innerHTML = '';

    document.getElementById('listCount').textContent = tracks.length;

    if (!tracks.length) {
      const empty = document.createElement('div');
      empty.className = 'tracks-empty';
      empty.textContent = t('music.empty');
      list.appendChild(empty);
      return;
    }

    const cur = window.Player.current;
    const playing = cur && !document.getElementById('audioEl').paused;

    tracks.forEach((tr, i) => {
      const proj = C.projects.find((p) => p.id === tr.project);
      const row = document.createElement('button');
      row.className = 'track';
      row.dataset.id = tr.id;
      row.setAttribute('data-cursor', 'link');
      row.style.animationDelay = Math.min(i * 0.025, 0.4) + 's';
      if (cur && cur.id === tr.id) {
        row.classList.add('current');
        if (playing) row.classList.add('playing');
      }
      row.innerHTML =
        '<span class="track-num"><b>' + (i + 1) + '</b>' +
        '<span class="track-eq"><i></i><i></i><i></i></span></span>' +
        '<span class="track-meta">' +
        '<span class="track-title"></span>' +
        '<span class="track-proj"></span></span>' +
        '<span class="track-dur">' + fmt(window.DURS[tr.id]) + '</span>' +
        '<span class="track-line"><span class="track-line-fill"></span></span>';
      row.querySelector('.track-title').textContent = loc(tr.title);
      row.querySelector('.track-proj').textContent = proj ? loc(proj.name) : t('music.noProject');
      row.addEventListener('click', () => window.Player.play(tr));
      list.appendChild(row);
    });

    // в плеер сразу подставляем первый трек — но не запускаем без нажатия
    if (!window.Player.current) window.Player.load(tracks[0], false);
  }

  /* ---------- Саунд-дизайн ---------- */
  function renderSfx() {
    const wrap = document.getElementById('sfxGroups');
    wrap.innerHTML = '';
    C.sfx.forEach((group) => {
      const proj = C.projects.find((p) => p.id === group.project);
      const g = document.createElement('div');
      g.className = 'sfx-group';
      g.innerHTML = '<div class="sfx-group-title"></div>' +
        '<div class="sfx-group-sub">' + t('sound.groupSub') + '</div>';
      g.querySelector('.sfx-group-title').textContent = proj ? loc(proj.name) : group.project;
      const pads = document.createElement('div');
      pads.className = 'sfx-pads';
      group.items.forEach((item) => {
        const pad = document.createElement('button');
        pad.className = 'sfx-pad';
        pad.setAttribute('data-cursor', 'link');
        pad.innerHTML = '<span class="sfx-pad-icon">' + item.icon + '</span>' +
          '<span class="sfx-pad-name"></span>' +
          '<span class="sfx-pad-bar"></span>';
        pad.querySelector('.sfx-pad-name').textContent = loc(item.name);
        let cur = null; // играющий сейчас экземпляр этого пада
        pad.addEventListener('click', () => {
          // повторное нажатие — остановить звук
          if (cur && !cur.paused && !cur.ended) {
            cur.pause();
            cur = null;
            pad.classList.remove('playing');
            return;
          }
          const a = new Audio(item.file);
          cur = a;
          a.volume = 0.9;
          a.play().catch(() => {});
          window.Nebula.kick = 0.35;
          pad.classList.remove('playing');
          void pad.offsetWidth; // перезапуск анимации
          a.addEventListener('loadedmetadata', () => {
            if (cur !== a) return;
            pad.style.setProperty('--dur', Math.min(a.duration, 6) + 's');
            pad.classList.add('playing');
          });
          a.addEventListener('ended', () => {
            if (cur === a) { cur = null; pad.classList.remove('playing'); }
          });
        });
        pads.appendChild(pad);
      });
      g.appendChild(pads);
      wrap.appendChild(g);
    });
  }

  /* ---------- Проекты ---------- */
  function renderProjects() {
    const grid = document.getElementById('projectsGrid');
    grid.innerHTML = '';
    C.projects.forEach((p) => {
      const card = document.createElement('article');
      card.className = 'project-card';
      const roles = p.roles.map((r) => '<span class="project-role">' + t('role.' + r) + '</span>').join('');
      const links = (p.links || []).map((l) =>
        '<a class="project-link" href="' + l.url + '" target="_blank" rel="noopener" data-cursor="link">' + l.label + '</a>'
      ).join('');
      // медиа проекта: видео, картинка (для нестандартных пропорций —
      // с размытым фоном из неё же) или заглушка «видео скоро»
      let media = '';
      if (p.media && p.media.endsWith('.mp4')) {
        media = '<div class="project-media-wrap"><video class="project-media" src="' + p.media +
          '" autoplay muted loop playsinline disablepictureinpicture></video></div>';
      } else if (p.media) {
        media = '<div class="project-media-wrap">' +
          (p.mediaContain ? '<div class="pm-blur" style="background-image:url(\'' + p.media + '\')"></div>' : '') +
          '<img class="project-media' + (p.mediaContain ? ' pm-contain' : '') + '" src="' + p.media + '" alt="" loading="lazy">' +
          '</div>';
      } else if (p.videoSoon) {
        media = '<div class="project-media-wrap project-media-soon"><span class="pm-icon">🎬</span><span>' + t('projects.videoSoon') + '</span></div>';
      }
      const nTracks = C.tracks.filter((tr) => tr.project === p.id).length;
      card.innerHTML = media +
        '<div class="project-head"><div class="project-name"></div>' +
        '<span class="project-type">' + t('ptype.' + p.type) + '</span></div>' +
        '<div class="project-roles">' + roles + '</div>' +
        '<p class="project-desc"></p>' +
        (nTracks ? '<button class="project-listen" data-cursor="link">' +
          '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
          '<span>' + t('projects.listen') + '</span>' +
          '<b>' + nTracks + '</b></button>' : '') +
        (links ? '<div class="project-links">' + links + '</div>' : '');
      card.querySelector('.project-name').textContent = loc(p.name);
      card.querySelector('.project-desc').textContent = loc(p.desc);

      const listen = card.querySelector('.project-listen');
      if (listen) listen.addEventListener('click', () => openProjectPlaylist(p.id));

      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      });
      grid.appendChild(card);
    });
  }

  /* Кнопка на карточке проекта: перейти к плееру с плейлистом этого проекта */
  function openProjectPlaylist(projectId) {
    state.genre = null;
    state.mood = null;
    state.project = projectId;
    renderPicks();
    renderTracks();
    if (!drawerOpen) {
      drawerOpen = true;
      localStorage.setItem('pardus-drawer', '1');
      applyDrawer();
    }
    document.getElementById('music').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const first = window.Player.queue[0];
    if (first) window.Player.play(first);
    const proj = C.projects.find((p) => p.id === projectId);
    if (proj) window.showToast(t('music.playlist') + ' · ' + loc(proj.name));
  }

  /* ---------- Контакты ---------- */
  function renderContacts() {
    const grid = document.getElementById('contactsGrid');
    grid.innerHTML = '';
    C.contacts.forEach((c) => {
      const el = document.createElement(c.url ? 'a' : 'button');
      el.className = 'contact-card';
      el.setAttribute('data-cursor', 'link');
      if (c.url) { el.href = c.url; el.target = '_blank'; el.rel = 'noopener'; }
      el.innerHTML = '<span class="contact-icon">' + c.icon + '</span>' +
        '<span><span class="contact-label">' + t('contact.' + c.id) + '</span><br>' +
        '<span class="contact-value"></span></span>';
      el.querySelector('.contact-value').textContent = c.value;
      if (c.copy) {
        el.addEventListener('click', (e) => {
          if (!c.url) e.preventDefault();
          navigator.clipboard && navigator.clipboard.writeText(c.value)
            .then(() => window.showToast(t('toast.copied')))
            .catch(() => {});
        });
      }
      grid.appendChild(el);
    });
  }

  /* ---------- Таймлайн ---------- */
  function renderTimeline() {
    const tl = document.getElementById('aboutTimeline');
    tl.innerHTML = '';
    C.timeline.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'tl-item';
      el.innerHTML = '<div class="tl-year">' + item.year + '</div>' +
        '<div class="tl-text">' + t('tl.' + item.key) + '</div>';
      tl.appendChild(el);
    });
  }

  /* Плеер просит перерисовать подсветку строк списка */
  window.Player.onChange = function () {
    const cur = window.Player.current;
    const playing = cur && !document.getElementById('audioEl').paused;
    document.querySelectorAll('.track').forEach((el) => {
      const isCur = cur && el.dataset.id === cur.id;
      el.classList.toggle('current', !!isCur);
      el.classList.toggle('playing', !!(isCur && playing));
      if (!isCur) {
        const fill = el.querySelector('.track-line-fill');
        if (fill) fill.style.width = '0%';
      }
    });
  };

  /* ---------- Старт ---------- */
  applyLang();
})();
