/* Выдвигающееся окно выбора (жанр, настроение, проект).
   На компьютере — всплывает из кнопки, на телефоне — выезжает снизу
   и закрывается свайпом вниз. Стандартный <select> не используется. */
(function () {
  const sheet = document.getElementById('sheet');
  const backdrop = document.getElementById('sheetBackdrop');
  const titleEl = document.getElementById('sheetTitle');
  const bodyEl = document.getElementById('sheetBody');
  const grab = document.getElementById('sheetGrab');
  const closeBtn = document.getElementById('sheetClose');

  let openState = false;
  let anchorEl = null;
  let hideTimer = null;

  function isMobile() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  /* Позиционирование на компьютере: под кнопкой, но не за краем экрана */
  function placeNearAnchor() {
    sheet.style.left = sheet.style.top = sheet.style.right = sheet.style.bottom = '';
    if (isMobile() || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const w = sheet.offsetWidth, h = sheet.offsetHeight;
    let left = r.left;
    left = Math.min(left, innerWidth - w - 14);
    left = Math.max(14, left);
    let top = r.bottom + 10;
    if (top + h > innerHeight - 14) {
      // снизу не помещается — раскрываем вверх
      top = Math.max(14, r.top - h - 10);
      sheet.classList.add('up');
    } else {
      sheet.classList.remove('up');
    }
    sheet.style.left = left + 'px';
    sheet.style.top = top + 'px';
    sheet.style.setProperty('--ox', Math.min(Math.max(r.left + r.width / 2 - left, 20), w - 20) + 'px');
  }

  const Sheet = {
    get isOpen() { return openState; },

    /* opts: { title, options:[{value,label,count,color}], value, anchor, onPick } */
    open(opts) {
      clearTimeout(hideTimer);
      anchorEl = opts.anchor || null;
      titleEl.textContent = opts.title || '';
      bodyEl.innerHTML = '';
      bodyEl.scrollTop = 0;

      (opts.options || []).forEach((o) => {
        const b = document.createElement('button');
        b.className = 'sheet-opt' + (o.value === opts.value ? ' active' : '');
        b.setAttribute('data-cursor', 'link');
        const dot = o.img
          ? '<span class="sheet-thumb"><img src="' + o.img.src + '" style="' + window.Art.style(o.img) + '" alt="" loading="lazy"></span>'
          : (o.color
            ? '<span class="sheet-dot" style="background:' + o.color + '"></span>'
            : '<span class="sheet-dot sheet-dot-all"></span>');
        b.innerHTML = dot +
          '<span class="sheet-opt-label"></span>' +
          (o.count != null ? '<span class="sheet-opt-count">' + o.count + '</span>' : '') +
          '<span class="sheet-opt-check">✓</span>';
        b.querySelector('.sheet-opt-label').textContent = o.label;
        if (o.count === 0) b.classList.add('empty');
        b.addEventListener('click', () => {
          Sheet.close();
          if (opts.onPick) opts.onPick(o.value);
        });
        bodyEl.appendChild(b);
      });

      sheet.classList.toggle('as-mobile', isMobile());
      sheet.hidden = false;
      backdrop.hidden = false;
      sheet.style.transform = '';
      placeNearAnchor();
      void sheet.offsetWidth; // перезапуск анимации
      sheet.classList.add('open');
      backdrop.classList.add('open');
      if (anchorEl) anchorEl.classList.add('pick-open');
      openState = true;
      if (isMobile()) document.body.classList.add('sheet-lock');
    },

    close() {
      if (!openState) return;
      openState = false;
      sheet.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.classList.remove('sheet-lock');
      if (anchorEl) anchorEl.classList.remove('pick-open');
      hideTimer = setTimeout(() => {
        sheet.hidden = true;
        backdrop.hidden = true;
        sheet.style.transform = '';
      }, 320);
    },
  };
  window.Sheet = Sheet;

  backdrop.addEventListener('click', () => Sheet.close());
  closeBtn.addEventListener('click', () => Sheet.close());
  addEventListener('keydown', (e) => { if (e.key === 'Escape') Sheet.close(); });
  addEventListener('resize', () => Sheet.close());
  addEventListener('scroll', () => { if (openState && !isMobile()) Sheet.close(); }, { passive: true });

  /* Свайп вниз по «язычку» закрывает окно на телефоне */
  let dragY = null;
  grab.addEventListener('pointerdown', (e) => {
    if (!isMobile()) return;
    dragY = e.clientY;
    sheet.style.transition = 'none';
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener('pointermove', (e) => {
    if (dragY === null) return;
    const dy = Math.max(0, e.clientY - dragY);
    sheet.style.transform = 'translateY(' + dy + 'px)';
  });
  const endDrag = (e) => {
    if (dragY === null) return;
    const dy = Math.max(0, e.clientY - dragY);
    dragY = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 90) Sheet.close();
  };
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);
})();
