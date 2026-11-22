/* Торжественная заставка на весь экран после окончания отсчёта.
   Настройки и тексты — content.js → announce.premiere:
     until — до какого момента показывать (после announce.date),
     img / blur — старый титульный экран игры, clock — где на нём часы (доли ширины/высоты),
     kicker, title, text, cta, more — тексты на языках.
   Показывается один раз за посещение (sessionStorage), ?premiere=1 — показать принудительно. */
(function () {
  const KEY = 'pardus-premiere-seen';

  function cfg() {
    const a = window.CONTENT && window.CONTENT.announce;
    return a && a.date && a.premiere ? a : null;
  }

  // идёт ли окно показа: от момента анонса до premiere.until
  function isLive(now) {
    const a = cfg();
    if (!a) return false;
    const from = new Date(a.date).getTime();
    const until = a.premiere.until ? new Date(a.premiere.until).getTime() : Infinity;
    return now >= from && now < until;
  }

  function forced() { return /[?&]premiere=1\b/.test(location.search); }

  function seen() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* не важно */ }
  }

  let shown = false;

  function maybeShow() {
    if (shown) return;
    if (!forced() && (!isLive(Date.now()) || seen())) return;
    show();
  }

  function show() {
    const a = cfg();
    if (!a) return;
    shown = true;
    markSeen();
    const P = a.premiere;
    const L = window.loc || ((o) => (typeof o === 'string' ? o : (o && (o.ru || o.en)) || ''));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const root = document.createElement('div');
    root.className = 'premiere' + (reduce ? ' pm-reduce' : '');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'premiereTitle');
    root.innerHTML =
      '<div class="pm-bg" style="background-image:url(\'' + (P.blur || P.img) + '\')"></div>' +
      '<div class="pm-vignette"></div>' +
      '<canvas class="pm-dust" aria-hidden="true"></canvas>' +
      '<button class="pm-close" type="button" aria-label="×" data-cursor="link">×</button>' +
      '<div class="pm-stage">' +
        '<figure class="pm-frame">' +
          '<img class="pm-img" src="' + P.img + '" alt="" width="1600" height="900">' +
          '<span class="pm-sweep" aria-hidden="true"></span>' +
          '<span class="pm-rings" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '</figure>' +
        '<div class="pm-copy">' +
          '<p class="pm-kicker"></p>' +
          '<h2 class="pm-title" id="premiereTitle"></h2>' +
          '<p class="pm-text"></p>' +
          '<div class="pm-actions">' +
            '<button class="btn btn-primary pm-go" type="button" data-cursor="link"></button>' +
            '<a class="btn btn-ghost pm-more" href="#project-' + a.project + '" data-cursor="link"></a>' +
          '</div>' +
        '</div>' +
      '</div>';

    const clock = P.clock || [0.684, 0.482];
    const rings = root.querySelector('.pm-rings');
    rings.style.left = clock[0] * 100 + '%';
    rings.style.top = clock[1] * 100 + '%';

    root.querySelector('.pm-kicker').textContent = L(P.kicker);
    root.querySelector('.pm-text').textContent = L(P.text);
    root.querySelector('.pm-go').textContent = L(P.cta);
    root.querySelector('.pm-more').textContent = L(P.more);
    root.querySelector('.pm-close').setAttribute('aria-label', L(P.cta));

    // заголовок по словам: каждое проявляется с задержкой, «Временной поток» — золотом
    const title = root.querySelector('.pm-title');
    const raw = L(P.title);
    const accent = L(P.accent || '');
    let i = 0;
    raw.split(/(\s+)/).forEach((part) => {
      if (/^\s+$/.test(part)) { title.appendChild(document.createTextNode(' ')); return; }
      const w = document.createElement('span');
      w.className = 'pm-word' + (accent && accent.split(/\s+/).some((x) => part.indexOf(x) !== -1) ? ' pm-gold' : '');
      w.style.setProperty('--i', i++);
      w.textContent = part;
      title.appendChild(w);
    });

    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('is-on'));

    const stopDust = reduce ? () => {} : dust(root.querySelector('.pm-dust'));

    let closed = false;
    function close(then) {
      if (closed) return;
      closed = true;
      root.classList.add('is-off');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        stopDust();
        root.remove();
        html.style.overflow = prevOverflow;
        if (then) then();
      }, reduce ? 0 : 750);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    root.querySelector('.pm-go').addEventListener('click', () => close());
    root.querySelector('.pm-close').addEventListener('click', () => close());
    root.querySelector('.pm-more').addEventListener('click', (e) => {
      e.preventDefault();
      close(() => {
        const card = document.getElementById('project-' + a.project) || document.getElementById('projects');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('pm-highlight');
          setTimeout(() => card.classList.remove('pm-highlight'), 2600);
        }
      });
    });

    // фокус — на главную кнопку, когда она появится
    setTimeout(() => { if (!closed) root.querySelector('.pm-go').focus({ preventScroll: true }); }, reduce ? 0 : 4300);
  }

  /* Золотая пыль: медленно поднимается и мерцает, как пылинки в луче */
  function dust(canvas) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, raf = 0, alive = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const N = Math.round(Math.min(70, Math.max(30, innerWidth / 22)));
    const ps = [];
    function size() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function spawn(p, anywhere) {
      p.x = Math.random() * w;
      p.y = anywhere ? Math.random() * h : h + 10;
      p.r = 0.6 + Math.random() * 1.8;
      p.vy = 0.15 + Math.random() * 0.45;
      p.vx = (Math.random() - 0.5) * 0.2;
      p.ph = Math.random() * Math.PI * 2;
      p.sp = 0.01 + Math.random() * 0.03;
      return p;
    }
    size();
    for (let k = 0; k < N; k++) ps.push(spawn({}, true));
    addEventListener('resize', size);
    function frame() {
      if (!alive) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.vy; p.x += p.vx + Math.sin(p.ph) * 0.15; p.ph += p.sp;
        if (p.y < -10) spawn(p, false);
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(p.ph * 2));
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 214, 120,' + a.toFixed(3) + ')';
        ctx.shadowColor = 'rgba(255, 190, 60, 0.9)';
        ctx.shadowBlur = 6 * p.r;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); };
  }

  window.Premiere = { maybeShow, isLive, show };
  // предпросмотр в любой день: artpardsur.github.io/?premiere=1
  if (forced()) addEventListener('load', () => setTimeout(maybeShow, 50));
})();
