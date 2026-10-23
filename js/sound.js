/* Саунд-дизайн: «Сцены» — нарисованные сцены из проектов, где светящиеся точки
   играют звуки, из которых сцена собрана; «Кассеты» — у каждого проекта своя
   кассета, вставленная в деку она показывает звуки списком кнопок.
   Звуки и их названия берутся из content.js → sfx. */
(function () {
  const C = window.CONTENT;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SFX = {};
  C.sfx.forEach((g) => g.items.forEach((it) => { SFX[it.id] = Object.assign({ project: g.project }, it); }));
  const projectName = (id) => { const p = C.projects.find((x) => x.id === id); return p ? loc(p.name) : id; };

  /* ---------- Проигрывание: один экземпляр на звук, повторное нажатие — стоп ---------- */
  const playing = new Map(); // id звука → Audio
  const listeners = [];
  const changed = () => listeners.forEach((fn) => fn());

  function play(id) {
    const item = SFX[id];
    if (!item) return;
    if (playing.has(id)) { stop(id); return; }
    const a = new Audio(item.file);
    a.volume = 0.9;
    playing.set(id, a);
    a.addEventListener('ended', () => { if (playing.get(id) === a) { playing.delete(id); changed(); } });
    a.play().catch(() => { playing.delete(id); changed(); });
    window.Nebula.kick = 0.35;
    changed();
  }
  function stop(id) {
    const a = playing.get(id);
    if (a) { a.pause(); playing.delete(id); }
    changed();
  }
  function stopAll() {
    playing.forEach((a) => a.pause());
    playing.clear();
    changed();
  }

  /* ---------- Рисование сцен (SVG 1200×520) ---------- */
  // детерминированный «случайный» генератор: сцена одинакова при каждой загрузке
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const f1 = (n) => Math.round(n * 10) / 10;

  // Звёзды раскладываются по 4 отдельным слоям поверх неба: мерцает слой целиком,
  // это делает видеокарта без перерисовки всей сцены (70 мигающих точек внутри
  // одного SVG перерисовывали его каждый кадр). На месте звёзд в рисунке остаётся
  // метка: по ней сцена делится на «небо» и «всё остальное».
  const STAR_MARK = '<!--stars-->';
  let starLayers = null;
  function stars(r, n, maxY, color, inPlace) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const c = '<circle cx="' + f1(r() * 1200) + '" cy="' + f1(r() * maxY) + '" r="' + f1(0.5 + r() * 1.3) + '" fill="' + color + '"/>';
      r(); // прежний вызов для задержки мерцания — чтобы звёзды остались на своих местах
      if (inPlace || !starLayers) out += c; else starLayers[i % 4] += c;
    }
    return inPlace || !starLayers ? out : STAR_MARK;
  }

  // окна в доме: часть горит, часть мигает
  function windows(r, x, y, w, h, cols, rows, lit) {
    let out = '';
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const on = r() < lit;
        if (!on) continue;
        out += '<rect class="' + (r() < 0.18 ? 'flick' : '') + '" x="' + f1(x + i * cw + cw * 0.28) + '" y="' + f1(y + j * rh + rh * 0.3) +
          '" width="' + f1(cw * 0.44) + '" height="' + f1(rh * 0.42) + '" fill="#ffd60a" opacity="' + f1(0.35 + r() * 0.45) +
          '" style="animation-delay:' + f1(r() * 6) + 's"/>';
      }
    }
    return out;
  }

  function person(x, base, s, fill) {
    return '<g transform="translate(' + x + ' ' + base + ') scale(' + s + ')" fill="' + fill + '">' +
      '<circle cx="0" cy="-58" r="8"/><path d="M-10 -48h20l4 30h-6l-2 18h-12l-2-18h-6z"/></g>';
  }

  function drawCity() {
    const r = rng(7);
    let s = '<defs>' +
      '<linearGradient id="cSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0720"/><stop offset=".62" stop-color="#231245"/><stop offset="1" stop-color="#4b2163"/></linearGradient>' +
      '<radialGradient id="cMoon"><stop offset="0" stop-color="#fff3c4" stop-opacity=".55"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="cCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd60a" stop-opacity=".45"/><stop offset="1" stop-color="#ffd60a" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="cPc"><stop offset="0" stop-color="#67e8f9" stop-opacity=".9"/><stop offset="1" stop-color="#67e8f9" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<rect width="1200" height="520" fill="url(#cSky)"/>' + stars(r, 70, 260, '#f3efff') +
      '<circle cx="985" cy="92" r="90" fill="url(#cMoon)"/><circle cx="985" cy="92" r="30" fill="#fff3c4"/>';
    // дальние дома
    let x = -10;
    while (x < 1210) {
      const w = 50 + r() * 60, h = 130 + r() * 150;
      s += '<rect x="' + f1(x) + '" y="' + f1(430 - h) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="#1c1238"/>' +
        windows(r, x, 430 - h + 8, w, h - 20, 3, Math.floor(h / 26), 0.28);
      x += w + 4;
    }
    // строительный кран
    s += '<g data-spot="god-stroika" fill="none" stroke="#2c1c50" stroke-width="5">' +
      '<path d="M872 432V150M892 432V150M872 180l20 30M892 210l-20 30M872 240l20 30M892 270l-20 30M872 300l20 30M892 330l-20 30M872 360l20 30"/>' +
      '<path d="M790 150h260M870 150l12-30 12 30M1040 150v70" stroke-width="7"/>' +
      '<rect x="800" y="150" width="34" height="20" fill="#2c1c50"/><rect x="1032" y="220" width="16" height="12" fill="#2c1c50"/>' +
      '<circle class="blink" cx="882" cy="116" r="5" fill="#f43f5e" stroke="none"/></g>';
    // ближние дома и переулок
    s += '<rect x="0" y="150" width="250" height="285" fill="#120b26"/>' + windows(r, 0, 170, 250, 240, 5, 7, 0.2) +
      '<g data-spot="god-backstreet"><rect x="250" y="250" width="44" height="185" fill="#07040f"/>' +
      '<circle cx="272" cy="262" r="4" fill="#ffd60a"/><circle cx="272" cy="262" r="30" fill="url(#cMoon)" opacity=".5"/></g>' +
      '<rect x="294" y="190" width="230" height="245" fill="#150d2c"/>' + windows(r, 294, 205, 230, 120, 5, 3, 0.25) +
      '<g data-spot="god-pc"><circle cx="372" cy="256" r="46" fill="url(#cPc)" opacity=".35"/><rect x="352" y="244" width="40" height="26" fill="#67e8f9" opacity=".55"/></g>' +
      '<g data-spot="god-door"><rect x="440" y="370" width="38" height="62" fill="#2b1c4a"/><rect x="474" y="370" width="4" height="62" fill="#ffd60a" opacity=".55"/></g>' +
      '<rect x="1040" y="170" width="170" height="265" fill="#120b26"/>' + windows(r, 1040, 190, 170, 220, 4, 7, 0.22);
    // улица, фонарь, толпа
    s += '<rect y="430" width="1200" height="90" fill="#0a0716"/>' +
      '<path d="M0 478H1200" stroke="#2a1d47" stroke-width="3" stroke-dasharray="34 26"/>' +
      '<polygon points="586,312 614,312 690,432 510,432" fill="url(#cCone)"/>' +
      '<path d="M600 432V300h22" stroke="#2c1c50" stroke-width="6" fill="none"/><rect x="586" y="300" width="28" height="12" rx="4" fill="#ffd60a"/>' +
      '<g data-spot="god-crowd">';
    [650, 672, 700, 724, 748, 772, 796].forEach((px, i) => { s += person(px, 432, 0.9 + (i % 3) * 0.08, i % 2 ? '#1a1033' : '#211541'); });
    s += '</g>' +
      '<g data-spot="god-gunshot"><polygon class="flash" points="1110,384 1118,404 1140,406 1122,418 1128,440 1110,426 1092,440 1098,418 1080,406 1102,404" fill="#ffd60a"/></g>';
    return {
      svg: s,
      spots: [['god-backstreet', 272, 300], ['god-pc', 372, 230], ['god-door', 459, 352], ['god-crowd', 724, 350], ['god-stroika', 950, 150], ['god-gunshot', 1110, 412]],
    };
  }

  function drawDungeon() {
    const r = rng(11);
    let s = '<defs>' +
      '<pattern id="dBrick" width="90" height="44" patternUnits="userSpaceOnUse"><rect width="90" height="44" fill="#0d1d25"/>' +
      '<path d="M0 1H90M0 23H90M22 1V23M67 23V44" stroke="#163340" stroke-width="2"/></pattern>' +
      '<linearGradient id="dBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9adcf0" stop-opacity=".28"/><stop offset="1" stop-color="#9adcf0" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="dTorch"><stop offset="0" stop-color="#fb923c" stop-opacity=".75"/><stop offset="1" stop-color="#fb923c" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="dShade" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>' +
      '</defs>' +
      '<rect width="1200" height="520" fill="url(#dBrick)"/>';
    // окно с решёткой, лунный луч и вспышка грозы
    s += '<polygon points="852,212 1018,212 1110,520 760,520" fill="url(#dBeam)"/>' +
      '<g data-spot="par-wind"><path d="M860 212V140a75 60 0 0 1 150 0V212z" fill="#24485a"/>' +
      stars(r, 10, 60, '#e6f6ff', true).replace(/cy="([\d.]+)"/g, (m, y) => 'cy="' + f1(100 + Number(y)) + '"').replace(/cx="([\d.]+)"/g, (m, x) => 'cx="' + f1(870 + Number(x) / 9) + '"') +
      '<path d="M890 100V212M920 84V212M950 84V212M980 100V212M860 160H1010" stroke="#071015" stroke-width="8"/></g>' +
      '<g data-spot="par-thunder"><path class="flash" d="M860 212V140a75 60 0 0 1 150 0V212z" fill="#e6f6ff"/>' +
      '<path class="flash" d="M948 70l-18 50h16l-14 44 34-60h-18l14-34z" fill="#fff"/></g>';
    // дверь камеры с засовом
    s += '<g data-spot="par-door"><path d="M118 432V230a86 70 0 0 1 172 0V432z" fill="#2a1d14"/>' +
      '<path d="M146 432V200M176 432V176M206 432V168M236 432V176M262 432V196" stroke="#1a110b" stroke-width="4"/>' +
      '<path d="M118 260H290M118 380H290" stroke="#3d4347" stroke-width="10"/><rect x="186" y="290" width="36" height="26" fill="#0b0f12"/>' +
      '<path d="M192 290V316M204 290V316M216 290V316" stroke="#3d4347" stroke-width="3"/></g>' +
      '<g data-spot="par-prison"><rect x="268" y="316" width="58" height="14" rx="3" fill="#7b8287"/><rect x="314" y="306" width="12" height="34" fill="#5b6266"/></g>';
    // цепи на стене
    s += '<path d="M640 40q10 30 0 60q-10 30 0 60q10 30 0 60" stroke="#2e3b42" stroke-width="7" fill="none" stroke-dasharray="14 6"/>' +
      '<path d="M720 40q-10 34 0 68q10 34 0 68" stroke="#2e3b42" stroke-width="7" fill="none" stroke-dasharray="14 6"/>';
    // проход вглубь, факел
    s += '<g data-spot="par-steps"><path d="M1070 432V280a65 60 0 0 1 130 0V432z" fill="#03080b"/>' +
      '<circle class="torch" cx="1050" cy="262" r="64" fill="url(#dTorch)"/><rect x="1044" y="262" width="10" height="34" fill="#3a2a1a"/>' +
      '<path class="torch" d="M1049 262c-10-10-4-22 0-30c4 8 12 18 0 30z" fill="#fbbf24"/></g>';
    // пол, капли, лужа
    s += '<rect y="432" width="1200" height="88" fill="#06100f"/><path d="M0 432H1200M0 470H1200M180 432l-30 88M520 432l-10 88M860 432l20 88" stroke="#10242b" stroke-width="2"/>' +
      '<g data-spot="par-water"><ellipse cx="560" cy="456" rx="58" ry="8" fill="#2b5b6b" opacity=".55"/>' +
      '<ellipse class="ripple" cx="560" cy="456" rx="20" ry="3" fill="none" stroke="#9adcf0" stroke-width="2"/>' +
      '<path d="M548 0l12 22l12-22z" fill="#163340"/>' +
      '<circle class="drop" cx="560" cy="30" r="4" fill="#9adcf0"/><circle class="drop" cx="560" cy="30" r="4" fill="#9adcf0" style="animation-delay:1.3s"/></g>' +
      '<rect width="1200" height="520" fill="url(#dShade)" pointer-events="none"/>';
    return {
      svg: s,
      spots: [['par-door', 204, 250], ['par-prison', 300, 300], ['par-water', 560, 410], ['par-wind', 900, 176], ['par-thunder', 1012, 98], ['par-steps', 1135, 360]],
    };
  }

  function drawZone() {
    const r = rng(23);
    let s = '<defs>' +
      '<linearGradient id="zSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b120b"/><stop offset=".5" stop-color="#4a2a12"/><stop offset=".82" stop-color="#a85a1c"/><stop offset="1" stop-color="#d98a33"/></linearGradient>' +
      '<radialGradient id="zSun"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".8"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<rect width="1200" height="520" fill="url(#zSky)"/>' + stars(r, 25, 140, '#ffe8c2') +
      '<circle cx="330" cy="372" r="150" fill="url(#zSun)"/><circle cx="330" cy="372" r="48" fill="#ffcf7a" opacity=".75"/>' +
      '<path d="M0 410Q150 360 320 392T700 380T1200 396V520H0z" fill="#3a2412"/>';
    // ЛЭП с проводами
    [130, 520, 1120].forEach((px) => {
      s += '<path d="M' + (px - 26) + ' 432L' + px + ' 230L' + (px + 26) + ' 432M' + (px - 40) + ' 262H' + (px + 40) + 'M' + (px - 30) + ' 300H' + (px + 30) +
        'M' + (px - 16) + ' 340l32 40M' + (px + 16) + ' 340l-32 40" stroke="#1a0f07" stroke-width="5" fill="none"/>';
    });
    s += '<path d="M90 262Q325 330 480 262M560 262Q840 330 1080 262M90 300Q325 368 490 300" stroke="#1a0f07" stroke-width="2" fill="none"/>';
    // станция и вентиляционная труба
    s += '<g fill="#1e130a"><rect x="640" y="320" width="270" height="112"/><rect x="690" y="286" width="150" height="40"/>' +
      '<rect x="900" y="350" width="80" height="82"/><path d="M862 432V128h30V432z"/></g>' +
      '<path d="M862 170h30M862 210h30M862 250h30" stroke="#3a2412" stroke-width="10"/>' +
      '<circle class="blink" cx="877" cy="120" r="5" fill="#f43f5e"/>' +
      windows(r, 650, 340, 250, 70, 9, 2, 0.15).replace(/#ffd60a/g, '#ffb347');
    // мёртвые деревья
    s += '<path d="M40 432V300M40 340l-26-30M40 320l30-40M70 280l10-24M40 380l22-18M330 432V350M330 380l-18-20M330 366l16-22" stroke="#1a0f07" stroke-width="6" fill="none" stroke-linecap="round"/>';
    // столб с сиреной
    s += '<g data-spot="chs-alarm"><path d="M215 432V196" stroke="#1a0f07" stroke-width="8"/><path d="M215 200l40-18v44z" fill="#2a1a0c"/>' +
      '<path class="flash" d="M268 186q16 18 0 36M282 176q26 28 0 56M296 166q36 38 0 76" stroke="#ffcf7a" stroke-width="4" fill="none"/></g>';
    // птицы
    s += '<g data-spot="chs-bird" class="birds" fill="none" stroke="#1a0f07" stroke-width="3" stroke-linecap="round">' +
      '<path d="M440 140q10-10 20 0q10-10 20 0"/><path d="M500 116q8-8 16 0q8-8 16 0"/><path d="M470 176q7-7 14 0q7-7 14 0"/>' +
      '<path d="M548 150q9-9 18 0q9-9 18 0"/><path d="M420 104q6-6 12 0q6-6 12 0"/></g>';
    // сталкер в противогазе
    s += '<g data-spot="chs-breath" fill="#140c05"><circle cx="1010" cy="354" r="13"/><path d="M1008 362h22l-4 10h-14z"/>' +
      '<path d="M994 368h30l6 40h-8l-2 24h-24l-2-24h-8z"/><rect x="982" y="370" width="14" height="34" rx="4"/>' +
      '<path class="flash" d="M1036 360q10 0 14-8M1040 368q14 0 20-12" stroke="#ffcf7a" stroke-width="2" fill="none"/></g>' +
      '<rect y="432" width="1200" height="88" fill="#120b05"/>' +
      '<path d="M60 432l6-14l6 14M400 432l5-12l5 12M760 432l6-16l6 16M1180 432l5-12l5 12" stroke="#2a1a0c" stroke-width="3" fill="none"/>';
    return {
      svg: s,
      spots: [['chs-alarm', 236, 190], ['chs-bird', 500, 140], ['chs-breath', 1010, 320]],
    };
  }

  function drawEvening() {
    const r = rng(31);
    let s = '<defs>' +
      '<linearGradient id="eSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#160b2b"/><stop offset=".55" stop-color="#3b1846"/><stop offset=".88" stop-color="#a8456b"/><stop offset="1" stop-color="#e07a6a"/></linearGradient>' +
      '<radialGradient id="eGlow"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".7"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<rect width="1200" height="520" fill="url(#eSky)"/>' + stars(r, 40, 200, '#ffe4f1');
    // дом с окном
    s += '<g data-spot="ap-house"><path d="M20 432V320l70-50l70 50V432z" fill="#1c0f2e"/><rect x="66" y="350" width="44" height="34" fill="#ffcf7a" opacity=".85"/>' +
      '<path d="M88 350v34M66 367h44" stroke="#1c0f2e" stroke-width="4"/><circle cx="88" cy="367" r="44" fill="url(#eGlow)" opacity=".4"/></g>';
    // кинотеатр с лампочками
    s += '<g data-spot="ap-cinema"><rect x="210" y="226" width="320" height="206" fill="#1d1030"/><rect x="196" y="256" width="348" height="40" fill="#2a1440"/>';
    for (let i = 0; i < 17; i++) {
      s += '<circle class="bulb" cx="' + (210 + i * 20) + '" cy="262" r="3.6" fill="#ffd60a" style="animation-delay:' + f1(i * 0.12) + 's"/>' +
        '<circle class="bulb" cx="' + (210 + i * 20) + '" cy="290" r="3.6" fill="#ffd60a" style="animation-delay:' + f1(i * 0.12 + 0.6) + 's"/>';
    }
    s += '<rect x="236" y="314" width="56" height="78" fill="#3b1d55"/><rect x="448" y="314" width="56" height="78" fill="#3b1d55"/>' +
      '<rect x="318" y="350" width="104" height="82" fill="#ffd9a0" opacity=".45"/><path d="M370 350V432" stroke="#1d1030" stroke-width="4"/></g>';
    // парк: деревья, скамья, фонари
    s += '<g data-spot="ap-park">';
    [[930, 330, 62], [1000, 300, 78], [1080, 336, 58], [1150, 310, 70]].forEach(([cx, cy, rr], i) => {
      s += '<path d="M' + cx + ' 432V' + (cy + 20) + '" stroke="#140a22" stroke-width="10"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="' + (i % 2 ? '#22123a' : '#1a0f2a') + '"/>';
    });
    s += '<path d="M960 412h70M966 412v20M1024 412v20M960 398h70" stroke="#140a22" stroke-width="5"/>' +
      '<path d="M880 432V330" stroke="#140a22" stroke-width="5"/><circle cx="880" cy="326" r="7" fill="#ffd60a"/><circle cx="880" cy="326" r="40" fill="url(#eGlow)" opacity=".5"/></g>';
    // дорога, машина, авария, шаги
    s += '<rect y="432" width="1200" height="88" fill="#0d0818"/><path d="M0 482H1200" stroke="#3b2550" stroke-width="3" stroke-dasharray="30 24"/>' +
      '<g data-spot="ap-cardoor"><path d="M640 438v-24l26-24h80l30 24h18v24z" fill="#0a0612"/><rect x="676" y="396" width="34" height="18" fill="#3b2550"/>' +
      '<circle cx="668" cy="440" r="13" fill="#05030a"/><circle cx="772" cy="440" r="13" fill="#05030a"/>' +
      '<polygon points="794,420 900,404 900,440" fill="#ffcf7a" opacity=".18"/><rect x="788" y="416" width="8" height="6" fill="#ffcf7a"/></g>' +
      '<g data-spot="ap-accident"><polygon class="flash" points="880,446 888,464 910,466 892,478 898,500 880,486 862,500 868,478 850,466 872,464" fill="#ffd60a"/></g>' +
      '<g data-spot="ap-steps" fill="#3b2550"><ellipse cx="560" cy="446" rx="5" ry="8"/><ellipse cx="578" cy="458" rx="5" ry="8"/><ellipse cx="596" cy="446" rx="5" ry="8"/><ellipse cx="614" cy="458" rx="5" ry="8"/></g>';
    return {
      svg: s,
      spots: [['ap-house', 88, 300], ['ap-cinema', 370, 330], ['ap-steps', 588, 430], ['ap-cardoor', 714, 380], ['ap-accident', 880, 462], ['ap-park', 1030, 270]],
    };
  }

  const SCENES = [
    { id: 'city', project: 'god', draw: drawCity },
    { id: 'dungeon', project: 'paraselene', draw: drawDungeon },
    { id: 'zone', project: 'chernobyl', draw: drawZone },
    { id: 'evening', project: 'at11pm', draw: drawEvening },
  ].filter((sc) => C.projects.some((p) => p.id === sc.project));

  let sceneIndex = 0;
  let current = null; // { spots, buttons }
  const sceneEl = document.getElementById('scene');
  const artEl = document.getElementById('sceneArt');
  const spotsEl = document.getElementById('sceneSpots');
  const allBtn = document.getElementById('sceneAll');

  function renderScenePicks() {
    const wrap = document.getElementById('scenePicks');
    wrap.innerHTML = '';
    SCENES.forEach((sc, i) => {
      const b = document.createElement('button');
      b.className = 'scene-pick' + (i === sceneIndex ? ' active' : '');
      b.setAttribute('aria-pressed', i === sceneIndex ? 'true' : 'false');
      b.setAttribute('data-cursor', 'link');
      b.innerHTML = '<span class="scene-pick-title"></span><span class="scene-pick-proj"></span>';
      b.firstChild.textContent = t('scene.' + sc.id);
      b.lastChild.textContent = projectName(sc.project);
      b.addEventListener('click', () => {
        if (i === sceneIndex) return;
        stopAll();
        sceneIndex = i;
        renderScenePicks();
        renderScene(true);
      });
      wrap.appendChild(b);
    });
  }

  function renderScene(animate) {
    const sc = SCENES[sceneIndex];
    if (!sc) return;
    starLayers = ['', '', '', ''];
    const drawn = sc.draw();
    const layers = starLayers;
    starLayers = null;
    const svg = (cls, body) => '<svg class="' + cls + '" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice">' + body + '</svg>';
    const cut = drawn.svg.indexOf(STAR_MARK);
    artEl.innerHTML = cut < 0 ? svg('scene-bg', drawn.svg)
      : svg('scene-bg', drawn.svg.slice(0, cut)) +
        layers.map((l, i) => svg('star-layer sl' + i, l)).join('') +
        svg('scene-fg', drawn.svg.slice(cut + STAR_MARK.length));
    if (animate) { sceneEl.classList.remove('swap'); void sceneEl.offsetWidth; sceneEl.classList.add('swap'); }
    document.getElementById('sceneProject').textContent = projectName(sc.project);
    document.getElementById('sceneTitle').textContent = t('scene.' + sc.id);

    spotsEl.innerHTML = '';
    const buttons = drawn.spots.filter((sp) => SFX[sp[0]]).map((sp, i) => {
      const item = SFX[sp[0]];
      const b = document.createElement('button');
      b.className = 'spot';
      b.dataset.id = sp[0];
      b.style.animationDelay = (i * 0.08) + 's';
      b.setAttribute('data-cursor', 'link');
      b.setAttribute('aria-label', loc(item.name) + ' — ' + projectName(sc.project));
      b.innerHTML = '<span class="spot-dot"></span><span class="spot-label"></span>';
      b.lastChild.textContent = loc(item.name);
      b.addEventListener('click', () => play(sp[0]));
      spotsEl.appendChild(b);
      return { b, x: sp[1], y: sp[2] };
    });
    current = { buttons, fresh: true };
    layoutSpots();
    updateScene();
  }

  // точки ставятся по координатам рисунка с учётом обрезки (slice) под размер блока.
  // Если блок заметно уже рисунка (телефон) — сцена становится панорамой во всю
  // ширину рисунка, её листают пальцем, а начинается она с середины.
  const scrollEl = document.getElementById('sceneScroll');
  const canvasEl = document.getElementById('sceneCanvas');
  function layoutSpots() {
    if (!current) return;
    const boxW = sceneEl.clientWidth, H = sceneEl.clientHeight;
    const pano = boxW / H < 1200 / 520 * 0.8;
    const wasPano = sceneEl.classList.contains('is-pano');
    sceneEl.classList.toggle('is-pano', pano);
    const W = pano ? Math.round(H * 1200 / 520) : boxW;
    canvasEl.style.width = pano ? W + 'px' : '';
    if (pano && (!wasPano || current.fresh)) scrollEl.scrollLeft = (W - boxW) / 2;
    current.fresh = false;
    const k = Math.max(W / 1200, H / 520);
    const ox = (W - 1200 * k) / 2, oy = (H - 520 * k) / 2;
    current.buttons.forEach(({ b, x, y }) => {
      const px = Math.min(W - 22, Math.max(22, ox + x * k));
      const py = Math.min(H - 22, Math.max(22, oy + y * k));
      b.style.left = px + 'px';
      b.style.top = py + 'px';
      b.classList.toggle('label-left', px > W * 0.72);
    });
  }
  if (window.ResizeObserver) new ResizeObserver(layoutSpots).observe(sceneEl);
  else addEventListener('resize', layoutSpots);

  function updateScene() {
    if (!current) return;
    const names = [];
    current.buttons.forEach(({ b }) => {
      const on = playing.has(b.dataset.id);
      b.classList.toggle('playing', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) names.push(loc(SFX[b.dataset.id].name));
    });
    artEl.querySelectorAll('[data-spot]').forEach((g) => g.classList.toggle('lit', playing.has(g.dataset.spot)));
    const any = names.length > 0;
    document.getElementById('sceneNowText').textContent = any ? names.join(' · ') : t('sound.hint');
    document.getElementById('sceneNow').classList.toggle('on', any);
    const sceneBusy = current.buttons.some(({ b }) => playing.has(b.dataset.id));
    allBtn.textContent = sceneBusy ? '■ ' + t('sound.stop') : '▶ ' + t('sound.playAll');
  }

  let allTimers = [];
  allBtn.addEventListener('click', () => {
    allTimers.forEach(clearTimeout);
    allTimers = [];
    if (current.buttons.some(({ b }) => playing.has(b.dataset.id))) { stopAll(); return; }
    // звуки сцены вступают по очереди, как слои
    current.buttons.forEach(({ b }, i) => {
      allTimers.push(setTimeout(() => { if (!playing.has(b.dataset.id)) play(b.dataset.id); }, i * 350));
    });
  });

  /* ---------- Кассеты ---------- */
  const TAPE_COLORS = ['#ffd60a', '#a78bfa', '#67e8f9', '#fb923c', '#f0abfc', '#86efac', '#fda4af', '#fde68a'];
  let tapeIndex = 0;

  // кассета: корпус, винты, наклейка (по желанию — кружок с обложкой), окошко с катушками, низ
  function tapeMarkup(title, color, sub, big, img) {
    return '<span class="tape' + (big ? ' tape-big' : '') + '" style="--tc:' + color + '">' +
      '<span class="tape-screw s1"></span><span class="tape-screw s2"></span><span class="tape-screw s3"></span><span class="tape-screw s4"></span>' +
      '<span class="tape-label"><span class="tape-side">A</span><span class="tape-title"></span><span class="tape-sub"></span>' +
      (img ? '<span class="tape-sticker" style="background-image:url(&quot;' + img + '&quot;)"></span>' : '') +
      '<span class="tape-window"><span class="tape-reel l"><span class="tape-hub"></span></span>' +
      '<span class="tape-film"></span><span class="tape-reel r"><span class="tape-hub"></span></span></span></span>' +
      '<span class="tape-foot"><i></i><i></i><i></i><i></i></span></span>';
  }
  function fillTape(el, title, sub) {
    el.querySelector('.tape-title').textContent = title;
    el.querySelector('.tape-sub').textContent = sub;
  }

  function renderTapes() {
    const rack = document.getElementById('tapesRack');
    rack.innerHTML = '';
    C.sfx.forEach((g, i) => {
      const b = document.createElement('button');
      b.className = 'tape-btn' + (i === tapeIndex ? ' active' : '');
      b.setAttribute('aria-pressed', i === tapeIndex ? 'true' : 'false');
      b.setAttribute('data-cursor', 'link');
      b.innerHTML = tapeMarkup('', TAPE_COLORS[i % TAPE_COLORS.length], '', false) + '<span class="tape-count"></span>';
      fillTape(b, projectName(g.project), 'Pardus · SFX');
      b.querySelector('.tape-count').textContent = plural(g.items.length, 'sound.count');
      b.addEventListener('click', () => {
        if (i === tapeIndex) return;
        stopAll();
        tapeIndex = i;
        renderTapes();
        renderDeck(true);
      });
      rack.appendChild(b);
    });
  }

  function fmt(s) {
    if (!s) return '';
    s = Math.round(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function renderDeck(insert) {
    const g = C.sfx[tapeIndex];
    if (!g) return;
    const slot = document.getElementById('deckSlot');
    slot.innerHTML = tapeMarkup('', TAPE_COLORS[tapeIndex % TAPE_COLORS.length], '', true);
    fillTape(slot, projectName(g.project), plural(g.items.length, 'sound.count'));
    if (insert && !reduced) { slot.classList.remove('inserting'); void slot.offsetWidth; slot.classList.add('inserting'); }
    document.getElementById('deckLabel').textContent = t('sound.inDeck') + ': ' + projectName(g.project);

    const list = document.getElementById('deckList');
    list.innerHTML = '';
    g.items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'sfx-pad deck-pad';
      b.dataset.id = it.id;
      b.setAttribute('data-cursor', 'link');
      b.innerHTML = '<span class="deck-pad-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="sfx-pad-name"></span><span class="deck-pad-dur">' + fmt(window.DURS[it.id]) + '</span><span class="sfx-pad-bar"></span>';
      b.querySelector('.sfx-pad-name').textContent = loc(it.name);
      b.addEventListener('click', () => play(it.id));
      list.appendChild(b);
    });
    updateDeck();
  }

  function updateDeck() {
    const deck = document.getElementById('deck');
    let any = false;
    document.querySelectorAll('.deck-pad').forEach((b) => {
      const a = playing.get(b.dataset.id);
      const on = !!a;
      any = any || on;
      if (on && !b.classList.contains('playing')) {
        const d = window.DURS[b.dataset.id] || (a.duration || 1);
        b.style.setProperty('--dur', Math.min(d, 30) + 's');
      }
      b.classList.toggle('playing', on);
    });
    deck.classList.toggle('spinning', any);
  }

  /* ---------- Вкладки ---------- */
  const tabs = [
    [document.getElementById('tabScenes'), document.getElementById('scenePanel')],
    [document.getElementById('tabTapes'), document.getElementById('tapesPanel')],
  ];
  tabs.forEach(([tab], i) => tab.addEventListener('click', () => {
    tabs.forEach(([tb, panel], j) => {
      tb.classList.toggle('active', i === j);
      tb.setAttribute('aria-selected', i === j ? 'true' : 'false');
      panel.hidden = i !== j;
    });
    if (i === 0) layoutSpots();
  }));

  listeners.push(updateScene, updateDeck);

  window.Tape = { markup: tapeMarkup, fill: fillTape, colors: TAPE_COLORS };

  window.Sound = {
    render() {
      renderScenePicks();
      renderScene(false);
      renderTapes();
      renderDeck(false);
    },
    stopAll,
  };
})();
