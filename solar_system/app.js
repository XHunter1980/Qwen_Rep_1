"use strict";

/* =========================================================
   Интерактивная демонстрация Солнечной системы
   Canvas 2D: Солнце + 8 планет, клик по планете — карточка
   с фактами, управление: воспроизведение/пауза, скорость.
   ========================================================= */

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
    drawR: 9, realRel: 0.95,
    color: "#e6c47a", shades: ["#f5e0ac", "#dfb877", "#a97f49"],
    moons: 0, type: "Каменистая планета",
    desc: "Самая горячая планета (≈ +465 °C) из-за плотной углекислотной атмосферы и парникового эффекта. Вращается в обратную сторону.",
    majorMoons: [],
  },
  {
    name: "Земля", nameEn: "Earth",
    orbitAU: 1.0, periodDays: 365.25, diameterKm: 12742,
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
    drawR: 12, realRel: 3.88,
    color: "#4a6fdc", shades: ["#7d9bf0", "#4066cc", "#27408f"],
    moons: 16, type: "Ледяной гигант",
    desc: "Самая далёкая планета. Ветры достигают 2100 км/ч — быстрейшие в Солнечной системе. Обнаружен «на кончике пера» (1846 г.).",
    majorMoons: [
      { name: "Тритон", nameEn: "Triton", periodDays: -5.877, distKm: 354759, relR: 0.212, drawOrbR: 28, color: "#cdd8e8" },
    ],
  },
];

/* ---------- Состояние симуляции ---------- */
const EARTH_YEAR_SECONDS = 20;     // 1 земной год = 20 сек при скорости 1×

/* Режим «Галактика»: Солнце движется по галактической орбите,
   планеты — спираль (циклоида) вокруг точки Солнца.
   GALAXY_ORBIT_DAYS: модельные сутки на один виток Солнца вокруг центра Галактики.
   Вихрь 1× подобран так, чтобы за один виток Солнца Земля успевала сделать ~4 оборота
   (реально ≈ 230 млн лет / 365 сут, для наглядности масштаб сжат). */
const GALAXY_ORBIT_DAYS = 1461;    // ≈ 4 земных года на виток Солнца (при вихре 1×)
const GAL_TRIALS_MAX = 900;        // точек в хвосте спирали
const GAL_TRIAL_STRIDE = 2;        // шаг записи точки траектории (в модельных сутках)

const state = {
  playing: true,
  speed: 1,
  simDays: 0,          // модельные сутки
  selected: null,       // выбранная планета
  hovered: null,
  showOrbits: true,
  showLabels: true,
  realScale: false,
  galaxyMode: false,    // режим движения по Галактике
  swirl: 1,             // множитель скорости вихря
  showTrails: true,     // рисовать спиральные траектории
  showMoons: true,      // опциональный слой: крупнейшие луны планет
};

/* ---------- Звёздный фон + галактика ---------- */
let stars = [];
let bgStars = [];   // дальние звёзды Галактики (в координатах галакт. центра)
let dustLanes = []; // пылевые рукава спиральной галактики

function makeStars(w, h) {
  stars = [];
  const count = Math.floor((w * h) / 2600);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.3 + 0.2,
      a: Math.random() * 0.7 + 0.25,
      tw: Math.random() * Math.PI * 2,        // фаза мерцания
      twSpeed: 0.4 + Math.random() * 1.6,
    });
  }

  /* Дальние звёзды для режима «Галактика»: распределены по лог-радиусу
     вокруг галактического центра (0,0 в «галактических» координатах). */
  bgStars = [];
  const viewR = Math.hypot(w, h);
  const nBg = Math.floor((w * h) / 1400);
  for (let i = 0; i < nBg; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rr = viewR * Math.pow(Math.random(), 0.6);
    bgStars.push({
      x: Math.cos(ang) * rr,
      y: Math.sin(ang) * rr * 0.62,           // наклон плоскости Галактики
      r: Math.random() * 1.2 + 0.2,
      a: Math.random() * 0.6 + 0.15,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.3 + Math.random() * 1.4,
    });
  }

  /* Пылевые рукава: логарифмические спирали из «облаков» */
  dustLanes = [];
  const arms = 4;
  for (let a = 0; a < arms; a++) {
    const arm = [];
    const phase = (a / arms) * Math.PI * 2;
    for (let i = 0; i < 90; i++) {
      const t = i / 89;
      const rr = 120 + t * viewR * 1.6;
      const th = phase + t * 3.2;             // закрученность рукава
      arm.push({
        x: Math.cos(th) * rr,
        y: Math.sin(th) * rr * 0.62,
        r: 26 + Math.random() * 60,
        alpha: 0.05 + 0.05 * (1 - t),
        hue: 225 + Math.random() * 50,
      });
    }
    dustLanes.push(arm);
  }
}

