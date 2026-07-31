/* Главный модуль: локализация, фильтры, рендер треков/звуков/проектов. */
(function () {
  const C = window.CONTENT;
  const I = window.I18N;

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

    renderFilters();
    renderTracks();
    renderSfx();
    renderProjects();
    renderContacts();
    renderTimeline();
    window.observeAnims();

    document.getElementById('footerCopy').textContent =
      '© ' + new Date().getFullYear() + ' · ' + t('footer.copy');
  }

  /* ---------- Фильтры ---------- */
  const state = { genre: null, mood: null, project: '' };

  function chipRow(container, labelKey, items, prefix, stateKey, moodClass) {
    container.innerHTML = '';
    const lab = document.createElement('span');
    lab.className = 'chip-label';
    lab.textContent = t(labelKey);
    container.appendChild(lab);
    items.forEach((id) => {
      const b = document.createElement('button');
      b.className = 'chip' + (moodClass ? ' chip-mood' : '');
      b.textContent = t(prefix + id);
      b.classList.toggle('active', state[stateKey] === id);
      b.setAttribute('data-cursor', 'link');
      b.addEventListener('click', () => {
        state[stateKey] = state[stateKey] === id ? null : id;
        renderFilters();
        renderTracks();
      });
      container.appendChild(b);
    });
  }

  function renderFilters() {
    chipRow(document.getElementById('genreFilters'), 'music.genreLabel', C.genres, 'genre.', 'genre', false);
    chipRow(document.getElementById('moodFilters'), 'music.moodLabel', C.moods, 'mood.', 'mood', true);

    const sel = document.getElementById('projectSelect');
    sel.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = t('music.allProjects');
    sel.appendChild(optAll);
    const withTracks = C.projects.filter((p) => C.tracks.some((tr) => tr.project === p.id));
    withTracks.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = loc(p.name);
      sel.appendChild(o);
    });
    sel.value = state.project;
    sel.onchange = () => { state.project = sel.value; renderTracks(); };

    document.getElementById('filterClear').onclick = () => {
      state.genre = null; state.mood = null; state.project = '';
      renderFilters();
      renderTracks();
    };
  }

  /* ---------- Треки ---------- */
  function filteredTracks() {
    return C.tracks.filter((tr) =>
      (!state.genre || tr.genres.includes(state.genre)) &&
      (!state.mood || tr.moods.includes(state.mood)) &&
      (!state.project || tr.project === state.project)
    );
  }

  function fmt(s) {
    if (!s) return '—';
    s = Math.round(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function renderTracks() {
    const list = document.getElementById('trackList');
    let tracks = filteredTracks();

    // если у треков проставлены годы — группируем по ним (новые сверху)
    const hasYears = tracks.some((tr) => tr.year);
    if (hasYears) {
      tracks = tracks.slice().sort((a, b) => (b.year || 0) - (a.year || 0));
    }
    window.Player.queue = tracks;
    list.innerHTML = '';

    document.getElementById('trackCount').textContent = t('music.count').replace('{n}', tracks.length);

    if (!tracks.length) {
      const empty = document.createElement('div');
      empty.className = 'tracks-empty';
      empty.textContent = t('music.empty');
      list.appendChild(empty);
      return;
    }

    let lastYear = null;
    tracks.forEach((tr, i) => {
      if (hasYears) {
        const y = tr.year ? String(tr.year) : t('music.yearOther');
        if (y !== lastYear) {
          lastYear = y;
          const div = document.createElement('div');
          div.className = 'track-year';
          div.textContent = y;
          list.appendChild(div);
        }
      }
      const proj = C.projects.find((p) => p.id === tr.project);
      const row = document.createElement('div');
      row.className = 'track';
      row.dataset.id = tr.id;
      row.style.animationDelay = Math.min(i * 0.04, 0.5) + 's';
      if (window.Player.current && window.Player.current.id === tr.id && !document.getElementById('audioEl').paused) {
        row.classList.add('playing');
      }

      const tags = [
        ...(proj ? ['<span class="track-tag tag-project">' + loc(proj.name) + '</span>'] : []),
        ...tr.genres.map((g) => '<span class="track-tag">' + t('genre.' + g) + '</span>'),
      ].join('');

      row.innerHTML =
        '<button class="track-play" aria-label="Play">▶</button>' +
        '<div class="track-meta"><div class="track-title">' + loc(tr.title) + '</div>' +
        '<div class="track-tags">' + tags + '</div></div>' +
        '<canvas class="track-wave"></canvas>' +
        '<div class="track-dur">' + fmt(window.DURS[tr.id]) + '</div>';

      row.addEventListener('click', () => window.Player.play(tr));
      list.appendChild(row);
      const wave = row.querySelector('.track-wave');
      // по волне играющего трека можно перематывать прямо из списка
      const rowSeek = (e) => {
        if (window.Player.current && window.Player.current.id === tr.id) {
          e.stopPropagation();
          if (e.type === 'pointerdown') {
            const r = wave.getBoundingClientRect();
            window.Player.seekFraction((e.clientX - r.left) / r.width);
          }
        }
      };
      wave.addEventListener('pointerdown', rowSeek);
      wave.addEventListener('click', rowSeek);
      requestAnimationFrame(() => window.Player.drawStaticWave(wave, tr.id));
    });
  }

  window.Player.onChange = () => {
    // перерисовать статичные волны, когда сменился трек
    document.querySelectorAll('.track').forEach((el) => {
      if (!window.Player.current || el.dataset.id !== window.Player.current.id) {
        const wave = el.querySelector('.track-wave');
        if (wave) window.Player.drawStaticWave(wave, el.dataset.id);
      }
    });
  };

  /* ---------- Саунд-дизайн ---------- */
  function renderSfx() {
    const wrap = document.getElementById('sfxGroups');
    wrap.innerHTML = '';
    C.sfx.forEach((group) => {
      const proj = C.projects.find((p) => p.id === group.project);
      const g = document.createElement('div');
      g.className = 'sfx-group';
      g.innerHTML = '<div class="sfx-group-title">' + (proj ? loc(proj.name) : group.project) + '</div>' +
        '<div class="sfx-group-sub">' + t('sound.groupSub') + '</div>';
      const pads = document.createElement('div');
      pads.className = 'sfx-pads';
      group.items.forEach((item) => {
        const pad = document.createElement('button');
        pad.className = 'sfx-pad';
        pad.setAttribute('data-cursor', 'link');
        pad.innerHTML = '<span class="sfx-pad-icon">' + item.icon + '</span>' +
          '<span class="sfx-pad-name">' + loc(item.name) + '</span>' +
          '<span class="sfx-pad-bar"></span>';
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
      // видео проекта или эстетичная заглушка «видео скоро»
      const media = p.media
        ? '<div class="project-media-wrap"><video class="project-media" src="' + p.media +
          '" autoplay muted loop playsinline disablepictureinpicture></video></div>'
        : (p.videoSoon
          ? '<div class="project-media-wrap project-media-soon"><span class="pm-icon">🎬</span><span>' + t('projects.videoSoon') + '</span></div>'
          : '');
      card.innerHTML = media +
        '<div class="project-head"><div class="project-name">' + loc(p.name) + '</div>' +
        '<span class="project-type">' + t('ptype.' + p.type) + '</span></div>' +
        '<div class="project-roles">' + roles + '</div>' +
        '<p class="project-desc">' + loc(p.desc) + '</p>' +
        (links ? '<div class="project-links">' + links + '</div>' : '');
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      });
      grid.appendChild(card);
    });
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
        '<span class="contact-value">' + c.value + '</span></span>';
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

  /* ---------- Старт ---------- */
  applyLang();
})();
