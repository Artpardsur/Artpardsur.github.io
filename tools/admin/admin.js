/* Локальный редактор сайта: правит data/content.js и data/peaks.js.
   Данные читаются прямо из файлов сайта (window.CONTENT), сохраняются
   через маленький API из tools/admin.py. */
(function () {
  const LANGS = ['ru', 'en', 'es', 'de', 'fr', 'it', 'pt', 'zh', 'ja'];
  const TYPES = ['vn', 'game', 'series', 'release', 'remaster', 'freelance', 'study', 'own'];
  const ROLES = ['composer', 'sound', 'dev'];
  const DIR_LABEL = { media: 'media/', music: 'audio/music/', sfx: 'audio/sfx/' };

  let C = null;                 // рабочая копия CONTENT
  let PEAKS = {}, DURS = {};    // формы волн (правим здесь же)
  let dirty = false, peaksDirty = false;
  let tab = 'projects';
  let sel = { projects: 0, tracks: 0, sfx: '0:0' };
  let filter = '';
  const FILES = { media: [], music: [], sfx: [] };
  let gitOut = '';

  /* ---------------- мелкие помощники ---------------- */

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const k in (props || {})) {
      const v = props[k];
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    kids.flat().forEach((k) => { if (k != null) el.append(k); });
    return el;
  }

  const $ = (id) => document.getElementById(id);

  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 6000 : 2800);
  }

  function ru(key) {
    const s = window.I18N && window.I18N.strings.ru;
    return (s && s[key]) || key;
  }

  function setState() {
    const el = $('state');
    el.textContent = dirty ? 'есть несохранённые правки' : 'всё сохранено';
    el.className = 'state ' + (dirty ? 'dirty' : 'saved');
  }
  function markDirty() { dirty = true; setState(); }

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function api(url, body) {
    const r = await fetch(url, body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : undefined);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || data.out || 'ошибка сервера');
    return data;
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('не загрузился ' + src));
      document.head.appendChild(s);
    });
  }

  /* ---------------- поля формы ---------------- */

  function row(label, ...content) {
    return h('div', { class: 'row' }, h('div', { class: 'row-label', text: label }), ...content);
  }

  function textInput(value, onInput, opts) {
    const inp = h('input', Object.assign({ type: 'text', value: value == null ? '' : value }, opts || {}));
    inp.addEventListener('input', () => { onInput(inp.value); markDirty(); });
    inp.addEventListener('change', renderSide);
    return inp;
  }

  /* Поле с языковыми вкладками: {ru:'…', en:'…'} */
  function multilang(obj, multiline) {
    let cur = 'ru';
    const tabs = h('div', { class: 'langtabs' });
    const input = multiline ? h('textarea') : h('input', { type: 'text' });

    function paint() {
      tabs.querySelectorAll('.langtab').forEach((b) => {
        b.classList.toggle('active', b.dataset.lang === cur);
        b.classList.toggle('filled', !!(obj[b.dataset.lang] || '').trim());
      });
      input.value = obj[cur] || '';
    }
    LANGS.forEach((code) => {
      tabs.append(h('button', {
        class: 'langtab', 'data-lang': code, text: code.toUpperCase(),
        onclick: () => { cur = code; paint(); input.focus(); },
      }));
    });
    input.addEventListener('input', () => {
      obj[cur] = input.value;
      markDirty();
      tabs.querySelector('.langtab[data-lang="' + cur + '"]').classList.toggle('filled', !!input.value.trim());
    });
    input.addEventListener('change', renderSide);
    paint();
    return h('div', {}, tabs, input);
  }

  function checks(all, values, labelFn, onChange) {
    const wrap = h('div', { class: 'checks' });
    all.forEach((v) => {
      const on = values.includes(v);
      const b = h('label', { class: 'check' + (on ? ' on' : '') }, labelFn(v));
      b.addEventListener('click', () => {
        const i = values.indexOf(v);
        if (i >= 0) values.splice(i, 1); else values.push(v);
        b.classList.toggle('on');
        markDirty();
      });
      wrap.append(b);
    });
    return wrap;
  }

  function selectBox(options, value, onChange) {
    const s = h('select');
    options.forEach((o) => {
      const opt = h('option', { value: o.value == null ? '' : o.value, text: o.label });
      if ((o.value == null ? '' : String(o.value)) === (value == null ? '' : String(value))) opt.selected = true;
      s.append(opt);
    });
    s.addEventListener('change', () => { onChange(s.value === '' ? null : s.value); markDirty(); renderSide(); });
    return s;
  }

  /* Выбор файла: из папки или загрузка нового */
  function fileField(dirKey, value, onPick, extra) {
    const preview = h('div', { class: 'preview' });
    function paintPreview() {
      preview.innerHTML = '';
      if (!value) { preview.textContent = 'нет файла'; return; }
      const url = '/' + value;
      if (dirKey === 'media') {
        preview.append(/\.(mp4|webm)$/i.test(value)
          ? h('video', { src: url, muted: true, loop: true, autoplay: true, playsinline: true })
          : h('img', { src: url, alt: '' }));
      } else {
        preview.textContent = '♪';
      }
    }
    paintPreview();

    const list = selectBox(
      [{ value: '', label: '— не выбран —' }].concat(FILES[dirKey].map((f) => ({ value: f, label: f.split('/').pop() }))),
      value,
      (v) => { value = v; onPick(v); paintPreview(); refreshAudio(); }
    );

    const fileInput = h('input', { type: 'file', style: 'display:none', accept: dirKey === 'media' ? 'image/*,video/mp4' : 'audio/*' });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      try {
        toast('Загружаю ' + f.name + '…');
        const data = await new Promise((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(rd.result);
          rd.onerror = rej;
          rd.readAsDataURL(f);
        });
        const r = await api('/api/upload', { dir: dirKey, name: f.name, data: data });
        if (!FILES[dirKey].includes(r.path)) FILES[dirKey].push(r.path);
        FILES[dirKey].sort();
        value = r.path;
        onPick(r.path);
        toast('Файл сохранён: ' + r.path);
        render();
      } catch (e) {
        toast(String(e.message || e), true);
      }
      fileInput.value = '';
    });

    const audioEl = dirKey === 'media' ? null : h('audio', { controls: true, src: value ? '/' + value : '' });
    function refreshAudio() { if (audioEl) audioEl.src = value ? '/' + value : ''; }

    const controls = h('div', { class: 'controls' },
      list,
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        h('button', { class: 'btn small', text: 'Загрузить файл…', onclick: () => fileInput.click() }),
        fileInput,
        extra || null),
      audioEl,
      h('div', { class: 'hint', text: 'Папка: ' + DIR_LABEL[dirKey] }));

    return h('div', { class: 'filefield' }, preview, controls);
  }

  /* ---------------- формы волн (считает браузер) ---------------- */

  async function computePeaks(path) {
    const buf = await (await fetch('/' + path)).arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const N = 110;
    const bucket = Math.max(1, Math.floor(ch.length / N));
    const peaks = [];
    for (let i = 0; i < N; i++) {
      let mx = 0;
      const s = i * bucket, e = Math.min(ch.length, s + bucket);
      for (let j = s; j < e; j++) { const v = Math.abs(ch[j]); if (v > mx) mx = v; }
      peaks.push(mx);
    }
    const mx = Math.max.apply(null, peaks) || 1;
    ctx.close();
    return {
      peaks: peaks.map((p) => Math.round(p / mx * 1000) / 1000),
      dur: Math.round(audio.duration * 10) / 10,
    };
  }

  async function recalcWave(id, file) {
    if (!file) { toast('Сначала выбери файл', true); return; }
    try {
      toast('Считаю форму волны…');
      const r = await computePeaks(file);
      PEAKS[id] = r.peaks;
      DURS[id] = r.dur;
      peaksDirty = true;
      markDirty();
      toast('Готово: ' + r.dur + ' с');
      render();
    } catch (e) {
      toast('Не получилось разобрать аудио: ' + (e.message || e), true);
    }
  }

  function renameWave(oldId, newId) {
    if (oldId === newId) return;
    if (PEAKS[oldId]) { PEAKS[newId] = PEAKS[oldId]; delete PEAKS[oldId]; peaksDirty = true; }
    if (DURS[oldId] != null) { DURS[newId] = DURS[oldId]; delete DURS[oldId]; peaksDirty = true; }
  }

  /* ---------------- боковой список ---------------- */

  function renderSide() {
    const side = $('side');
    side.innerHTML = '';
    if (tab === 'git') return;

    const search = h('input', { class: 'search', type: 'text', placeholder: 'Поиск…', value: filter });
    search.addEventListener('input', () => { filter = search.value; renderSide(); });
    const addBtn = h('button', { class: 'btn small primary', text: '+ Добавить', onclick: addItem });
    side.append(h('div', { class: 'side-tools' }, search, addBtn));

    const q = filter.trim().toLowerCase();
    const hit = (s) => !q || String(s || '').toLowerCase().includes(q);

    if (tab === 'projects') {
      C.projects.forEach((p, i) => {
        if (!hit(p.name && p.name.ru) && !hit(p.id)) return;
        const cover = coverOf(p);
        side.append(h('button', {
          class: 'item' + (sel.projects === i ? ' active' : ''),
          onclick: () => { sel.projects = i; render(); },
        },
          cover ? h('img', { class: 'item-thumb', src: '/' + cover, alt: '' })
            : h('div', { class: 'item-thumb', text: '▦' }),
          h('div', { class: 'item-main' },
            h('div', { class: 'item-name', text: (p.name && p.name.ru) || p.id }),
            h('div', { class: 'item-sub', text: ru('ptype.' + p.type) + ' · ' + p.id }))));
      });
    }

    if (tab === 'tracks') {
      C.tracks.forEach((t, i) => {
        if (!hit(t.title && t.title.ru) && !hit(t.id)) return;
        const proj = C.projects.find((p) => p.id === t.project);
        side.append(h('button', {
          class: 'item' + (sel.tracks === i ? ' active' : ''),
          onclick: () => { sel.tracks = i; render(); },
        },
          h('div', { class: 'item-thumb', text: '♪' }),
          h('div', { class: 'item-main' },
            h('div', { class: 'item-name', text: (t.title && t.title.ru) || t.id }),
            h('div', { class: 'item-sub', text: proj ? proj.name.ru : 'без проекта' }))));
      });
    }

    if (tab === 'sfx') {
      C.sfx.forEach((g, gi) => {
        const proj = C.projects.find((p) => p.id === g.project);
        side.append(h('div', { class: 'group-head' },
          h('span', { text: proj ? proj.name.ru : g.project }),
          h('button', {
            class: 'btn small', text: '+ звук',
            onclick: () => {
              g.items.push({ id: 'new-sfx-' + (g.items.length + 1), file: '', icon: '🔊', name: { ru: 'Новый звук', en: 'New sound' } });
              sel.sfx = gi + ':' + (g.items.length - 1);
              markDirty(); render();
            },
          })));
        g.items.forEach((it, ii) => {
          if (!hit(it.name && it.name.ru) && !hit(it.id)) return;
          side.append(h('button', {
            class: 'item' + (sel.sfx === gi + ':' + ii ? ' active' : ''),
            onclick: () => { sel.sfx = gi + ':' + ii; render(); },
          },
            h('div', { class: 'item-thumb', text: it.icon || '🔊' }),
            h('div', { class: 'item-main' },
              h('div', { class: 'item-name', text: (it.name && it.name.ru) || it.id }),
              h('div', { class: 'item-sub', text: it.file.split('/').pop() }))));
        });
      });
    }
  }

  function coverOf(p) {
    if (p.cover) return p.cover;
    if (p.media && !/\.(mp4|webm|mov)$/i.test(p.media)) return p.media;
    return null;
  }

  /* ---------------- добавление и удаление ---------------- */

  function addItem() {
    if (tab === 'projects') {
      C.projects.push({
        id: 'new-project-' + (C.projects.length + 1),
        name: { ru: 'Новый проект', en: 'New project' },
        type: 'game', roles: ['composer'], desc: { ru: '', en: '' }, links: [],
      });
      sel.projects = C.projects.length - 1;
    } else if (tab === 'tracks') {
      C.tracks.push({
        id: 'new-track-' + (C.tracks.length + 1), project: null, file: '',
        title: { ru: 'Новая композиция', en: 'New track' }, genres: [], moods: [],
      });
      sel.tracks = C.tracks.length - 1;
    } else if (tab === 'sfx') {
      C.sfx.push({ project: (C.projects[0] || {}).id || '', items: [] });
      sel.sfx = (C.sfx.length - 1) + ':0';
    }
    markDirty();
    render();
  }

  function move(arr, i, d) {
    const j = i + d;
    if (j < 0 || j >= arr.length) return i;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    markDirty();
    return j;
  }

  /* ---------------- формы ---------------- */

  function renderEdit() {
    const edit = $('edit');
    edit.innerHTML = '';
    if (tab === 'git') return renderGit(edit);
    if (tab === 'stats') return renderNumbers(edit);
    if (tab === 'projects') return renderProject(edit);
    if (tab === 'tracks') return renderTrack(edit);
    if (tab === 'sfx') return renderSfx(edit);
  }

  function renderProject(edit) {
    const i = Math.min(sel.projects, C.projects.length - 1);
    const p = C.projects[i];
    if (!p) { edit.append(h('p', { class: 'sub', text: 'Проектов пока нет — нажми «Добавить».' })); return; }

    edit.append(h('h2', { text: (p.name && p.name.ru) || p.id }));
    edit.append(h('div', { class: 'sub', text: 'Проект №' + (i + 1) + ' из ' + C.projects.length + '. Порядок здесь = порядок на сайте.' }));

    edit.append(row('Идентификатор (латиницей, без пробелов)',
      textInput(p.id, (v) => {
        const old = p.id;
        const nv = slug(v) || v;
        C.tracks.forEach((t) => { if (t.project === old) t.project = nv; });
        C.sfx.forEach((g) => { if (g.project === old) g.project = nv; });
        p.id = nv;
      }),
      h('div', { class: 'hint', text: 'Используется в ссылках на треки и звуки — при изменении обновится везде.' })));

    edit.append(row('Название (по языкам)', multilang(p.name = p.name || {}, false)));

    edit.append(row('Тип', selectBox(TYPES.map((t) => ({ value: t, label: ru('ptype.' + t) })), p.type, (v) => { p.type = v; })));

    edit.append(row('Моя роль', checks(ROLES, p.roles = p.roles || [], (r) => ru('role.' + r), null)));

    edit.append(row('Картинка или видео проекта',
      fileField('media', p.media || '', (v) => { p.media = v || ''; markDirty(); }),
      h('label', { class: 'check' + (p.mediaContain ? ' on' : ''), style: 'margin-top:10px', onclick: function () { p.mediaContain = !p.mediaContain; this.classList.toggle('on'); markDirty(); } },
        'Показывать целиком (для нестандартных пропорций)')));

    edit.append(row('Обложка для плеера (необязательно)',
      fileField('media', p.cover || '', (v) => { p.cover = v || ''; markDirty(); }),
      h('div', { class: 'hint', text: 'Нужна, если основное медиа — видео. Иначе плеер возьмёт картинку выше.' })));

    edit.append(row('Описание (по языкам)', multilang(p.desc = p.desc || {}, true)));

    const linksWrap = h('div');
    p.links = p.links || [];
    function paintLinks() {
      linksWrap.innerHTML = '';
      p.links.forEach((l, li) => {
        linksWrap.append(h('div', { class: 'links-row' },
          textInput(l.label, (v) => { l.label = v; }, { placeholder: 'Название' }),
          textInput(l.url, (v) => { l.url = v; }, { placeholder: 'https://…' }),
          h('button', { class: 'btn small danger', text: '✕', onclick: () => { p.links.splice(li, 1); markDirty(); paintLinks(); } })));
      });
      linksWrap.append(h('button', {
        class: 'btn small', text: '+ ссылка',
        onclick: () => { p.links.push({ label: '', url: '' }); markDirty(); paintLinks(); },
      }));
    }
    paintLinks();
    edit.append(row('Ссылки', linksWrap));

    const nTracks = C.tracks.filter((t) => t.project === p.id).length;
    edit.append(h('div', { class: 'formbar' },
      h('button', { class: 'btn small', text: '↑ выше', onclick: () => { sel.projects = move(C.projects, i, -1); render(); } }),
      h('button', { class: 'btn small', text: '↓ ниже', onclick: () => { sel.projects = move(C.projects, i, 1); render(); } }),
      h('span', { class: 'badge', text: 'треков в проекте: ' + nTracks }),
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn small danger', text: 'Удалить проект',
        onclick: () => {
          if (!confirm('Удалить проект «' + (p.name.ru || p.id) + '»? Треки останутся, но потеряют привязку.')) return;
          C.tracks.forEach((t) => { if (t.project === p.id) t.project = null; });
          C.projects.splice(i, 1);
          sel.projects = Math.max(0, i - 1);
          markDirty(); render();
        },
      })));
  }

  function renderTrack(edit) {
    const i = Math.min(sel.tracks, C.tracks.length - 1);
    const t = C.tracks[i];
    if (!t) { edit.append(h('p', { class: 'sub', text: 'Композиций пока нет — нажми «Добавить».' })); return; }

    edit.append(h('h2', { text: (t.title && t.title.ru) || t.id }));
    const hasWave = !!(PEAKS[t.id] && PEAKS[t.id].length);
    edit.append(h('div', { class: 'sub' },
      'Композиция №' + (i + 1) + ' из ' + C.tracks.length + '. ',
      h('span', { class: 'badge ' + (hasWave ? 'ok' : 'warn'), text: hasWave ? 'форма волны есть · ' + (DURS[t.id] || '?') + ' с' : 'форма волны не посчитана' })));

    edit.append(row('Идентификатор',
      textInput(t.id, (v) => { const nv = slug(v) || v; renameWave(t.id, nv); t.id = nv; })));

    edit.append(row('Название (по языкам)', multilang(t.title = t.title || {}, false)));

    edit.append(row('Проект', selectBox(
      [{ value: '', label: '— без проекта —' }].concat(C.projects.map((p) => ({ value: p.id, label: p.name.ru || p.id }))),
      t.project || '', (v) => { t.project = v; })));

    edit.append(row('Аудиофайл', fileField('music', t.file || '', (v) => {
      t.file = v || '';
      markDirty();
      if (v) {
        if (/^new-track/.test(t.id)) { const nid = slug(v.split('/').pop().replace(/\.[^.]+$/, '')); renameWave(t.id, nid); t.id = nid; }
        recalcWave(t.id, v);
      }
    }, h('button', { class: 'btn small', text: 'Пересчитать волну', onclick: () => recalcWave(t.id, t.file) }))));

    edit.append(row('Жанры', checks(C.genres, t.genres = t.genres || [], (g) => ru('genre.' + g), null)));
    edit.append(row('Настроения', checks(C.moods, t.moods = t.moods || [], (m) => ru('mood.' + m), null)));

    edit.append(h('div', { class: 'formbar' },
      h('button', { class: 'btn small', text: '↑ выше', onclick: () => { sel.tracks = move(C.tracks, i, -1); render(); } }),
      h('button', { class: 'btn small', text: '↓ ниже', onclick: () => { sel.tracks = move(C.tracks, i, 1); render(); } }),
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn small danger', text: 'Удалить композицию',
        onclick: () => {
          if (!confirm('Удалить «' + (t.title.ru || t.id) + '» из списка? Сам mp3-файл останется на диске.')) return;
          C.tracks.splice(i, 1);
          sel.tracks = Math.max(0, i - 1);
          markDirty(); render();
        },
      })));
  }

  function renderSfx(edit) {
    const [gi, ii] = sel.sfx.split(':').map(Number);
    const g = C.sfx[Math.min(gi, C.sfx.length - 1)];
    if (!g) { edit.append(h('p', { class: 'sub', text: 'Групп звуков пока нет — нажми «Добавить».' })); return; }

    edit.append(h('h2', { text: 'Звуки проекта' }));
    edit.append(row('Проект группы', selectBox(
      C.projects.map((p) => ({ value: p.id, label: p.name.ru || p.id })), g.project, (v) => { g.project = v; })));
    edit.append(h('div', { class: 'formbar', style: 'margin-top:0' },
      h('button', { class: 'btn small', text: '↑ группа выше', onclick: () => { const nj = move(C.sfx, gi, -1); sel.sfx = nj + ':0'; render(); } }),
      h('button', { class: 'btn small', text: '↓ группа ниже', onclick: () => { const nj = move(C.sfx, gi, 1); sel.sfx = nj + ':0'; render(); } }),
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn small danger', text: 'Удалить группу',
        onclick: () => {
          if (!confirm('Удалить всю группу звуков?')) return;
          C.sfx.splice(gi, 1);
          sel.sfx = '0:0';
          markDirty(); render();
        },
      })));

    const it = g.items[ii];
    if (!it) { edit.append(h('div', { class: 'sub', text: 'Выбери звук слева или добавь новый кнопкой «+ звук».' })); return; }

    edit.append(h('h2', { text: (it.name && it.name.ru) || it.id, style: 'margin-top:26px' }));
    edit.append(row('Идентификатор', textInput(it.id, (v) => { const nv = slug(v) || v; renameWave(it.id, nv); it.id = nv; })));
    edit.append(row('Значок (эмодзи)', textInput(it.icon, (v) => { it.icon = v; }, { style: 'max-width:120px;font-size:20px' })));
    edit.append(row('Название (по языкам)', multilang(it.name = it.name || {}, false)));
    edit.append(row('Аудиофайл', fileField('sfx', it.file || '', (v) => {
      it.file = v || '';
      markDirty();
      if (v && /^new-sfx/.test(it.id)) { const nid = slug(v.split('/').pop().replace(/\.[^.]+$/, '')); renameWave(it.id, nid); it.id = nid; }
      if (v) recalcWave(it.id, v);
    })));

    edit.append(h('div', { class: 'formbar' },
      h('button', { class: 'btn small', text: '↑ выше', onclick: () => { const nj = move(g.items, ii, -1); sel.sfx = gi + ':' + nj; render(); } }),
      h('button', { class: 'btn small', text: '↓ ниже', onclick: () => { const nj = move(g.items, ii, 1); sel.sfx = gi + ':' + nj; render(); } }),
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn small danger', text: 'Удалить звук',
        onclick: () => {
          if (!confirm('Удалить звук «' + (it.name.ru || it.id) + '»?')) return;
          g.items.splice(ii, 1);
          sel.sfx = gi + ':' + Math.max(0, ii - 1);
          markDirty(); render();
        },
      })));
  }

  /* ---------------- вкладка «Статистика» ---------------- */

  function renderNumbers(edit) {
    C.stats = C.stats || { projects: 0, tracks: 0, sounds: 0 };
    const auto = {
      projects: C.projects.length,
      tracks: C.tracks.length,
      sounds: C.sfx.reduce((n, g) => n + g.items.length, 0),
    };
    edit.append(h('h2', { text: 'Цифры перед плеером' }));
    edit.append(h('div', { class: 'sub' },
      'Их видно на сайте в блоке статистики. Поставь 0 — и цифра посчитается ',
      'по спискам сайта; поставь своё число — покажется оно. ',
      'Звуков и композиций сделано больше, чем выложено, поэтому числа заданы вручную.'));

    [['projects', 'Проектов'], ['tracks', 'Композиций'], ['sounds', 'Звуков']].forEach(([k, label]) => {
      const inp = h('input', { type: 'number', min: '0', step: '1', value: C.stats[k] || 0, style: 'max-width:200px' });
      inp.addEventListener('input', () => { C.stats[k] = parseInt(inp.value, 10) || 0; markDirty(); });
      edit.append(row(label, inp,
        h('div', { class: 'hint', text: 'Выложено на сайте: ' + auto[k] + ' — столько покажется, если оставить 0' })));
    });
  }

  /* ---------------- вкладка «Публикация» ---------------- */

  async function renderGit(edit) {
    const left = h('div', { class: 'card' }, h('h3', { text: 'Что изменилось' }), h('div', { text: 'Читаю git…' }));
    const msgInput = h('input', { type: 'text', value: 'Обновление контента', placeholder: 'Описание изменений' });
    const out = h('pre', { class: 'out', text: gitOut || 'Здесь появится ответ git.' });

    const btnCommit = h('button', {
      class: 'btn', text: 'Сохранить и закоммитить',
      onclick: async () => {
        try {
          if (dirty) await save();
          const r = await api('/api/git/commit', { message: msgInput.value });
          gitOut = r.out || '';
          out.textContent = gitOut;
          toast('Коммит готов');
          render();
        } catch (e) { out.textContent = String(e.message || e); toast('git не смог сделать коммит', true); }
      },
    });
    const btnPush = h('button', {
      class: 'btn primary', text: 'Отправить на сайт (push)',
      onclick: async () => {
        try {
          const r = await api('/api/git/push');
          gitOut = r.out || '';
          out.textContent = gitOut + '\nГотово. Сайт обновится через 1–2 минуты.';
          toast('Отправлено');
        } catch (e) { out.textContent = String(e.message || e); toast('push не прошёл — сделай его в VS Code', true); }
      },
    });

    const right = h('div', { class: 'card' },
      h('h3', { text: 'Опубликовать' }),
      h('div', { class: 'row' }, h('div', { class: 'row-label', text: 'Описание изменений' }), msgInput),
      h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, btnCommit, btnPush),
      h('div', { class: 'hint', text: 'Коммит и push можно сделать и вручную в VS Code — это одно и то же.' }),
      h('h3', { text: 'Порядок', style: 'margin-top:18px' }),
      h('ol', { class: 'steps' },
        h('li', { text: 'Правишь тексты, картинки и теги на вкладках слева.' }),
        h('li', { text: 'Жмёшь «Сохранить» — правки уходят в data/content.js и data/peaks.js.' }),
        h('li', { text: 'Проверяешь результат кнопкой «Открыть сайт».' }),
        h('li', { text: 'Коммит и push — сайт обновляется через 1–2 минуты.' })),
      h('h3', { text: 'Ответ git', style: 'margin-top:18px' }),
      out);

    edit.append(h('h2', { text: 'Публикация' }));
    edit.append(h('div', { class: 'sub', text: 'Сохранённые правки лежат в файлах проекта. На сайт они попадут после отправки в GitHub.' }));
    edit.append(h('div', { class: 'git-cols' }, left, right));

    try {
      const st = await api('/api/git');
      left.innerHTML = '';
      left.append(h('h3', { text: 'Что изменилось' }));
      left.append(h('div', { class: 'hint', text: 'Ветка: ' + (st.branch || '?') + ' · ' + (st.remote || 'без remote') }));
      if (!st.changes.length) {
        left.append(h('p', { style: 'margin-top:10px', text: 'Изменений нет — всё уже опубликовано.' }));
      } else {
        left.append(h('pre', { class: 'out', style: 'margin-top:10px', text: st.changes.join('\n') }));
      }
    } catch (e) {
      left.innerHTML = '';
      left.append(h('h3', { text: 'Что изменилось' }), h('p', { text: String(e.message || e) }));
    }
  }

  /* ---------------- сохранение ---------------- */

  function validate() {
    const problems = [];
    const seen = {};
    C.tracks.concat(C.sfx.reduce((a, g) => a.concat(g.items), [])).forEach((x) => {
      if (seen[x.id]) problems.push('повторяется идентификатор: ' + x.id);
      seen[x.id] = 1;
      if (!x.file) problems.push('нет файла у «' + ((x.title || x.name || {}).ru || x.id) + '»');
    });
    const pid = {};
    C.projects.forEach((p) => {
      if (pid[p.id]) problems.push('повторяется идентификатор проекта: ' + p.id);
      pid[p.id] = 1;
    });
    return problems;
  }

  async function save() {
    const problems = validate();
    const fatal = problems.filter((p) => p.startsWith('повторяется'));
    if (fatal.length) { toast('Не сохранено: ' + fatal[0], true); throw new Error(fatal[0]); }
    await api('/api/content', { content: C });
    if (peaksDirty) {
      await api('/api/peaks', { peaks: PEAKS, durs: DURS });
      peaksDirty = false;
    }
    dirty = false;
    setState();
    toast(problems.length ? 'Сохранено. Обрати внимание: ' + problems[0] : 'Сохранено в data/content.js');
  }

  /* ---------------- запуск ---------------- */

  function render() {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelector('.wrap').classList.toggle('wide', tab === 'git' || tab === 'stats');
    renderSide();
    renderEdit();
    setState();
  }

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    tab = b.dataset.tab;
    filter = '';
    render();
  });
  $('saveBtn').addEventListener('click', () => { save().catch(() => {}); });

  addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save().catch(() => {}); }
  });

  (async function boot() {
    try {
      const v = '?t=' + Date.now();
      await loadScript('/data/i18n.js' + v);
      await loadScript('/data/content.js' + v);
      await loadScript('/data/peaks.js' + v);
      C = JSON.parse(JSON.stringify(window.CONTENT));
      PEAKS = JSON.parse(JSON.stringify(window.PEAKS || {}));
      DURS = JSON.parse(JSON.stringify(window.DURS || {}));
      for (const k of ['media', 'music', 'sfx']) {
        const r = await api('/api/files?dir=' + k);
        FILES[k] = r.files;
      }
      dirty = false;
      render();
    } catch (e) {
      $('edit').textContent = 'Не удалось загрузить данные: ' + (e.message || e);
      toast(String(e.message || e), true);
    }
  })();
})();