/* ---------- Компонновка / размеры ---------- */
let W = 0, H = 0, DPR = 1;

/* Адаптивный радиус галактической орбиты Солнца и zoom:
   орбита Солнца + спираль внешней планеты всегда помещаются на экране.
   Объявлено до resize(), чтобы не зависеть от TDZ. */
let galSunR = 260;
let GALAXY_ZOOM = 0.5;
function updateGalaxyScale() {
  const base = Math.min(W, H) || 800;
  galSunR = base * 0.34;
  const maxOrbR = orbitRadiusGalaxy(PLANETS[PLANETS.length - 1]); // Нептун
  GALAXY_ZOOM = (base * 0.47) / (galSunR + maxOrbR);
}

function resize() {
  DPR = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  makeStars(W, H);
  updateGalaxyScale();
}

window.addEventListener("resize", resize);
resize();

/* ---------- Орбитальные радиусы на экране ----------
   Реальные расстояния сильно сжаты логарифмически, чтобы
   все 8 орбит помещались на экране и были различимы. */
function orbitRadius(planet) {
  const maxR = Math.min(W, H) * 0.46;
  const minR = Math.min(W, H) * 0.085;
  // лог-сжатие: r = k * ln(AU/e) ... удобно нормировать по Нептуну
  const t = Math.log(planet.orbitAU / 0.30) / Math.log(30.05 / 0.30); // 0..1
  return minR + t * (maxR - minR);
}

function planetScreenRadius(planet) {
  if (!state.realScale) return planet.drawR;
  // режим реальных относительных размеров (с ограничителем)
  const earthPx = Math.min(W, H) * 0.012; // "Земля" в пикселях
  return Math.max(1.5, planet.realRel * earthPx);
}

/* ---------- Позиции планет ---------- */
function planetPosition(planet) {
  if (state.galaxyMode) {
    /* Спираль: положение Солнца в галактике + орбитальный цикл вокруг него */
    const w = planetAtTime(planet, state.simDays, scene);
    return toScreen(w.x, w.y, scene);
  }
  const cx = W / 2, cy = H / 2;
  const angle = (state.simDays / planet.periodDays) * Math.PI * 2 + planet.phase;
  const r = orbitRadius(planet);
  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r * 0.62, // лёгкий наклон плоскости эклиптики
    angle, r,
  };
}

// стартовые фазы планет и лун — разбросаны по орбитам (золотой угол)
PLANETS.forEach((p, i) => {
  p.phase = (i * 2.399963) % (Math.PI * 2);
  if (!p.majorMoons) return;
  p.majorMoons.forEach((m, j) => { m.phase = ((j + 1) * 2.399963 + p.phase) % (Math.PI * 2); });
});

/* =========================================================
   РЕЖИМ «ГАЛАКТИКА»: Солнечная система движется вокруг
   центра Галактики, планеты рисуют спираль (циклоиду).
   ========================================================= */

/* Параметры «сцены» для текущего кадра (пересчитываются каждый кадр) */
let scene = null;
function computeScene() {
  if (!state.galaxyMode) {
    scene = { cx: W / 2, cy: H / 2, scale: 1, camX: 0, camY: 0, sunAngle: 0, galaxyDays: 0 };
    return scene;
  }
  const galaxyDays = state.simDays * state.swirl;          // «галактическое время»
  const sunAngle = (galaxyDays / GALAXY_ORBIT_DAYS) * Math.PI * 2;
  const R = galSunR;
  const gx = Math.cos(sunAngle) * R;                       // Солнце в координатах галакт. центра
  const gy = Math.sin(sunAngle) * R * 0.62;                // наклон плоскости Галактики
  const zoom = GALAXY_ZOOM;                                // адаптивный масштаб камеры
  scene = {
    cx: W / 2 - gx * zoom,                                 // экранное положение Солнца
    cy: H / 2 - gy * zoom,
    scale: zoom,
    camX: gx, camY: gy,
    sunAngle, galaxyDays,
  };
  return scene;
}

/* Орбитальный радиус в режиме Галактики: сжатая лог-шкала,
   чтобы спирали внешних планет не перекрывали весь экран. */
