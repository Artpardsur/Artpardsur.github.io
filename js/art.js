/* ============================================================
   КАРТИНКИ ПРОЕКТОВ ПО МЕСТАМ И ЦВЕТА КАССЕТ.
   Настройки лежат в project.art — их пишет вкладка «Картинки» в редакторе:
     art.color          — цвет полосы на кассете (#rrggbb);
     art[место]         — { src, zoom, x, y, size }:
       src  — нет поля: картинка проекта; '' — убрать; путь — своя картинка,
       zoom — увеличение (1 = вписать), x/y — какая точка кадра в центре, %,
       size — только для кассеты: диаметр наклейки в em (обычно 2.1).
   Места: tape — наклейка на кассете, pick — список проектов в плеере,
          player — обложка в плеере, card — карточка проекта,
          feature — большая карточка в «Код и моды».
   ============================================================ */
(function () {
  const PLACES = ['tape', 'pick', 'player', 'card', 'feature'];
  const isVideo = (s) => /\.(mp4|webm|mov)$/i.test(s || '');

  // цвет «Вся музыка» и запасная палитра — на случай проекта без art.color
  const ALL_COLOR = '#ffd60a';
  const PALETTE = ['#a78bfa', '#67e8f9', '#fb923c', '#86efac', '#f0abfc', '#93c5fd', '#fda4af', '#2dd4bf',
    '#bef264', '#f87171', '#d6a77a', '#cbd5e1', '#818cf8', '#cabd5a', '#c08497', '#38bdf8'];

  // картинка по умолчанию: та же, что сайт брал до мейкера
  function base(p, place) {
    if (place === 'tape' || place === 'pick') return p.cover || p.media || null;
    if (place === 'player') return p.cover || p.media || null;
    if (place === 'feature') return p.featureMedia || p.media || null;
    return p.media || null;
  }

  function get(p, place) {
    if (!p) return null;
    const a = (p.art && p.art[place]) || {};
    const src = (a.src === undefined || a.src === null) ? base(p, place) : a.src;
    if (!src) return null;
    // в маленьких кружках видео не показываем
    if ((place === 'tape' || place === 'pick') && isVideo(src)) return null;
    return {
      src: src,
      zoom: a.zoom > 0 ? a.zoom : 1,
      x: a.x == null ? 50 : a.x,
      y: a.y == null ? 50 : a.y,
      size: a.size > 0 ? a.size : 2.1,
    };
  }

  // CSS-переменные кадрирования: их читают object-position и transform в style.css
  function style(a) {
    return a ? '--ax:' + a.x + '%;--ay:' + a.y + '%;--az:' + a.zoom + ';' : '';
  }

  function color(p, i) {
    return (p && p.art && p.art.color) || PALETTE[(i || 0) % PALETTE.length];
  }

  window.Art = { PLACES: PLACES, ALL_COLOR: ALL_COLOR, PALETTE: PALETTE, get: get, style: style, color: color, isVideo: isVideo };
})();
