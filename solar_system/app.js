"use strict";

/* =========================================================
   Интерактивная демонстрация Солнечной системы
   Canvas 2D: Солнце + 8 планет, клик по планете — карточка
   с фактами, управление: воспроизведение/пауза, скорость.
   ========================================================= */

/* Версия сборки — видна в заголовке страницы, в шапке и в консоли,
   чтобы по открытой страничке сразу было понятно, какая сборка запущена. */
const VERSION = "v1.7 (Круговые орбиты с пропорц. расстоянием вместо Галактики + кометы)";
document.title = `Солнечная система ${VERSION}`;
console.log(`%c☀️ Солнечная система — сборка: ${VERSION}`, "color:#ffd75e;font-weight:bold");
/* Бейдж версии в шапке страницы */
{
  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = VERSION;
}

const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");

/* ---------- Данные о планетах (реальные факты) ----------
   orbitAU    — большая полуось, а.е.
   periodDays — орбитальный период, земных суток
   diameterKm — диаметр, км
   drawR      — радиус на экране (px, условный, для наглядности)
   realR      — реальный радиус в "ед. Земли" (для режима реальных размеров)
   color      — базовый цвет; gradient — оттенки для шара
*/
const SUN = {
  name: "Солнце",
  drawR: 34,
  realRel: 109.2, // радиус Солнца ≈ 109 радиусов Земли
  color: "#ffcf5c",
};