function orbitRadiusGalaxy(planet) {
  const maxR = Math.min(W, H) * 0.17;
  const minR = Math.min(W, H) * 0.035;
  const t = Math.log(planet.orbitAU / 0.30) / Math.log(30.05 / 0.30);
  return minR + t * (maxR - minR);
}

/* Аналитическая позиция планеты в момент tDays (спираль/циклоида):
   положение Солнца на галактической орбите в тот момент + орбитальный цикл вокруг него. */
function planetAtTime(planet, tDays) {
  const gDays = tDays * state.swirl;
  const sa = (gDays / GALAXY_ORBIT_DAYS) * Math.PI * 2;
  const solx = Math.cos(sa) * galSunR;
  const soly = Math.sin(sa) * galSunR * 0.62;
  const ang = (tDays / planet.periodDays) * Math.PI * 2 + planet.phase;
  const r = orbitRadiusGalaxy(planet);
  return {
    x: solx + Math.cos(ang) * r,
    y: soly + Math.sin(ang) * r * 0.62,
  };
}

function toScreen(px, py, sc) {
  return { x: sc.cx + px * sc.scale, y: sc.cy + py * sc.scale };
}

/* ---------- Позиции лун (опциональный слой) ----------
   Луна обращается вокруг планеты: угол = 2π * simDays / periodDays.
   Отрицательный период (Тритон) — ретроградное обращение. */
const MOON_ZOOM = 1.5; // визуальное усиление масштаба спутниковой системы

function moonPosition(planet, moon, pos, R) {
  const scale = planetScreenRadius(planet) / planet.drawR; // множитель реальных размеров
  const ang = (state.simDays / moon.periodDays) * Math.PI * 2 + moon.phase;
  const orbR = Math.max(R + 4, moon.drawOrbR * scale * MOON_ZOOM);
  return {
    x: pos.x + Math.cos(ang) * orbR,
    y: pos.y + Math.sin(ang) * orbR * 0.62, // тот же наклон плоскости, что и у орбит
    r: Math.max(1.3, moon.relR * R),
    orbR,
  };
}

