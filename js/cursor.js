/* Кастомный курсор: жёлтая точка + фиолетовое кольцо-«хвост».
   Над ссылками кольцо растёт, над треками превращается в кнопку play. */
(function () {
  const fine = window.matchMedia('(pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduced) return; // на сенсорных экранах оставляем обычный курсор

  document.body.classList.add('has-cursor');
  const dot = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');

  let mx = innerWidth / 2, my = innerHeight / 2;
  let rx = mx, ry = my;

  addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
    wake();
  });

  // кольцо догоняет точку; догнало — цикл засыпает до следующего движения мыши
  let running = false;
  function loop() {
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    if (Math.abs(mx - rx) < 0.1 && Math.abs(my - ry) < 0.1) { rx = mx; ry = my; running = false; }
    ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
    if (running) requestAnimationFrame(loop);
  }
  function wake() { if (!running) { running = true; requestAnimationFrame(loop); } }
  wake();

  // Состояния определяем делегированием — работает и для динамических элементов
  document.addEventListener('pointerover', (e) => {
    const track = e.target.closest && e.target.closest('.track');
    if (track) {
      ring.classList.add(track.classList.contains('playing') ? 'is-pause' : 'is-play');
      ring.classList.remove(track.classList.contains('playing') ? 'is-play' : 'is-pause');
      return;
    }
    ring.classList.remove('is-play', 'is-pause');
    const link = e.target.closest && e.target.closest('a, button, select, input, [data-cursor="link"]');
    ring.classList.toggle('is-link', !!link);
  });

  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget) ring.classList.remove('is-link', 'is-play', 'is-pause');
  });

  // Пока курсор не двигали — прячем в центре без мигания
  dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
})();