const PLANETS = [
  {
    name: "Меркурий", nameEn: "Mercury",
    orbitAU: 0.39, periodDays: 88, diameterKm: 4879,
    ecc: 0.206, periAU: 0.307, aphelionAU: 0.467,
        drawR: 5, realRel: 0.38,
    color: "#b5a79a", shades: ["#d8cec2", "#9c8f82", "#6e6258"],
    moons: 0, type: "Каменистая планета",
    desc: "Ближайшая к Солнцу и самая маленькая планета. Дневная сторона раскаляется до +430 °C, ночная остывает до −180 °C.",
    // Крупнейшие луны (опциональный слой): periodDays — сидерический период,
    // distKm — большая полуось орбиты, relR — радиус относительно Земли, drawOrbR — орбита на экране (px)
    majorMoons: [],
  },
  {
    name: "Венера", nameEn: "Venus",
    orbitAU: 0.72, periodDays: 225, diameterKm: 12104,
    ecc: 0.007, periAU: 0.718, aphelionAU: 0.728,
        drawR: 9, realRel: 0.95,
    color: "#e6c47a", shades: ["#f5e0ac", "#dfb877", "#a97f49"],
    moons: 0, type: "Каменистая планета",
    desc: "Самая горячая планета (≈ +465 °C) из-за плотной углекислотной атмосферы и парникового эффекта. Вращается в обратную сторону.",
    majorMoons: [],
  },
  {
    name: "Земля", nameEn: "Earth",
    orbitAU: 1.0, periodDays: 365.25, diameterKm: 12742,
    ecc: 0.017, periAU: 0.983, aphelionAU: 1.017,
        drawR: 10, realRel: 1.0,
    color: "#4f8fd6", shades: ["#8ec6ff", "#3f7fc8", "#1d4a86"],
    moons: 1, type: "Каменистая планета",
    desc: "Единственная известная планета с жизнью. 71 % поверхности покрыт водой, атмосферу защищает магнитное поле.",
    majorMoons: [
      { name: "Луна", nameEn: "Moon", periodDays: 27.3, distKm: 384400, relR: 0.273, drawOrbR: 19, color: "#cfcfcf" },
    ],
  },
  {
    name: "Марс", nameEn: "Mars",
    orbitAU: 1.52, periodDays: 687, diameterKm: 6779,
    ecc: 0.093, periAU: 1.381, aphelionAU: 1.666,
        drawR: 7, realRel: 0.53,
    color: "#d1663d", shades: ["#f08a5d", "#c85a34", "#8a3a20"],
    moons: 2, type: "Каменистая планета",
    desc: "«Красная планета» — оксид железа в грунте. Здесь находится самый большой вулкан Солнечной системы — Олимп (≈ 22 км).",
    majorMoons: [
      { name: "Фобос", nameEn: "Phobos", periodDays: 0.319, distKm: 9376, relR: 0.0016, drawOrbR: 12, color: "#a89a8c" },
      { name: "Деймос", nameEn: "Deimos", periodDays: 1.263, distKm: 23463, relR: 0.0009, drawOrbR: 18, color: "#bdb0a2" },
    ],
  },
  {
    name: "Юпитер", nameEn: "Jupiter",
    orbitAU: 5.2, periodDays: 4333, diameterKm: 139820,
    ecc: 0.049, periAU: 4.951, aphelionAU: 5.449,
        drawR: 20, realRel: 11.2,
    color: "#d9a066", shades: ["#eec79a", "#cf9460", "#9a6a40"],
    moons: 95, type: "Газовый гигант",
    desc: "Крупнейшая планета: в неё поместились бы 1300 Земель. Большое красное пятно — шторм больше Земли, бушующий столетиями.",
    majorMoons: [
      { name: "Ио", nameEn: "Io", periodDays: 1.769, distKm: 421700, relR: 0.286, drawOrbR: 28, color: "#e8d174" },
      { name: "Европа", nameEn: "Europa", periodDays: 3.551, distKm: 671034, relR: 0.245, drawOrbR: 35, color: "#d9cbb2" },
      { name: "Ганимед", nameEn: "Ganymede", periodDays: 7.155, distKm: 1070412, relR: 0.413, drawOrbR: 44, color: "#b8a894" },
      { name: "Каллисто", nameEn: "Callisto", periodDays: 16.689, distKm: 1882709, relR: 0.378, drawOrbR: 55, color: "#9d9184" },
    ],
  },
  {
    name: "Сатурн", nameEn: "Saturn",
    orbitAU: 9.58, periodDays: 10759, diameterKm: 116460,
    ecc: 0.057, periAU: 9.041, aphelionAU: 10.118,
        drawR: 17, realRel: 9.45, hasRings: true,
    color: "#e3cf9d", shades: ["#f3e4bd", "#dcc48c", "#ab9260"],
    moons: 146, type: "Газовый гигант",
    desc: "Знаменит кольцами из льда и камней шириной ~280 000 км и толщиной всего десятки метров. Планета легче воды.",
    majorMoons: [
      { name: "Титан", nameEn: "Titan", periodDays: 15.945, distKm: 1221870, relR: 0.404, drawOrbR: 46, color: "#e0b463" },
      { name: "Рея", nameEn: "Rhea", periodDays: 4.518, distKm: 527108, relR: 0.124, drawOrbR: 34, color: "#cfc9c0" },
      { name: "Япет", nameEn: "Iapetus", periodDays: 79.33, distKm: 3560820, relR: 0.098, drawOrbR: 62, color: "#b6ab9c" },
    ],
  },
  {
    name: "Уран", nameEn: "Uranus",
    orbitAU: 19.2, periodDays: 30687, diameterKm: 50724,
    ecc: 0.046, periAU: 18.3, aphelionAU: 20.1,
        drawR: 13, realRel: 4.0,
    color: "#9fdfe6", shades: ["#c9f2f6", "#8ed4dd", "#5aa4b0"],
    moons: 28, type: "Ледяной гигант",
    desc: "Вращается «лёжа на боку» — ось наклонена на 98°. Метан в атмосфере придаёт ему голубовато-зелёный цвет.",
    majorMoons: [
      { name: "Титания", nameEn: "Titania", periodDays: 8.706, distKm: 435910, relR: 0.124, drawOrbR: 26, color: "#c5ccd2" },
      { name: "Оберон", nameEn: "Oberon", periodDays: 13.463, distKm: 583520, relR: 0.119, drawOrbR: 34, color: "#b3bcc4" },
    ],
  },
  {
    name: "Нептун", nameEn: "Neptune",
    orbitAU: 30.05, periodDays: 60190, diameterKm: 49244,
    ecc: 0.011, periAU: 29.8, aphelionAU: 30.3,
        drawR: 12, realRel: 3.88,
    color: "#4a6fdc", shades: ["#7d9bf0", "#4066cc", "#27408f"],
    moons: 16, type: "Ледяной гигант",
    desc: "Самая далёкая планета. Ветры достигают 2100 км/ч — быстрейшие в Солнечной системе. Обнаружен «на кончике пера» (1846 г.).",
    majorMoons: [
      { name: "Тритон", nameEn: "Triton", periodDays: -5.877, distKm: 354759, relR: 0.212, drawOrbR: 28, color: "#cdd8e8" },
    ],
  },
];