/* ---------- Отрисовка ---------- */
function drawBackground(timeSec) {
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, W, H);

  if (state.galaxyMode) {
    drawGalaxyBackdrop(timeSec);
    return;
  }

  for (const s of stars) {
    const alpha = s.a * (0.7 + 0.3 * Math.sin(s.tw + timeSec * s.twSpeed));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* Фон галактики: ядро, спиральные рукава, дальние звёзды.
   Всё привязано к галактическому центру и движется вместе с камерой. */
function drawGalaxyBackdrop(timeSec) {
  const sc = scene;
  // галактический центр на экране
  const gc = toScreen(0, 0, sc);
  const viewR = Math.hypot(W, H);

  // спиральные пылевые рукава (мягкие облака)
  for (const arm of dustLanes) {
    for (const c of arm) {
      const p = toScreen(c.x, c.y, sc);
      if (p.x < -100 || p.x > W + 100 || p.y < -100 || p.y > H + 100) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, c.r);
      g.addColorStop(0, `hsla(${c.hue}, 60%, 60%, ${c.alpha})`);
      g.addColorStop(1, "hsla(230, 60%, 50%, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ядро Галактики
  const coreR = viewR * 0.16;
  let g = ctx.createRadialGradient(gc.x, gc.y, 0, gc.x, gc.y, coreR);
  g.addColorStop(0, "rgba(255, 236, 190, 0.55)");
  g.addColorStop(0.35, "rgba(255, 200, 130, 0.22)");
  g.addColorStop(1, "rgba(255, 180, 110, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(gc.x, gc.y, coreR, 0, Math.PI * 2);
  ctx.fill();

  // дальние звёзды
  ctx.fillStyle = "#ffffff";
  for (const s of bgStars) {
    const p = toScreen(s.x, s.y, sc);
    if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
    const alpha = s.a * (0.7 + 0.3 * Math.sin(s.tw + timeSec * s.twSpeed));
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // орбита Солнца вокруг центра Галактики
  ctx.save();
  ctx.strokeStyle = "rgba(140, 190, 255, 0.3)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.ellipse(gc.x, gc.y, galSunR * sc.scale, galSunR * 0.62 * sc.scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // маркер центра Галактики (стрелка, если за пределами экрана)
  drawGalaxyCenterMarker(gc);
}

function drawGalaxyCenterMarker(gc) {
  const m = 30;
  const inside = gc.x > m && gc.x < W - m && gc.y > m && gc.y < H - m;
  ctx.save();
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  if (inside) {
    ctx.fillStyle = "rgba(255, 215, 150, 0.85)";
    ctx.beginPath();
    ctx.arc(gc.x, gc.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText("⌾ Центр Галактики", gc.x, gc.y - 10);
  } else {
    // стрелка к центру на краю экрана
    const cx = W / 2, cy = H / 2;
    const a = Math.atan2(gc.y - cy, gc.x - cx);
    const ex = cx + Math.cos(a) * (Math.min(W, H) / 2 - 46);
    const ey = cy + Math.sin(a) * (Math.min(W, H) / 2 - 46);
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.fillStyle = "rgba(255, 215, 150, 0.8)";
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-a);
    ctx.fillText("Центр Галактики", 0, 22);
  }
  ctx.restore();
}

function drawSun(timeSec) {
  const cx = scene.cx, cy = scene.cy;
  const pulse = 1 + 0.03 * Math.sin(timeSec * 2);
  const R = SUN.drawR * (state.galaxyMode ? 0.7 : 1) * pulse;

  // внешнее свечение
  let g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 4.2);
  g.addColorStop(0, "rgba(255,200,90,0.55)");
  g.addColorStop(0.4, "rgba(255,150,50,0.18)");
  g.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 4.2, 0, Math.PI * 2);
  ctx.fill();

  // диск
  g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.1, cx, cy, R);
  g.addColorStop(0, "#fff3c4");
  g.addColorStop(0.55, "#ffd465");
  g.addColorStop(1, "#ff9d3c");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  if (state.showLabels) {
    ctx.fillStyle = "rgba(255, 225, 150, 0.9)";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Солнце", cx, cy + R + 16);
  }
}

function drawOrbits() {
  const sc = scene;
  if (state.galaxyMode) {
    /* В режиме Галактики вместо эллипсов — «живые» спиральные траектории */
    if (!state.showTrails || !state.showOrbits) return;
    ctx.save();
    ctx.lineWidth = 1.2;
    for (const p of PLANETS) {
      ctx.strokeStyle = hexToRgba(p.color, 0.5);
      ctx.beginPath();
      let started = false;
      // хвост спирали: последние GAL_TRIALS_MAX точек назад по времени
      for (let i = GAL_TRIALS_MAX; i >= 0; i--) {
        const tDays = sc ? state.simDays - i * GAL_TRIAL_STRIDE : 0;
        if (tDays < 0) continue;
        const w = planetAtTime(p, tDays, sc);
        const s = toScreen(w.x, w.y, sc);
        if (!started) { ctx.moveTo(s.x, s.y); started = true; }
        else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (!state.showOrbits) return;
  const cx = W / 2, cy = H / 2;
  ctx.save();
  ctx.strokeStyle = "rgba(140, 165, 220, 0.22)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  for (const p of PLANETS) {
    const r = orbitRadius(p);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* Траектория-спираль выбранной планеты (яркая, с градиентом затухания) */
function drawSelectedTrail(p) {
  if (!state.galaxyMode || !state.showTrails) return;
  const sc = scene;
  ctx.save();
  ctx.lineWidth = 2;
  const STEPS = 160;
  const span = GAL_TRIALS_MAX * GAL_TRIAL_STRIDE; // суммарный охват в сутках
  for (let i = 0; i < STEPS; i++) {
    const t0 = state.simDays - span * (1 - i / STEPS);
    const t1 = state.simDays - span * (1 - (i + 1) / STEPS);
    if (t1 < 0 || t0 < 0) continue;
    const a = planetAtTime(p, Math.max(0, t0), sc);
    const b = planetAtTime(p, Math.max(0, t1), sc);
    const sa = toScreen(a.x, a.y, sc), sb = toScreen(b.x, b.y, sc);
    ctx.strokeStyle = hexToRgba(p.color, 0.15 + 0.75 * (i / STEPS));
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlanet(p, timeSec) {
  const pos = planetPosition(p);
  let R = planetScreenRadius(p);
  if (state.galaxyMode) R *= scene.scale;        // планеты масштабируются вместе со сценой
  p._screen = { x: pos.x, y: pos.y, r: R }; // для попаданий

  const isSel = state.selected === p;
  const isHov = state.hovered === p;

  // яркая спиральная траектория выбранной планеты
  if (isSel) drawSelectedTrail(p);

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
  const sunDir = Math.atan2(pos.y - scene.cy, pos.x - scene.cx);
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
  const sunDir = Math.atan2(pos.y - scene.cy, pos.x - scene.cx);
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

  computeScene();                        // камера/спирали для текущего кадра
  const timeSec = now / 1000;
  drawBackground(timeSec);
  drawOrbits();
  drawSun(timeSec);
  for (const p of PLANETS) drawPlanet(p, timeSec);
  if (state.galaxyMode) drawGalaxyHud();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* HUD в режиме Галактики: счётчик витков и пройденного пути */
function drawGalaxyHud() {
  const sc = scene;
  const turns = sc.galaxyDays / GALAXY_ORBIT_DAYS;
  ctx.save();
  ctx.font = "12px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(150, 200, 255, 0.9)";
  ctx.fillText(`🌌 Виток Солнца вокруг центра Галактики: ${turns.toFixed(2)}`, 20, H - 92);
  ctx.fillStyle = "rgba(120, 160, 220, 0.75)";
  ctx.fillText("Траектории планет — спирали: система движется, планеты вращаются", 20, H - 74);
  ctx.restore();
}

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

function pickAny(mx, my) {
  const pm = pickMoon(mx, my);
  if (pm) return { planet: pm.planet, moon: pm.moon };
  const p = pickPlanet(mx, my);
  if (p) return { planet: p, moon: null };
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

function showInfo(p, moon = null) {
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
  state.hovered = hit ? hit.planet : null;
  canvas.classList.toggle("hovering", !!hit);
  if (hit) {
    tooltip.textContent = hit.moon
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
  if (hit) showInfo(hit.planet, hit.moon);
  else hideInfo();
});

/* Тач-поддержка */
canvas.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  const hit = pickAny(t.clientX, t.clientY);
  if (hit) { showInfo(hit.planet, hit.moon); e.preventDefault(); }
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

/* ---------- Режим «Галактика»: переключение и управление вихрем ---------- */
const btnMode       = document.getElementById("btnMode");
const galaxyBlock   = document.getElementById("galaxyBlock");
const swirlSlider   = document.getElementById("swirlSlider");
const swirlLabel    = document.getElementById("swirlLabel");
const chkTrails     = document.getElementById("chkTrails");
const topHint       = document.querySelector(".topbar .hint");
const footnote      = document.getElementById("footnote");

function setGalaxyMode(on) {
  state.galaxyMode = on;
  btnMode.classList.toggle("active", on);
  btnMode.textContent = on ? "☀️ Классика" : "🌌 Галактика";
  galaxyBlock.classList.toggle("hidden", !on);
  topHint.textContent = on
    ? "Солнечная система летит вокруг центра Галактики — траектории планет закручиваются в спирали"
    : "Нажмите на планету или луну, чтобы узнать о ней больше";
  footnote.innerHTML = on
    ? "Режим «Галактика»: Солнце движется по галактической орбите, планеты — спираль (циклоида). " +
      "Реальный галактический год ≈ 230 млн земных лет; для наглядности масштаб времени сжат. " +
      "Масштаб лунных орбит условно увеличен."
    : "Демонстрация: орбитальные периоды пропорциональны реальным (Земля = 365 сут ≈ 20 сек при скорости 1×). " +
      "Расстояния и размеры условны для наглядности. Масштаб лунных орбит условно увеличен.";
}

btnMode.addEventListener("click", () => setGalaxyMode(!state.galaxyMode));

function setSwirl(v) {
  state.swirl = v;
  swirlSlider.value = v;
  swirlLabel.textContent = `${(+v.toFixed(1))}×`;
}
swirlSlider.addEventListener("input", () => setSwirl(parseFloat(swirlSlider.value)));
chkTrails.addEventListener("change", (e) => state.showTrails = e.target.checked);

/* Горячие клавиши */
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    state.playing = !state.playing;
    updatePlayButton();
  } else if (e.key === "Escape") {
    hideInfo();
  } else if ((e.key === "g" || e.key === "G" || e.key === "п" || e.key === "П") &&
             !e.ctrlKey && !e.metaKey && !e.altKey) {
    setGalaxyMode(!state.galaxyMode);
  } else if ((e.key === "m" || e.key === "M" || e.key === "ь" || e.key === "Ь") &&
             !e.ctrlKey && !e.metaKey && !e.altKey) {
    state.showMoons = !state.showMoons;
    document.getElementById("chkMoons").checked = state.showMoons;
  } else if (e.key === "+" || e.key === "=") {
    setSpeed(Math.min(10, +(state.speed + 0.5).toFixed(1)));
  } else if (e.key === "-") {
    setSpeed(Math.max(0, +(state.speed - 0.5).toFixed(1)));
  }
});

setSpeed(1);
setSwirl(1);
updatePlayButton();
