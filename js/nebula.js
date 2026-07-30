/* Аудио-реактивная туманность на фоне.
   Рисует мягкие фиолетово-жёлтые «облака», которые дрейфуют,
   тянутся к курсору и пульсируют в такт играющей музыке. */
(function () {
  const canvas = document.getElementById('nebula');
  const ctx = canvas.getContext('2d');

  const Nebula = {
    // player.js подменяет эту функцию: возвращает уровень баса 0..1
    getLevel: () => 0,
    kick: 0,
  };
  window.Nebula = Nebula;

  let W = 0, H = 0, scale = 1;
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    scale = Math.min(window.devicePixelRatio || 1, 1) * 0.62; // рисуем в пониженном разрешении — быстрее
    W = canvas.width = Math.round(innerWidth * scale);
    H = canvas.height = Math.round(innerHeight * scale);
  }
  addEventListener('resize', resize);
  resize();

  addEventListener('pointermove', (e) => {
    mouse.tx = e.clientX / innerWidth;
    mouse.ty = e.clientY / innerHeight;
  });

  // Цвета читаем из CSS-переменных, чтобы Konami-режим перекрашивал и туманность
  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const alt = document.documentElement.hasAttribute('data-alt-theme');
    return alt
      ? [[255, 214, 10], [255, 190, 40], [212, 169, 0], [167, 139, 250], [255, 230, 102]]
      : [[109, 40, 217], [139, 92, 246], [88, 28, 180], [255, 214, 10], [196, 181, 253]];
  }

  // Облака: позиция в долях экрана, радиус, скорость дрейфа, индекс цвета, базовая прозрачность
  const blobs = [
    { x: 0.18, y: 0.28, r: 0.55, s: 0.00016, c: 0, a: 0.5, ph: 0.0 },
    { x: 0.78, y: 0.22, r: 0.48, s: 0.00021, c: 1, a: 0.4, ph: 2.1 },
    { x: 0.55, y: 0.75, r: 0.6, s: 0.00013, c: 2, a: 0.45, ph: 4.2 },
    { x: 0.85, y: 0.7, r: 0.3, s: 0.00027, c: 3, a: 0.13, ph: 1.3 }, // жёлтая искра
    { x: 0.3, y: 0.85, r: 0.34, s: 0.00019, c: 4, a: 0.16, ph: 3.6 },
    { x: 0.08, y: 0.6, r: 0.28, s: 0.00024, c: 3, a: 0.09, ph: 5.1 },
  ];

  // Звёздочки
  const stars = [];
  for (let i = 0; i < 46; i++) {
    stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.4, ph: Math.random() * 6.28, sp: 0.0004 + Math.random() * 0.0012 });
  }

  let level = 0;

  function frame(t) {
    const target = Nebula.getLevel() + Nebula.kick;
    Nebula.kick *= 0.92;
    level += (Math.min(target, 1) - level) * 0.14; // сглаживание пульса

    mouse.x += (mouse.tx - mouse.x) * 0.045;
    mouse.y += (mouse.ty - mouse.y) * 0.045;

    const cols = palette();
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    const base = Math.min(W, H);
    for (const b of blobs) {
      const dx = Math.sin(t * b.s + b.ph) * 0.06 + (mouse.x - 0.5) * 0.07;
      const dy = Math.cos(t * b.s * 1.3 + b.ph) * 0.06 + (mouse.y - 0.5) * 0.07;
      const x = (b.x + dx) * W;
      const y = (b.y + dy) * H;
      const pulse = 1 + level * (b.c === 3 ? 0.55 : 0.3) + Math.sin(t * 0.0004 + b.ph) * 0.05;
      const r = b.r * base * pulse;
      const col = cols[b.c];
      const alpha = b.a * (0.75 + level * 0.7);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + alpha.toFixed(3) + ')');
      g.addColorStop(0.55, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha * 0.25).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      ctx.fill();
    }

    // звёзды мерцают, чуть ярче под музыку
    ctx.globalCompositeOperation = 'source-over';
    for (const s of stars) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = 'rgba(243,239,255,' + (tw * (0.35 + level * 0.5)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r * scale * (1 + level * 0.6), 0, 6.2832);
      ctx.fill();
    }

    if (!reduced) requestAnimationFrame(frame);
  }

  // при reduced-motion рисуем один статичный кадр
  requestAnimationFrame(frame);
})();