/* =========================================================
   АСТЕРОИДНЫЙ ПОЯС — отрисовка (опциональный слой, клавиша B)
   Все тела используют ОДНУ пропорциональную шкалу scaleAUtoPx,
   поэтому пояс (2.22–3.38 а.е.) лежит строго между Марсом
   (1.52 а.е.) и Юпитером (5.2 а.е.) и никогда не пересекает
   их орбиты — как и в реальности.
   ========================================================= */

function beltAUtoPx(aAU) { return scaleAUtoPx(aAU); }

/* Точка на круговой орбите вокруг центра (экранные координаты) */
function circleScreenPoint(fx, fy, rPx, ang, tiltY) {
  return { x: fx + Math.cos(ang) * rPx, y: fy + Math.sin(ang) * rPx * tiltY };
}

function drawBelt(timeSec) {
  if (!state.showBelt) return;
  const cx = W / 2, cy = H / 2;
  ctx.save();
  /* Фоновые камни пояса: движутся по упрощённым круговым орбитам */
  for (const rock of beltRocks) {
    const ang = circleAngle(state.simDays, rock.periodDays, rock.M0);
    const pt = circleScreenPoint(cx, cy, beltAUtoPx(rock.aAU), ang, TILT + rock.tilt);
    if (pt.x < -5 || pt.x > W + 5 || pt.y < -5 || pt.y > H + 5) continue;
    ctx.globalAlpha = rock.alpha * (0.75 + 0.25 * Math.sin(rock.M0 + timeSec * 1.3));
    ctx.fillStyle = `rgb(${rock.gray}, ${rock.gray - 12}, ${rock.gray - 26})`;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, rock.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* Крупнейшие астероиды: видимые тела с подписями и круговыми орбитами */
  for (const a of BELT_ASTEROIDS) {
    const ang = circleAngle(state.simDays, a.periodDays, (a.M0 * Math.PI) / 180);
    const rPx = beltAUtoPx(a.mainAU);
    const pos = circleScreenPoint(cx, cy, rPx, ang, TILT);

    // орбита астероида — пунктирный круг (та же шкала, что у планет)
    if (state.showOrbits) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(a.color, 0.28);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rPx, rPx * TILT, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const R = a.drawR;
    a._screen = { x: pos.x, y: pos.y, r: R };           // для попаданий курсора

    const isSel = state.selected === a;
    const isHov = state.hovered === a;
    if (isSel || isHov) {
      ctx.save();
      ctx.strokeStyle = isSel ? "rgba(255, 215, 106, 0.9)" : "rgba(160, 190, 255, 0.6)";
      ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.setLineDash(isSel ? [] : [3, 4]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R + 6 + Math.sin(timeSec * 4) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // диск астероида: неровный многоугольник с подсветкой со стороны Солнца
    const sunDir = Math.atan2(pos.y - cy, pos.x - cx);
    const g = ctx.createRadialGradient(
      pos.x - Math.cos(sunDir) * R * 0.4, pos.y - Math.sin(sunDir) * R * 0.4, R * 0.15,
      pos.x, pos.y, R * 1.15);
    g.addColorStop(0, "#efe8dc");
    g.addColorStop(0.55, a.color);
    g.addColorStop(1, shadeDown(a.color));
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i <= 9; i++) {
      const th = (i / 9) * Math.PI * 2;
      const rr = R * (0.86 + 0.14 * Math.sin(th * 3 + a.M0));   // лёгкая «камнистость» силуэта
      const px = pos.x + Math.cos(th) * rr;
      const py = pos.y + Math.sin(th) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    if (state.showLabels) {
      ctx.fillStyle = isSel ? "#ffd76a" : "rgba(205, 200, 190, 0.85)";
      ctx.font = (isSel ? "600 " : "") + "11px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(a.name, pos.x, pos.y - R - 6);
    }
  }
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function drawPlanet(p, timeSec) {
  const pos = planetPosition(p);
  const R = planetScreenRadius(p);
  p._screen = { x: pos.x, y: pos.y, r: R }; // для попаданий

  const isSel = state.selected === p;
  const isHov = state.hovered === p;

  // подсветка выбранной/наведённой
  if (isSel || isHov) {
    ctx.save();
    ctx.strokeStyle = isSel ? "rgba(255, 215, 106, 0.9)" : "rgba(160, 190, 255, 0.6)";
    ctx.lineWidth = isSel ? 2 : 1.5;
    ctx.setLineDash(isSel ? [] : [3, 4]);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, R + 7 + Math.sin(timeSec * 4) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // кольца Сатурна (задняя часть)
  if (p.hasRings) drawRings(p, pos, R, "back");

  // тень падения света (от Солнца)
  const sunDir = Math.atan2(pos.y - H / 2, pos.x - W / 2);
  const gx = pos.x - Math.cos(sunDir) * R * 0.45;
  const gy = pos.y - Math.sin(sunDir) * R * 0.45;
  const g = ctx.createRadialGradient(gx, gy, R * 0.15, pos.x, pos.y, R * 1.15);
  g.addColorStop(0, p.shades[0]);
  g.addColorStop(0.55, p.shades[1]);
  g.addColorStop(1, p.shades[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
  ctx.fill();

  // полосы газовых гигантов
  if (p.drawR >= 13 && !state.realScale) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#3a2a18";
    ctx.lineWidth = R * 0.14;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(pos.x - R, pos.y + i * R * 0.36);
      ctx.lineTo(pos.x + R, pos.y + i * R * 0.36);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (p.hasRings) drawRings(p, pos, R, "front");

  if (state.showMoons && p.majorMoons) {
    for (const m of p.majorMoons) {
      const mp = moonPosition(p, m, pos, R);
      m._screen = { x: mp.x, y: mp.y, r: mp.r, planet: p.name }; // для попаданий
    }
  } else if (p.majorMoons) {
    for (const m of p.majorMoons) m._screen = null;
  }

  // крупнейшие луны (опциональный слой): всегда поверх диска планеты
  if (state.showMoons && p.majorMoons) {
    for (const m of p.majorMoons) drawMoon(p, m, pos, R, isSel || isHov);
  }

  // подпись
  if (state.showLabels) {
    ctx.fillStyle = isSel ? "#ffd76a" : "rgba(210, 222, 245, 0.85)";
    ctx.font = (isSel ? "600 " : "") + "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.name, pos.x, pos.y - R - 8);
  }
}

/* ---------- Луны: орбиты, диски, подписи ---------- */
function drawMoon(planet, moon, pos, R, highlight) {
  const mp = moonPosition(planet, moon, pos, R);

  // орбита луны вокруг планеты
  ctx.save();
  ctx.strokeStyle = hexToRgba(moon.color, highlight ? 0.5 : 0.28);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y, mp.orbR, mp.orbR * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // диск луны с подсветкой со стороны планеты/Солнца
  const sunDir = Math.atan2(pos.y - H / 2, pos.x - W / 2);
  const gx = mp.x - Math.cos(sunDir) * mp.r * 0.4;
  const gy = mp.y - Math.sin(sunDir) * mp.r * 0.4;
  const g = ctx.createRadialGradient(gx, gy, mp.r * 0.15, mp.x, mp.y, mp.r * 1.15);
  g.addColorStop(0, "#f2efe9");
  g.addColorStop(0.55, moon.color);
  g.addColorStop(1, shadeDown(moon.color));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(mp.x, mp.y, mp.r, 0, Math.PI * 2);
  ctx.fill();

  // имя — при выборе/наведении на планету или включённых подписях при увеличенном масштабе
  if (highlight || (state.showLabels && planetScreenRadius(planet) >= planet.drawR && R > 12)) {
    ctx.fillStyle = "rgba(200, 210, 235, 0.75)";
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(moon.name, mp.x, mp.y - mp.r - 4);
  }
}

function shadeDown(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * 0.45);
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function drawRings(p, pos, R, part) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(-0.35);
  ctx.scale(1, 0.32);
  ctx.lineWidth = R * 0.42;
  ctx.strokeStyle = "rgba(226, 205, 160, 0.75)";
  ctx.beginPath();
  if (part === "back") ctx.arc(0, 0, R * 1.75, Math.PI, Math.PI * 2);
  else {
    ctx.arc(0, 0, R * 1.75, 0, Math.PI);
  }
  ctx.stroke();
  ctx.lineWidth = R * 0.16;
  ctx.strokeStyle = "rgba(245, 232, 200, 0.5)";
  ctx.beginPath();
  if (part === "back") ctx.arc(0, 0, R * 2.15, Math.PI, Math.PI * 2);
  else ctx.arc(0, 0, R * 2.15, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

/* ---------- Главный цикл ---------- */
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (state.playing) {
    // скорость: множитель; базовая шкала — Earth_year = 20 c
    state.simDays += dt * state.speed * (365.25 / EARTH_YEAR_SECONDS);
  }

  const timeSec = now / 1000;
  drawBackground(timeSec);
  drawOrbits();                          // упрощённые круговые орбиты планет
  drawCometOrbits();                     // эллиптические орбиты комет (пунктир)
  drawBelt(timeSec);                     // астероидный пояс + крупнейшие астероиды
  drawSun(timeSec);
  for (const p of PLANETS) drawPlanet(p, timeSec);
  drawComets(timeSec);                   // кометы: ядро + кома + хвост от Солнца

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- Попадание курсора по планете / луне ---------- */
function pickPlanet(mx, my) {
  let best = null, bestDist = Infinity;
  for (const p of PLANETS) {
    if (!p._screen) continue;
    const d = Math.hypot(mx - p._screen.x, my - p._screen.y);
    const hitR = Math.max(p._screen.r + 6, 14);
    if (d <= hitR && d < bestDist) { best = p; bestDist = d; }
  }
  return best;
}

/* Клик/наведение на луну — возвращаем планету-хозяина + саму луну */
function pickMoon(mx, my) {
  let best = null, bestDist = Infinity;
  for (const p of PLANETS) {
    if (!p.majorMoons) continue;
    for (const m of p.majorMoons) {
      if (!m._screen) continue;
      const d = Math.hypot(mx - m._screen.x, my - m._screen.y);
      const hitR = Math.max(m._screen.r + 5, 10);
      if (d <= hitR && d < bestDist) { best = { moon: m, planet: p }; bestDist = d; }
    }
  }
  return best;
}

/* Попадание курсора по ядру кометы */
function pickComet(mx, my) {
  let best = null, bestDist = Infinity;
  for (const c of COMETS) {
    if (!c._screen) continue;
    const d = Math.hypot(mx - c._screen.x, my - c._screen.y);
    const hitR = Math.max(c._screen.r + 6, 13);
    if (d <= hitR && d < bestDist) { best = c; bestDist = d; }
  }
  return best;
}

/* Попадание курсора по крупнейшему астероиду пояса */
function pickAsteroid(mx, my) {
  let best = null, bestDist = Infinity;
  for (const a of BELT_ASTEROIDS) {
    if (!a._screen) continue;
    const d = Math.hypot(mx - a._screen.x, my - a._screen.y);
    const hitR = Math.max(a._screen.r + 5, 12);
    if (d <= hitR && d < bestDist) { best = a; bestDist = d; }
  }
  return best;
}

function pickAny(mx, my) {
  const pm = pickMoon(mx, my);
  if (pm) return { planet: pm.planet, moon: pm.moon };
  const p = pickPlanet(mx, my);
  if (p) return { planet: p, moon: null };
  const a = state.showBelt ? pickAsteroid(mx, my) : null;
  if (a) return { asteroid: a };
  const c = state.showComets ? pickComet(mx, my) : null;
  if (c) return { comet: c };
  return null;
}

/* ---------- UI: карточка информации ---------- */
const infoPanel  = document.getElementById("infoPanel");
const infoIcon   = document.getElementById("infoIcon");
const infoName   = document.getElementById("infoName");
const infoSize   = document.getElementById("infoSize");
const infoDist   = document.getElementById("infoDist");
const infoPeriod = document.getElementById("infoPeriod");
const infoMoons  = document.getElementById("infoMoons");
const infoType   = document.getElementById("infoType");
const infoDesc   = document.getElementById("infoDesc");

function formatPeriod(days) {
  if (days < 365) return `${Math.round(days)} сут`;
  const years = days / 365.25;
  return `${years.toFixed(years >= 10 ? 1 : 2)} лет (${Math.round(days)} сут)`;
}

/* Карточка информации. Аргументы: планета (+опц. луна) ИЛИ объект-астероид */
function showInfo(p, moon = null, asteroid = null, comet = null) {
  if (comet) {
    const c = comet;
    state.selected = c;
    infoIcon.style.background = `radial-gradient(circle at 32% 30%, #ffffff, ${c.color} 45%, #2a3f66)`;
    infoName.textContent = `${c.name}  ·  ${c.nameEn}`;
    infoSize.textContent = "ядро ≈ 10–37 км (в масштабе не отображается)";
    infoDist.textContent = `перигелий ${c.perihelionAU} / афелий ${c.aphelionAU} а.е. (a = ${c.aAU} а.е.)`;
    infoPeriod.textContent = `${formatPeriod(c.periodDays)} · e=${c.ecc} — сильно вытянутая орбита`;
    infoMoons.textContent = "—";
    infoType.textContent = c.type;
    infoDesc.textContent = c.desc;
    infoPanel.classList.remove("hidden");
    return;
  }
  if (asteroid) {
    const a = asteroid;
    state.selected = a;
    infoIcon.style.background = `radial-gradient(circle at 32% 30%, #efe9df, ${a.color} 55%, ${shadeDown(a.color)})`;
    infoName.textContent = `${a.name}  ·  ${a.nameEn}`;
    infoSize.textContent = `${a.diameterKm.toLocaleString("ru-RU")} км (диаметр)`;
    const peri = a.mainAU * (1 - a.ecc), aph = a.mainAU * (1 + a.ecc);
    infoDist.textContent = `${a.mainAU} а.е. (${Math.round(a.mainAU * 149.6).toLocaleString("ru-RU")} млн км) — большая полуось`;
    infoPeriod.textContent = `${formatPeriod(a.periodDays)} · e=${a.ecc}, перигелий ${peri.toFixed(2)} / афелий ${aph.toFixed(2)} а.е.`;
    infoMoons.textContent = "Главный пояс астероидов";
    infoType.textContent = a.type;
    infoDesc.textContent = a.desc;
    infoPanel.classList.remove("hidden");
    return;
  }
  state.selected = p;
  if (moon) {
    infoIcon.style.background = `radial-gradient(circle at 32% 30%, #f2efe9, ${moon.color} 55%, ${shadeDown(moon.color)})`;
    infoName.textContent = `${moon.name}  ·  ${moon.nameEn}`;
    const diaKm = Math.round(moon.relR * 12742);
    infoSize.textContent = `≈ ${diaKm.toLocaleString("ru-RU")} км (диаметр)`;
    infoDist.textContent = `${moon.distKm.toLocaleString("ru-RU")} км от ${p.name.toLowerCase()}`;
    const retro = moon.periodDays < 0 ? " (ретроградное обращение)" : "";
    infoPeriod.textContent = `${Math.abs(moon.periodDays).toLocaleString("ru-RU", { maximumFractionDigits: 3 })} сут${retro}`;
    infoMoons.textContent = `спутник план. ${p.name}`;
    infoType.textContent = "Естественный спутник";
    infoDesc.textContent = `${moon.name} — естественный спутник планеты ${p.name}. ` +
      `Нажмите на диск ${p.name.toLowerCase()}, чтобы увидеть данные о планете.`;
  } else {
    infoIcon.style.background = `radial-gradient(circle at 32% 30%, ${p.shades[0]}, ${p.shades[1]} 55%, ${p.shades[2]})`;
    infoName.textContent = `${p.name}  ·  ${p.nameEn}`;
    infoSize.textContent = `${p.diameterKm.toLocaleString("ru-RU")} км`;
    infoDist.textContent = `${p.orbitAU} а.е. (${Math.round(p.orbitAU * 149.6).toLocaleString("ru-RU")} млн км)`;
    infoPeriod.textContent = formatPeriod(p.periodDays);
    infoMoons.textContent = p.moons === 0 ? "нет" : String(p.moons);
    infoType.textContent = p.type;
    infoDesc.textContent = p.desc;
  }
  infoPanel.classList.remove("hidden");
}

function hideInfo() {
  state.selected = null;
  infoPanel.classList.add("hidden");
}

document.getElementById("btnCloseInfo").addEventListener("click", hideInfo);

/* ---------- Мышь: наведение, клик, tooltip ---------- */
const tooltip = document.getElementById("tooltip");

canvas.addEventListener("mousemove", (e) => {
  const hit = pickAny(e.clientX, e.clientY);
  state.hovered = hit ? (hit.comet || hit.asteroid || hit.planet) : null;
  canvas.classList.toggle("hovering", !!hit);
  if (hit) {
    tooltip.textContent = hit.comet
      ? `${hit.comet.name} — комета (нажмите для подробностей)`
      : hit.asteroid
      ? `${hit.asteroid.name} — астероид главного пояса (нажмите для подробностей)`
      : hit.moon
      ? `${hit.moon.name} — луна план. ${hit.planet.name} (нажмите для подробностей)`
      : `${hit.planet.name} — нажмите для подробностей`;
    tooltip.style.left = e.clientX + "px";
    tooltip.style.top = e.clientY + "px";
    tooltip.classList.remove("hidden");
  } else {
    tooltip.classList.add("hidden");
  }
});

canvas.addEventListener("mouseleave", () => {
  state.hovered = null;
  tooltip.classList.add("hidden");
});

canvas.addEventListener("click", (e) => {
  const hit = pickAny(e.clientX, e.clientY);
  if (hit && hit.comet) showInfo(null, null, null, hit.comet);
  else if (hit && hit.asteroid) showInfo(null, null, hit.asteroid);
  else if (hit) showInfo(hit.planet, hit.moon);
  else hideInfo();
});

/* Тач-поддержка */
canvas.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  const hit = pickAny(t.clientX, t.clientY);
  if (hit && hit.comet) { showInfo(null, null, null, hit.comet); e.preventDefault(); }
  else if (hit && hit.asteroid) { showInfo(null, null, hit.asteroid); e.preventDefault(); }
  else if (hit) { showInfo(hit.planet, hit.moon); e.preventDefault(); }
}, { passive: true });

/* ---------- Управление: воспроизведение / пауза / скорость ---------- */
const btnPlayPause = document.getElementById("btnPlayPause");
const btnReset     = document.getElementById("btnReset");
const speedSlider  = document.getElementById("speedSlider");
const speedLabel   = document.getElementById("speedLabel");
const presetBtns   = [...document.querySelectorAll(".speed-presets button")];

function updatePlayButton() {
  btnPlayPause.textContent = state.playing ? "⏸ Пауза" : "▶ Играть";
}

function setSpeed(v) {
  state.speed = v;
  speedSlider.value = v;
  speedLabel.textContent = `${v}×`;
  presetBtns.forEach(b => b.classList.toggle("active", parseFloat(b.dataset.speed) === v));
}

btnPlayPause.addEventListener("click", () => {
  state.playing = !state.playing;
  updatePlayButton();
});

btnReset.addEventListener("click", () => {
  state.simDays = 0;
  setSpeed(1);
  state.playing = true;
  updatePlayButton();
  hideInfo();
});

speedSlider.addEventListener("input", () => setSpeed(parseFloat(speedSlider.value)));
presetBtns.forEach(b => b.addEventListener("click", () => setSpeed(parseFloat(b.dataset.speed))));

/* Чекбоксы */
document.getElementById("chkOrbits").addEventListener("change", (e) => state.showOrbits = e.target.checked);
document.getElementById("chkLabels").addEventListener("change", (e) => state.showLabels = e.target.checked);
document.getElementById("chkScale").addEventListener("change", (e) => state.realScale = e.target.checked);
document.getElementById("chkMoons").addEventListener("change", (e) => state.showMoons = e.target.checked);
document.getElementById("chkBelt").addEventListener("change", (e) => {
  state.showBelt = e.target.checked;
  if (!state.showBelt && state.selected && state.selected.mainAU) hideInfo(); // скрыть карточку астероида
});
document.getElementById("chkComets").addEventListener("change", (e) => {
  state.showComets = e.target.checked;
  if (!state.showComets && state.selected && state.selected.aAU) hideInfo();  // скрыть карточку кометы
});

/* Сноска: описание текущей демонстрации */
const footnote = document.getElementById("footnote");
footnote.innerHTML =
  "Демонстрация v1.7: вместо режима «Галактика» — УПРОЩЁННЫЕ КРУГОВЫЕ орбиты с ПРОПОРЦИОНАЛЬНЫМИ " +
  "реальными расстояниями (радиус на экране ∝ число а.е.: Нептун ровно в 77 раз дальше Меркурия). " +
  "Периоды пропорциональны настоящим (Земля = 365 сут ≈ 20 сек при скорости 1×). " +
  "Кометы движутся по реальным ЭЛЛИПТИЧЕСКИМ орбитам: быстрые у Солнца, медленные на окраине, " +
  "хвост всегда направлен от Солнца. Пояс астероидов — строго между Марсом и Юпитером. " +
  "Размеры тел условны; масштаб лунных орбит увеличен.";

/* Горячие клавиши */
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    state.playing = !state.playing;
    updatePlayButton();
  } else if (e.key === "Escape") {
    hideInfo();
  } else if ((e.key === "m" || e.key === "M" || e.key === "ь" || e.key === "Ь") &&
             !e.ctrlKey && !e.metaKey && !e.altKey) {
    state.showMoons = !state.showMoons;
    document.getElementById("chkMoons").checked = state.showMoons;
  } else if ((e.key === "b" || e.key === "B" || e.key === "и" || e.key === "И") &&
             !e.ctrlKey && !e.metaKey && !e.altKey) {
    state.showBelt = !state.showBelt;
    const chk = document.getElementById("chkBelt");
    chk.checked = state.showBelt;
    if (!state.showBelt && state.selected && state.selected.mainAU) hideInfo();
  } else if ((e.key === "c" || e.key === "C" || e.key === "с" || e.key === "С") &&
             !e.ctrlKey && !e.metaKey && !e.altKey) {
    state.showComets = !state.showComets;
    const chk = document.getElementById("chkComets");
    chk.checked = state.showComets;
    if (!state.showComets && state.selected && state.selected.aAU) hideInfo();
  } else if (e.key === "+" || e.key === "=") {
    setSpeed(Math.min(10, +(state.speed + 0.5).toFixed(1)));
  } else if (e.key === "-") {
    setSpeed(Math.max(0, +(state.speed - 0.5).toFixed(1)));
  }
});

setSpeed(1);
updatePlayButton();
