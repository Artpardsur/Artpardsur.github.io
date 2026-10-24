/* Главный модуль: локализация, статистика, фильтры-«окна», плейлист,
   анонс с отсчётом, статус, проекты (статусы и сортировка), код и моды,
   контакты и таймлайн. Саунд-дизайн — в sound.js. */
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
    return obj[lang] || obj.en || obj.ru || Object.values(obj)[0] || '';
  };
  // «8 звуков»: ключ.one / .few / .many / .other по правилам языка, {n} — число
  window.plural = function (n, key) {
    const form = new Intl.PluralRules(lang).select(n);
    const s = I.strings[lang] || {};
    const tpl = s[key + '.' + form] || s[key + '.other'] || t(key + '.other');
    return tpl.replace('{n}', n);
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
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });

    // анимация букв: после подстановки текста
    document.querySelectorAll('[data-anim="letters"]').forEach((el) => window.splitLetters(el));
    const nameReal = document.querySelector('.hero-name-real');
    if (nameReal) window.splitLetters(nameReal);

    window.RoleRotator.set(t('hero.roles').split('|'));

    renderStats();
    renderPicks();
    renderTracks();
    window.Sound.render();
    renderMixtapes();
    renderAnnounce();
    renderDesk();
    renderProjectTools();
    renderProjects();
    renderCode();
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
      opts.push({ value: p.id, label: loc(p.name), img: window.Art.get(p, 'pick'), count: countWith({ project: p.id }) });
    });
    if (C.tracks.some((tr) => !tr.project)) {
      opts.push({ value: '__none__', label: t('music.noProject'), count: countWith({ project: '__none__' }) });
    }
    window.Sheet.open({
      title: t('music.projectLabel'),
      anchor: pickProject,
      value: state.project,
      options: opts,
      onPick: (v) => { state.project = v; renderPicks(); renderTracks(); focusMixtape(v); },
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

  /* ---------- Кассеты с музыкой: карусель над плеером ----------
     Первая кассета — вся музыка, дальше проекты с треками (свежие ближе).
     Стрелки (и ←/→, свайп) листают, нажатие на кассету раскрывает плеер
     и включает её музыку. Кассеты прилетают, когда раздел впервые на экране. */
  const mtEl = document.getElementById('mixtapes');
  const mtStage = document.getElementById('mtStage');
  const stageWrap = document.getElementById('stageWrap');
  const audioEl = document.getElementById('audioEl');
  let mtList = [];
  let mtIndex = 0;
  let mtEntered = false;
  const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function buildMixtapes() {
    const withTracks = C.projects.filter((p) => C.tracks.some((tr) => tr.project === p.id));
    withTracks.sort((x, y) => (y.updated || '').localeCompare(x.updated || '') || (y.started || '').localeCompare(x.started || ''));
    mtList = [{ id: null, name: t('music.allTape'), kind: t('music.allKind'), count: C.tracks.length, img: null, color: window.Art.ALL_COLOR }]
      .concat(withTracks.map((p) => ({
        id: p.id, name: loc(p.name), kind: t('ptype.' + p.type),
        count: C.tracks.filter((tr) => tr.project === p.id).length, img: window.Art.get(p, 'tape'),
        color: window.Art.color(p, C.projects.indexOf(p)),
      })));
  }

  // смещение по кругу: у последней кассеты соседка справа — первая
  function mtOffset(i) {
    const n = mtList.length;
    let d = i - mtIndex;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    return d;
  }

  function mtPose(d) {
    const sp = Math.min(250, mtStage.clientWidth * 0.27);
    const a = Math.abs(d);
    if (a > 3) {
      return { tr: 'translate3d(' + Math.sign(d) * 4 * sp + 'px,0,-700px) rotateY(' + -Math.sign(d) * 60 + 'deg)', op: 0 };
    }
    return {
      tr: 'translate3d(' + d * sp + 'px,0,' + -a * 170 + 'px) rotateY(' + -d * 34 + 'deg) scale(' + (1 - a * 0.06) + ')',
      op: a === 3 ? 0.35 : 1,
    };
  }

  function layoutMixtapes() {
    mtStage.querySelectorAll('.mt-tape').forEach((el) => {
      const d = mtOffset(+el.dataset.i);
      const pose = mtPose(d);
      el.style.transform = pose.tr;
      el.style.opacity = pose.op;
      el.style.zIndex = 10 - Math.abs(d);
      el.classList.toggle('active', d === 0);
      el.tabIndex = d === 0 ? 0 : -1;
      el.setAttribute('aria-hidden', Math.abs(d) > 3 ? 'true' : 'false');
    });
    const cur = mtList[mtIndex];
    if (cur) {
      document.getElementById('mtKind').textContent = cur.kind + ' · ' + plural(cur.count, 'track.count');
      document.getElementById('mtTitle').textContent = cur.name;
    }
    syncMixtapes();
  }

  function renderMixtapes() {
    buildMixtapes();
    if (mtIndex >= mtList.length) mtIndex = 0;
    mtStage.innerHTML = '';
    mtList.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'mt-tape';
      b.dataset.i = i;
      b.setAttribute('data-cursor', 'link');
      b.setAttribute('aria-label', m.name + ' — ' + plural(m.count, 'track.count'));
      b.innerHTML = window.Tape.markup('', m.color, '', false, m.img);
      window.Tape.fill(b, m.name, plural(m.count, 'track.count'));
      // после свайпа браузер присылает ещё и клик — его пропускаем
      b.addEventListener('click', () => { if (Date.now() - swipedAt > 400) chooseMixtape(i); });
      mtStage.appendChild(b);
    });
    if (mtEntered || !motionOk) { mtEntered = true; layoutMixtapes(); return; }
    // до прилёта кассеты ждут «за кадром», в случайных поворотах
    mtStage.querySelectorAll('.mt-tape').forEach((el, i) => {
      el.style.transition = 'none';
      el.style.opacity = 0;
      const r = (k) => ((i * 7919 + k * 104729) % 1000) / 1000 - 0.5; // одинаково при каждой загрузке
      el.style.transform = 'translate3d(' + r(1) * 900 + 'px,' + (-260 + r(2) * 300) + 'px,-1900px) rotateX(' + (40 + r(3) * 60) +
        'deg) rotateY(' + r(4) * 220 + 'deg) rotateZ(' + r(5) * 90 + 'deg)';
    });
  }

  function flyInMixtapes() {
    if (mtEntered) return;
    mtEntered = true;
    const tapes = [...mtStage.querySelectorAll('.mt-tape')];
    void mtStage.offsetWidth;
    // дальние прилетают первыми, центральная — последней, с самым длинным полётом
    tapes.forEach((el) => {
      const a = Math.abs(mtOffset(+el.dataset.i));
      const delay = a > 3 ? 0 : (3 - a) * 0.16;
      el.style.transition = 'transform 1.5s cubic-bezier(0.16, 0.84, 0.3, 1) ' + delay + 's, opacity 0.9s ease ' + delay + 's';
    });
    layoutMixtapes();
    setTimeout(() => tapes.forEach((el) => { el.style.transition = ''; }), 2300);
  }

  if (motionOk) {
    new IntersectionObserver((entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) { flyInMixtapes(); obs.disconnect(); }
    }, { threshold: 0.35 }).observe(mtEl);
  }

  function stepMixtape(dir) {
    mtIndex = (mtIndex + dir + mtList.length) % mtList.length;
    layoutMixtapes();
  }

  function openPlayer() {
    if (stageWrap.classList.contains('open')) return;
    stageWrap.classList.add('open');
    if (window.Player.markDirty) window.Player.markDirty();
  }

  function chooseMixtape(i) {
    mtIndex = i;
    layoutMixtapes();
    const m = mtList[i];
    const el = mtStage.querySelector('.mt-tape[data-i="' + i + '"]');
    if (el) {
      el.classList.remove('pressed'); void el.offsetWidth; el.classList.add('pressed');
      setTimeout(() => el.classList.remove('pressed'), 550);
    }
    openPlayer();
    // эта кассета уже играет — просто показать плеер
    const cur = window.Player.current;
    const same = cur && !audioEl.paused && (m.id === null ? state.project === null : cur.project === m.id);
    if (!same) {
      state.genre = null;
      state.mood = null;
      state.project = m.id;
      renderPicks();
      renderTracks();
      const first = window.Player.queue[0];
      if (first) window.Player.play(first);
    }
    setTimeout(() => document.getElementById('stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 450);
  }

  // кассета играющего проекта крутит катушки
  function syncMixtapes() {
    const cur = window.Player.current;
    const playing = cur && !audioEl.paused;
    mtStage.querySelectorAll('.mt-tape').forEach((el) => {
      const m = mtList[+el.dataset.i];
      const on = playing && (m.id === null ? state.project === null : cur.project === m.id && state.project !== null);
      el.classList.toggle('spinning', !!on);
    });
  }

  // кассета под проект, выбранный в плеере или кнопкой на карточке
  function focusMixtape(projectId) {
    const i = mtList.findIndex((m) => m.id === projectId);
    if (i >= 0 && i !== mtIndex) { mtIndex = i; layoutMixtapes(); }
  }

  document.getElementById('mtPrev').addEventListener('click', () => stepMixtape(-1));
  document.getElementById('mtNext').addEventListener('click', () => stepMixtape(1));
  mtEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepMixtape(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepMixtape(1); }
  });
  // свайп на телефоне
  let swipeX = null, swipedAt = 0;
  mtStage.addEventListener('pointerdown', (e) => { swipeX = e.clientX; });
  mtStage.addEventListener('pointerup', (e) => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 45) { swipedAt = Date.now(); stepMixtape(dx < 0 ? 1 : -1); }
  });
  addEventListener('resize', () => { if (mtEntered) layoutMixtapes(); });

  /* ---------- Анонс: отсчёт до даты из content.js → announce ---------- */
  const announceEl = document.getElementById('announce');
  let cdTimer = null;

  function renderAnnounce() {
    const a = C.announce;
    clearTimeout(cdTimer);
    if (!a || !a.date) { announceEl.hidden = true; return; }
    announceEl.hidden = false;
    const target = new Date(a.date);
    const proj = C.projects.find((p) => p.id === a.project);
    document.getElementById('announceTitle').textContent = proj ? loc(proj.name) : '';
    const when = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(target);
    document.getElementById('announceWhen').textContent = t('announce.when').replace('{date}', when);

    const link = document.getElementById('announceLink');
    link.href = a.url || 'https://creator4444.itch.io/';

    const latestEl = document.getElementById('announceLatest');
    const L = a.latest;
    latestEl.hidden = !(L && L.title);
    if (L && L.title) {
      latestEl.innerHTML = '<span class="announce-latest-cap"></span> <a target="_blank" rel="noopener" data-cursor="link"></a>';
      latestEl.firstChild.textContent = t('announce.latest') + (L.date ? ' ' + shortDate(L.date) : '');
      const la = latestEl.querySelector('a');
      la.href = L.url || link.href;
      la.textContent = loc(L.title);
    }

    const nums = {};
    announceEl.querySelectorAll('.cd-num').forEach((el) => { nums[el.dataset.unit] = el; });
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const left = target - Date.now();
      if (left <= 0) {
        announceEl.classList.add('is-out');
        link.textContent = t('announce.done');
        ['d', 'h', 'm', 's'].forEach((u) => { nums[u].textContent = u === 'd' ? '0' : '00'; });
        return;
      }
      const v = {
        d: String(Math.floor(left / 864e5)),
        h: pad(Math.floor(left / 36e5) % 24),
        m: pad(Math.floor(left / 6e4) % 60),
        s: pad(Math.floor(left / 1e3) % 60),
      };
      Object.keys(v).forEach((u) => {
        if (nums[u].textContent === v[u]) return;
        nums[u].textContent = v[u];
        // цифра «перелистывается» при смене
        nums[u].classList.remove('flip');
        void nums[u].offsetWidth;
        nums[u].classList.add('flip');
      });
      // следующий раз — ровно на границе секунды, чтобы цифры не запаздывали
      cdTimer = setTimeout(tick, (left % 1000) || 1000);
    };
    tick();
  }

  function shortDate(iso) {
    const [y, m, d] = String(iso).split('-');
    return d && m ? d + '.' + m : (y || '');
  }

  /* ---------- Статус и обновления сайта ---------- */
  function renderDesk() {
    const nowText = loc(C.now);
    document.getElementById('winNow').hidden = !nowText;
    document.getElementById('nowText').textContent = nowText;

    const ul = document.getElementById('updatesList');
    ul.innerHTML = '';
    (C.updates || []).slice(0, 4).forEach((u) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="upd-date"></span><span class="upd-text"></span>';
      li.firstChild.textContent = shortDate(u.date);
      li.lastChild.textContent = loc(u.text);
      ul.appendChild(li);
    });
  }

  /* ---------- Проекты: статусы, фильтр и сортировка ---------- */
  // порядок кнопок-фильтров; статусы без проектов не показываются
  const STATUSES = ['wip', 'demo', 'beta', 'released', 'done', 'announce', 'quiet', 'dropped'];
  const ACTIVE = ['wip', 'demo', 'beta'];
  const view = { status: 'all', sort: 'fresh' };
  try {
    const saved = JSON.parse(localStorage.getItem('pardus-projects') || '{}');
    if (saved.sort) view.sort = saved.sort;
  } catch (e) { /* хранилище недоступно — порядок по умолчанию */ }

  function saveView() {
    try { localStorage.setItem('pardus-projects', JSON.stringify({ sort: view.sort })); } catch (e) { /* не важно */ }
  }

  function renderProjectTools() {
    const counts = {};
    C.projects.forEach((p) => { if (p.status) counts[p.status] = (counts[p.status] || 0) + 1; });
    if (view.status !== 'all' && !counts[view.status]) view.status = 'all';

    const filters = document.getElementById('projFilters');
    filters.innerHTML = '';
    [['all', C.projects.length]].concat(STATUSES.filter((s) => counts[s]).map((s) => [s, counts[s]])).forEach(([s, n]) => {
      const b = document.createElement('button');
      b.className = 'proj-chip' + (view.status === s ? ' active' : '');
      b.dataset.status = s;
      b.setAttribute('aria-pressed', view.status === s ? 'true' : 'false');
      b.setAttribute('data-cursor', 'link');
      b.innerHTML = '<i class="st-dot"></i><span></span><b>' + n + '</b>';
      b.querySelector('span').textContent = s === 'all' ? t('projects.all') : t('status.' + s);
      b.addEventListener('click', () => { view.status = s; renderProjectTools(); renderProjects(true); });
      filters.appendChild(b);
    });

    const sort = document.getElementById('projSort');
    sort.innerHTML = '<span class="proj-sort-cap"></span>';
    sort.firstChild.textContent = t('projects.sort');
    ['fresh', 'old', 'added'].forEach((k) => {
      const b = document.createElement('button');
      b.className = 'proj-sort-btn' + (view.sort === k ? ' active' : '');
      b.setAttribute('aria-pressed', view.sort === k ? 'true' : 'false');
      b.setAttribute('data-cursor', 'link');
      b.textContent = t('projects.sort.' + k);
      b.addEventListener('click', () => { view.sort = k; saveView(); renderProjectTools(); renderProjects(true); });
      sort.appendChild(b);
    });
  }

  // «2024 → сейчас», «2024 – 2025», «2026»; без дат — пусто
  function projectPeriod(p) {
    const a = (p.started || '').slice(0, 4);
    const b = (p.updated || '').slice(0, 4);
    if (ACTIVE.includes(p.status)) return (a || b) ? (a || b) + ' → ' + t('projects.now') : '';
    if (a && b && a !== b) return a + ' – ' + b;
    return a || b;
  }

  function sortedProjects() {
    const list = C.projects.filter((p) => view.status === 'all' || p.status === view.status);
    // без даты — в конец списка
    const key = (p, f) => p[f] || (view.sort === 'old' ? '9999' : '0000');
    if (view.sort === 'fresh') {
      list.sort((x, y) => key(y, 'updated').localeCompare(key(x, 'updated')) || key(y, 'started').localeCompare(key(x, 'started')));
    } else if (view.sort === 'old') {
      list.sort((x, y) => key(x, 'started').localeCompare(key(y, 'started')) || key(x, 'updated').localeCompare(key(y, 'updated')));
    }
    return list;
  }

  function renderProjects(animate) {
    const grid = document.getElementById('projectsGrid');
    grid.innerHTML = '';
    const list = sortedProjects();
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'tracks-empty';
      empty.textContent = t('projects.empty');
      grid.appendChild(empty);
      return;
    }
    list.forEach((p, i) => {
      const card = document.createElement('article');
      card.className = 'project-card' + (animate ? ' card-in' : '');
      card.style.animationDelay = Math.min(i * 0.04, 0.5) + 's';
      const roles = p.roles.map((r) => '<span class="project-role">' + t('role.' + r) + '</span>').join('');
      const links = (p.links || []).map((l) =>
        '<a class="project-link" href="' + l.url + '" target="_blank" rel="noopener" data-cursor="link">' + l.label + '</a>'
      ).join('');
      // медиа проекта: видео, картинка (для нестандартных пропорций —
      // с размытым фоном из неё же) или типографская обложка
      // картинку, кадр и масштаб можно поменять во вкладке «Картинки» редактора
      let media = '';
      const art = window.Art.get(p, 'card');
      if (art && window.Art.isVideo(art.src)) {
        media = '<div class="project-media-wrap"><video class="project-media" src="' + art.src +
          '" style="' + window.Art.style(art) + '" autoplay muted loop playsinline disablepictureinpicture></video></div>';
      } else if (art) {
        media = '<div class="project-media-wrap">' +
          (p.mediaContain ? '<div class="pm-blur" style="background-image:url(\'' + art.src + '\')"></div>' : '') +
          '<img class="project-media' + (p.mediaContain ? ' pm-contain' : '') + '" src="' + art.src + '" style="' + window.Art.style(art) +
          '" alt="" loading="lazy" width="640" height="360">' +
          '</div>';
      } else if (p.videoSoon) {
        media = '<div class="project-media-wrap project-media-soon"><span class="pm-icon">🎬</span><span>' + t('projects.videoSoon') + '</span></div>';
      } else {
        media = '<div class="project-media-wrap pm-typo"><span class="pm-typo-type"></span><span class="pm-typo-name"></span><span class="pm-typo-note">♪</span></div>';
      }
      const badge = p.status
        ? '<span class="project-status st-' + p.status + '"><i class="st-dot"></i>' + t('status.' + p.status) + '</span>' : '';
      const period = projectPeriod(p);
      const nTracks = C.tracks.filter((tr) => tr.project === p.id).length;
      card.innerHTML = '<div class="project-media-box">' + media + badge + '</div>' +
        '<div class="project-head"><div class="project-name"></div>' +
        '<span class="project-type">' + t('ptype.' + p.type) + '</span></div>' +
        (period ? '<div class="project-period">' + period + '</div>' : '') +
        '<div class="project-roles">' + roles + '</div>' +
        '<p class="project-desc"></p>' +
        (nTracks ? '<button class="project-listen" data-cursor="link">' +
          '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
          '<span>' + t('projects.listen') + '</span>' +
          '<b>' + nTracks + '</b></button>' : '') +
        (links ? '<div class="project-links">' + links + '</div>' : '');
      card.querySelector('.project-name').textContent = loc(p.name);
      card.querySelector('.project-desc').textContent = loc(p.desc);
      const typo = card.querySelector('.pm-typo');
      if (typo) {
        typo.querySelector('.pm-typo-type').textContent = t('ptype.' + p.type);
        typo.querySelector('.pm-typo-name').textContent = loc(p.name);
      }

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

  /* ---------- Код и моды ---------- */
  function renderCode() {
    const code = C.code || {};
    const feat = document.getElementById('codeFeatured');
    feat.innerHTML = '';
    (code.featured || []).forEach((id) => {
      const p = C.projects.find((x) => x.id === id);
      if (!p) return;
      const card = document.createElement('article');
      card.className = 'feature framed';
      const fArt = window.Art.get(p, 'feature');
      card.setAttribute('data-anim', 'fade');
      const links = (p.links || []).map((l) =>
        '<a class="btn btn-primary" href="' + l.url + '" target="_blank" rel="noopener" data-cursor="link">' + l.label + ' ↗</a>').join('');
      card.innerHTML =
        (fArt ? '<div class="feature-media"><img src="' + fArt.src + '" style="' + window.Art.style(fArt) + '" alt="" loading="lazy" width="1280" height="720"></div>' : '') +
        '<div class="feature-body">' +
        (p.status ? '<span class="project-status st-' + p.status + '"><i class="st-dot"></i>' + t('status.' + p.status) + '</span>' : '') +
        '<h3 class="feature-name"></h3>' +
        '<div class="project-roles">' + p.roles.map((r) => '<span class="project-role">' + t('role.' + r) + '</span>').join('') + '</div>' +
        '<p class="feature-desc"></p>' +
        (links ? '<div class="feature-links">' + links + '</div>' : '') +
        '</div>';
      card.querySelector('.feature-name').textContent = loc(p.name);
      card.querySelector('.feature-desc').textContent = loc(p.desc);
      const img = card.querySelector('img');
      if (img) img.alt = loc(p.name);
      feat.appendChild(card);
    });

    const grid = document.getElementById('modsGrid');
    grid.innerHTML = '';
    (code.mods || []).forEach((m) => {
      const card = document.createElement('article');
      card.className = 'win mod-card';
      card.setAttribute('data-anim', 'fade');
      const links = (m.links || []).map((l) =>
        '<a class="project-link" href="' + l.url + '" target="_blank" rel="noopener" data-cursor="link">' + l.label + '</a>').join('');
      card.innerHTML = '<div class="win-bar"><i></i><i></i><span></span></div>' +
        '<div class="win-body">' +
        (m.status ? '<span class="project-status st-' + m.status + '"><i class="st-dot"></i>' + t('status.' + m.status) + '</span>' : '') +
        '<h4 class="mod-name"></h4><p class="mod-desc"></p>' +
        (links ? '<div class="project-links">' + links + '</div>' : '') + '</div>';
      card.querySelector('.win-bar span').textContent = m.id + '.mod';
      card.querySelector('.mod-name').textContent = loc(m.name);
      const desc = loc(m.desc);
      const d = card.querySelector('.mod-desc');
      d.textContent = desc || t('code.modSoon');
      d.classList.toggle('is-soon', !desc);
      grid.appendChild(card);
    });
  }

  /* Кнопка на карточке проекта: перейти к плееру с плейлистом этого проекта */
  function openProjectPlaylist(projectId) {
    openPlayer();
    focusMixtape(projectId);
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
    syncMixtapes();
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
