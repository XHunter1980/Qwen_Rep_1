"use strict";

/* =========================================================
   Интерактивная демонстрация Солнечной системы
   Canvas 2D: Солнце + 8 планет, клик по планете — карточка
   с фактами, управление: воспроизведение/пауза, скорость.
   ========================================================= */

/* Версия сборки — видна в заголовке страницы, в шапке и в консоли,
   чтобы по открытой страничке сразу было понятно, какая сборка запущена. */
const VERSION = "v2.1 (Кометы замедлены до единой шкалы с планетами: 1 год = 20 сек при 1×; Галлея ≈ 25 мин, Энке ≈ 66 с)";
document.title = `Солнечная система ${VERSION}`;
console.log(`%c☀️ Солнечная система — сборка: ${VERSION}`, "color:#ffd75e;font-weight:bold");
/* Бейдж версии в шапке страницы */
{
  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = VERSION;
}

const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");

/* =========================================================
   БАЗОВЫЕ КОНСТАНТЫ И СОСТОЯНИЕ ДЕМО
   ========================================================= */

const EARTH_YEAR_SECONDS = 20;   // земной год ≈ 20 секунд при скорости 1×
const TILT = 0.42;               // «наклон» плоскости эклиптики: круги выглядят эллипсами
let W = 0, H = 0;                // размеры холста (обновляются при resize)

/* Состояние демонстрации: воспроизведение, скорость, слои, выбор/наведение */
const state = {
  playing: true,
  speed: 1,
  simDays: 0,                    // модельное время в сутках от старта
  orbitMode: "ellipse",          // "ellipse" — эллипсы Кеплера (Солнце в фокусе)
                                 // "circle"  — упрощённые круговые орбиты
  showOrbits: true,
  showLabels: true,
  realScale: false,
  showMoons: true,
  showBelt: true,
  showComets: true,
  selected: null,
  hovered: null,
};

/* ---------- ЛОГАРИФМИЧЕСКАЯ шкала расстояний ----------
   Линейная шкала «съедает» внутреннюю систему: при видимом Нептуне
   (30 а.е.) Меркурий–Марс слипались в точку у Солнца. Степенная
   шкала r ∝ a^P (P = 0.52) сжимает внешние области и растягивает
   внутренние: между орбитами Земли и Марса теперь заметный зазор,
   пояс астероидов читается отдельно от Марса и Юпитера.
   Порядок тел и отсутствие пересечений сохраняются (шкала монотонна). */
const SCALE_POW = 0.52;
const AU_MAX = 30.05;                                  // орбита Нептуна
function availPx() {
  // полуширина / «глубина» эллипсов под размер окна
  return Math.min(W / 2 - 46, (H / 2 - 34) / TILT);
}
function scaleAUtoPx(aAU) {
  return Math.pow(aAU / AU_MAX, SCALE_POW) * availPx();
}

/* Угол тела на КРУГОВОЙ орбите: полный оборот за periodDays суток */
function circleAngle(simDays, periodDays, phase0) {
  return ((simDays / Math.abs(periodDays)) * Math.PI * 2 + phase0) % (Math.PI * 2);
}

/* Позиция планеты — зависит от выбранного режима орбит:
   • "ellipse" — РЕАЛЬНЫЙ эллипс Кеплера (a, e из данных планет, без
     преувеличений), Солнце строго в ФОКУСЕ; движение неравномерно:
     быстрее в перигелии, медленнее в афелии (II закон Кеплера).
   • "circle"  — упрощённая круговая орбита с радиусом = a, Солнце в центре. */
function planetPosition(p) {
  if (state.orbitMode === "circle") {
    const rPx = scaleAUtoPx(p.orbitAU);
    return circleScreenPoint(W / 2, H / 2, rPx,
      circleAngle(state.simDays, p.periodDays, p.phase0), TILT);
  }
  // Эллипс Кеплера: большая полуось a и эксцентриситет e — реальные.
  // Средней аномалией M служит угол обращения по времени (линейно растёт
  // со временем — это и есть «равномерное усреднённое» движение).
  const aPx = scaleAUtoPx(p.orbitAU);
  const bPx = aPx * Math.sqrt(1 - p.ecc * p.ecc);
  const Mraw = circleAngle(state.simDays, p.periodDays, p.phase0);
  const E = keplerSolve(((Mraw + Math.PI) % (Math.PI * 2)) - Math.PI, p.ecc);
  const ox = Math.cos(E) * aPx - aPx * p.ecc;   // фокус (Солнце) в начале координат
  const oy = Math.sin(E) * bPx;
  const w = (p.omegaDeg * Math.PI) / 180;       // ориентация эллипса на плоскости
  const rx = ox * Math.cos(w) - oy * Math.sin(w);
  const ry = (ox * Math.sin(w) + oy * Math.cos(w)) * TILT;
  return { x: W / 2 + rx, y: H / 2 + ry };
}

/* Экранное расстояние планеты от центра (для попаданий и подписей) */
function planetScreenRadius(p) {
  if (!state.realScale) return p.drawR;
  // режим относительных реальных размеров: радиус ∝ реальному размеру тела
  const earthPx = 4;
  return Math.max(1.6, Math.min(p.realRel * earthPx, 40));
}

/* Позиция луны вокруг планеты (масштаб лунных орбит увеличен условно) */
function moonPosition(planet, moon, pos, R) {
  const ang = circleAngle(state.simDays, moon.periodDays, moon.phase0 || 0);
  const orbR = moon.drawOrbR + R * 0.5;
  return {
    x: pos.x + Math.cos(ang) * orbR,
    y: pos.y + Math.sin(ang) * orbR * 0.62,
    r: Math.max(1.8, moon.relR * (R > 0 ? Math.max(R * 0.45, 4) : 4)),
    orbR,
  };
}

/* Позиция кометы: РЕАЛЬНАЯ эллиптическая орбита Кеплера, Солнце — в фокусе.
   Решаем уравнение Кеплера M = E − e·sinE методом Ньютона, затем
   x = a(cosE − e), y = b·sinE (перигелий при x > 0). */
function keplerSolve(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  return E;
}

function cometPosition(c) {
  const aPx = cometAPx(c);                       // экранная полуось (не за край экрана)
  const bPx = aPx * Math.sqrt(1 - c.ecc * c.ecc);
  /* Демонстрационная шкала: тот же темп, что у планет (1 год = 20 сек при 1×);
     пропорции реальных периодов сохранены. */
  const periodSec = c.periodYr * DEMO_COMET_YEAR_SECONDS;
  const M = ((performance.now() / 1000) * state.speed / periodSec) * Math.PI * 2
            + (c.phase || 0);
  const E = keplerSolve(((M + Math.PI) % (Math.PI * 2)) - Math.PI, c.ecc);
  // координаты в плоскости орбиты (фокус — Солнце — в центре экрана)
  const ox = Math.cos(E) * aPx - aPx * c.ecc;      // ось к перигелию
  const oy = Math.sin(E) * bPx;
  // поворот на долготу перигелия ω и «наклон» вида сверху вниз
  const w = (c.omegaDeg * Math.PI) / 180;
  const rx = ox * Math.cos(w) - oy * Math.sin(w);
  const ry = (ox * Math.sin(w) + oy * Math.cos(w)) * TILT;
  return { x: W / 2 + rx, y: H / 2 + ry };
}

/* Позиция астероида главного пояса: круговая орбита (пояс близок к круговому) */
function asteroidPosition(a) {
  const rPx = beltAUtoPx(a.mainAU);
  return circleScreenPoint(W / 2, H / 2, rPx,
    circleAngle(state.simDays, a.periodDays, (a.M0 * Math.PI) / 180), TILT);
}

/* ---------- Размер холста ---------- */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

/* ---------- Фоновые звёзды (генерируются один раз) ---------- */
const STARS = [];
for (let i = 0; i < 260; i++) {
  STARS.push({
    x: Math.random(), y: Math.random(),       // доли экрана — переживают resize
    r: Math.random() * 1.3 + 0.3,
    tw: Math.random() * Math.PI * 2,          // фаза мерцания
    sp: 0.4 + Math.random() * 1.6,            // скорость мерцания
  });
}

function drawBackground(timeSec) {
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, W, H);
  // лёгкая туманность
  const neb = ctx.createRadialGradient(W * 0.75, H * 0.25, 0, W * 0.75, H * 0.25, W * 0.5);
  neb.addColorStop(0, "rgba(60, 40, 110, 0.14)");
  neb.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, W, H);
  for (const s of STARS) {
    const a = 0.35 + 0.65 * Math.abs(Math.sin(s.tw + timeSec * s.sp));
    ctx.globalAlpha = a;
    ctx.fillStyle = "#dfe7ff";
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- Орбиты планет: два режима ----------
   • "ellipse" — реальные эллипсы Кеплера (без преувеличения e),
     центр эллипса смещён от Солнца на c = a·e: Солнце — в ФОКУСЕ.
   • "circle"  — упрощённые окружности радиуса a вокруг Солнца. */
function drawOrbits() {
  if (!state.showOrbits) return;
  ctx.save();
  ctx.strokeStyle = "rgba(140, 160, 210, 0.22)";
  ctx.lineWidth = 1;
  for (const p of PLANETS) {
    const aPx = scaleAUtoPx(p.orbitAU);
    if (state.orbitMode === "circle") {
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, aPx, aPx * TILT, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const bPx = aPx * Math.sqrt(1 - p.ecc * p.ecc);
      const w = (p.omegaDeg * Math.PI) / 180;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(w);
      // центр эллипса смещён от фокуса (Солнца) на −a·e по оси перигелия
      ctx.beginPath();
      ctx.ellipse(-aPx * p.ecc, 0, aPx, bPx * TILT, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

/* ---------- Солнце с пульсирующим свечением ---------- */
function drawSun(timeSec) {
  const cx = W / 2, cy = H / 2;
  const pulse = 1 + 0.05 * Math.sin(timeSec * 1.7);
  const baseR = state.realScale ? Math.max(SUN.realRel * 0.55, 26) : SUN.drawR;
  const R = baseR * pulse;
  const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 4.2);
  halo.addColorStop(0, "rgba(255, 210, 110, 0.55)");
  halo.addColorStop(0.4, "rgba(255, 170, 60, 0.16)");
  halo.addColorStop(1, "rgba(255, 150, 40, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 4.2, 0, Math.PI * 2);
  ctx.fill();
  const core = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
  core.addColorStop(0, "#fff8e0");
  core.addColorStop(0.55, "#ffd75e");
  core.addColorStop(1, "#ff9d33");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  if (state.showLabels) {
    ctx.fillStyle = "rgba(255, 225, 150, 0.9)";
    ctx.font = "600 12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Солнце", cx, cy + R + 16);
  }
}

/* ---------- Кометы: данные, орбиты и отрисовка ----------
   Реальные параметры: a — большая полуось, ecc — эксцентриситет,
   период T = a^1.5 лет (III закон Кеплера), omegaDeg — долгота перигелия. */
/* Демонстрационная шкала времени комет: 1 условный «год» кометы = 20 сек
   (та же базовая шкала, что у планет: Земля 365 сут ≈ 20 сек при 1×).
   Виток Галлея (75 лет) ≈ 25 минут, Энке (3.3 года) ≈ 66 секунд; ПРОПОРЦИИ
   реальных периодов сохранены — Энке обгоняет Галлею ровно в 23 раза. */
const DEMO_COMET_YEAR_SECONDS = EARTH_YEAR_SECONDS;

/* Экранная большая полуось кометы: та же степенная шкала, что у планет,
   но не дальше края экрана (у сильно вытянутых эллипсов дальняя точка
   афелия может выходить за холст). */
function cometAPx(c) {
  const maxR = Math.min(W, H) * 0.5 - 14;
  return Math.min(scaleAUtoPx(c.aAU), maxR);
}

const COMETS = [
  {
    name: "Комета Галлея", nameEn: "1P/Halley",
    aAU: 17.83, ecc: 0.967, periodYr: 75.3, perihelionAU: 0.59, aphelionAU: 35.1, omegaDeg: 112, phase: 4.2,
    color: "#bfe3ff", type: "Короткопериодическая комета (семья Юпитера)",
    desc: "Знаменитейшая комета: возвращается к Земле каждые ~76 лет, наблюдалась более 2000 лет (1059 г. н.э.). Ядро ~15 км, масса 2.2·10¹⁴ т. Последний визит — 1986 г., следующий — 2061 г.",
  },
  {
    name: "Комета Гейла-Боппа", nameEn: "C/1995 O1 Hale-Bopp",
    aAU: 173, ecc: 0.995, periodYr: 7470, perihelionAU: 0.87, aphelionAU: 345, omegaDeg: 282, phase: 5.5,
    color: "#d8f0ff", type: "Длиннопериодическая комета (облако Оорта)",
    desc: "Одна из самых наблюдаемых комет XX века (1997 г.): видна невооружённым глазом 18 месяцев, период ~7470 лет, ядро ~60–80 км.",
  },
  {
    name: "Комета Энке", nameEn: "2P/Encke",
    aAU: 2.21, ecc: 0.848, periodYr: 3.3, perihelionAU: 0.34, aphelionAU: 4.08, omegaDeg: 186, phase: 0.6,
    color: "#cfe8ff", type: "Короткопериодическая комета (самая короткая из известных)",
    desc: "Период всего 3.3 года — рекорд среди комет. Источник метеорного потока Тауриды; орбита выдаётся далеко за Юпитер.",
  },
  {
    name: "Комета NEOWISE", nameEn: "C/2020 F3 (NEOWISE)",
    aAU: 355, ecc: 0.998, periodYr: 6800, perihelionAU: 0.69, aphelionAU: 709, omegaDeg: 61, phase: 5.9,
    color: "#e6f4ff", type: "Длиннопериодическая комета",
    desc: "Яркая комета лета 2020 года — первая, видимая с Земли невооружённым глазом с 1997 года. Прошла 0.69 а.е. от Земли, период около 6800 лет.",
  },
];

function drawCometOrbits() {
  if (!state.showComets || !state.showOrbits) return;
  ctx.save();
  ctx.strokeStyle = "rgba(150, 190, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  for (const c of COMETS) {
    const aPx = cometAPx(c);
    const w = (c.omegaDeg * Math.PI) / 180;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(w);
    ctx.scale(1, TILT);
    ctx.beginPath();
    // центр эллипса смещён от фокуса (Солнца) на c = a·e
    ctx.arc(-aPx * c.ecc, 0, aPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawComets(timeSec) {
  if (!state.showComets) return;
  const cx = W / 2, cy = H / 2;
  /* Обратная степенной шкале функция: экранное расстояние → а.е. */
  const toAU = (px) => AU_MAX * Math.pow(px / availPx(), 1 / SCALE_POW);
  for (const c of COMETS) {
    const pos = cometPosition(c);
    // расстояние до Солнца в а.е. (в плоскости орбиты, без учёта наклона вида)
    const rAU = toAU(Math.hypot(pos.x - cx, (pos.y - cy) / TILT));
    const R = 2.6;                                               // ядро (в масштабе не отображается)
    c._screen = { x: pos.x, y: pos.y, r: Math.max(R, 8) };

    // яркость и длина хвоста растут при приближении к Солнцу (активность комет)
    const act = Math.max(0, Math.min(1, 3.2 / (rAU + 0.6)));     // ~1 у Солнца, → 0 на окраине
    if (act <= 0.03) {
      ctx.fillStyle = hexToRgba(c.color, 0.5);                   // далеко — лишь тусклое ядро
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const tailLen = 40 + act * 190;
    const dirX = pos.x - cx, dirY = pos.y - cy;
    const dl = Math.hypot(dirX, dirY) || 1;
    const tx = pos.x + (dirX / dl) * tailLen;
    const ty = pos.y + (dirY / dl) * tailLen;

    // хвост направлен прочь от Солнца: ионный + пылевой
    const grad = ctx.createLinearGradient(pos.x, pos.y, tx, ty);
    grad.addColorStop(0, hexToRgba(c.color, 0.85 * act));
    grad.addColorStop(0.35, hexToRgba("#9fc8ff", 0.35 * act));
    grad.addColorStop(1, "rgba(160, 200, 255, 0)");
    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineCap = "round";
    ctx.lineWidth = 3 + act * 10;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.lineWidth = 1.5 + act * 4;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(tx + (dirY / dl) * tailLen * 0.12, ty - (dirX / dl) * tailLen * 0.12);
    ctx.stroke();
    ctx.restore();

    // кома — светящееся облако газа вокруг ядра
    const comaR = 4 + act * 14;
    const coma = ctx.createRadialGradient(pos.x, pos.y, 0.5, pos.x, pos.y, comaR);
    coma.addColorStop(0, `rgba(255,255,255,${0.9 * act})`);
    coma.addColorStop(0.4, hexToRgba(c.color, 0.5 * act));
    coma.addColorStop(1, "rgba(160, 200, 255, 0)");
    ctx.fillStyle = coma;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, comaR, 0, Math.PI * 2);
    ctx.fill();

    // ядро
    ctx.fillStyle = "#eef6ff";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
    ctx.fill();

    // подсветка выбора/наведения
    const isSel = state.selected === c, isHov = state.hovered === c;
    if (isSel || isHov) {
      ctx.save();
      ctx.strokeStyle = isSel ? "rgba(255, 215, 106, 0.9)" : "rgba(160, 190, 255, 0.6)";
      ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.setLineDash(isSel ? [] : [3, 4]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, comaR + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (state.showLabels && (act > 0.15 || isSel || isHov)) {
      ctx.fillStyle = isSel ? "#ffd76a" : "rgba(200, 220, 250, 0.85)";
      ctx.font = (isSel ? "600 " : "") + "11px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(c.name.replace("Комета ", ""), pos.x, pos.y - comaR - 8);
    }
  }
}

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

/* Начальные фазы планет — фиксированные, чтобы картина была стабильной.
   omegaDeg — долгота перигелия (ориентация эллипса на плоскости эклиптики),
   условно разнесена по планетам, чтобы перигелии не выстроились в одну линию. */
const OMEGA_DEG = [77, 131, 102, 336, 14, 93, 173, 48];   // ≈ реальные долготы перигелия
PLANETS.forEach((p, i) => { p.phase0 = (i * 0.9) % (Math.PI * 2); p.omegaDeg = OMEGA_DEG[i]; });

/* =========================================================
   АСТЕРОИДНЫЙ ПОЯС — отрисовка (опциональный слой, клавиша B)
   Все тела используют ОДНУ шкалу scaleAUtoPx, поэтому пояс
   (2.22–3.38 а.е.) лежит строго между Марсом (1.52 а.е.) и
   Юпитером (5.2 а.е.) и никогда не пересекает их орбиты —
   как и в реальности.
   ========================================================= */

function beltAUtoPx(aAU) { return scaleAUtoPx(aAU); }

/* Крупнейшие астероиды главного пояса — реальные параметры:
   mainAU — большая полуось, ecc — эксцентриситет, periodDays — период обращения. */
const BELT_ASTEROIDS = [
  {
    name: "Церера", nameEn: "1 Ceres",
    mainAU: 2.77, ecc: 0.079, periodDays: 1655, diameterKm: 946, M0: 120, omegaDeg: 73, drawR: 5,
    color: "#b9b3a8", type: "Карликовая планета (главный пояс)",
    desc: "Крупнейший объект пояса астероидов и единственная карликовая планета внутри орбиты Нептуна. Содержит ~1/3 массы всего пояса; на поверхности — криовулканы и солёные отложения.",
  },
  {
    name: "Веста", nameEn: "4 Vesta",
    mainAU: 2.36, ecc: 0.089, periodDays: 1321, diameterKm: 525, M0: 40, omegaDeg: 151, drawR: 4,
    color: "#cfc6b8", type: "Астероид протопланетного типа",
    desc: "Второй по массе астероид пояса, дифференцированное тело с корой и ядром. Кратер Реясилиуса на южном полюсе — один из крупнейших в Солнечной системе; её осколки падают на Землю как метеориты HED.",
  },
  {
    name: "Паллада", nameEn: "2 Pallas",
    mainAU: 2.77, ecc: 0.231, periodDays: 1686, diameterKm: 512, M0: 250, omegaDeg: 325, drawR: 4,
    color: "#a9a29b", type: "Астероид B-класса (углеродистый)",
    desc: "Третье по размеру тело пояса с необычно сильным наклонением орбиты — 34.8°. Предположительно остаток «строительного блока» планет, не вошедшего в Юпитер.",
  },
  {
    name: "Гигия", nameEn: "10 Hygiea",
    mainAU: 3.14, ecc: 0.117, periodDays: 2032, diameterKm: 434, M0: 310, omegaDeg: 312, drawR: 3.5,
    color: "#9aa0a6", type: "Астероид C-класса (самый тёмный тип)",
    desc: "Четвёртое по размеру тело пояса, почти шароидное — кандидат в карликовые планеты. Поверхность из тёмных углеродистых пород; период вращения ~28 часов.",
  },
];

/* Фоновые камни пояса (~520): распределены между Марсом и Юпитером
   (2.22–3.38 а.е.), периоды по III закону Кеплера T = a^1.5 лет. */
const beltRocks = [];
(function genBeltRocks() {
  let seed = 20261005;                       // детерминированный ГПСЧ — картина стабильна
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 520; i++) {
    const aAU = 2.22 + rnd() * (3.38 - 2.22);
    beltRocks.push({
      aAU,
      periodDays: Math.pow(aAU, 1.5) * 365.25,   // III закон Кеплера
      M0: rnd() * Math.PI * 2,                   // случайная начальная фаза
      tilt: (rnd() - 0.5) * 0.06,                // лёгкий разброс «глубины»
      r: 0.5 + rnd() * 1.3,
      alpha: 0.25 + rnd() * 0.5,
      gray: 120 + Math.floor(rnd() * 70),
    });
  }
})();


/* Стартовые средние аномалии крупнейших астероидов уже заданы в данных */

/* Точка на круговой орбите вокруг центра (экранные координаты) */
function circleScreenPoint(fx, fy, rPx, ang, tiltY) {
  return { x: fx + Math.cos(ang) * rPx, y: fy + Math.sin(ang) * rPx * tiltY };
}

/* Позиция крупнейшего астероида: в режиме "ellipse" — эллипс Кеплера
   с Солнцем в фокусе; в режиме "circle" — упрощённый круг. */
function asteroidEllipsePos(a, cx, cy) {
  if (state.orbitMode === "circle") {
    return circleScreenPoint(cx, cy, beltAUtoPx(a.mainAU),
      circleAngle(state.simDays, a.periodDays, (a.M0 * Math.PI) / 180), TILT);
  }
  const aPx = beltAUtoPx(a.mainAU);
  const bPx = aPx * Math.sqrt(1 - a.ecc * a.ecc);
  const Mraw = circleAngle(state.simDays, a.periodDays, (a.M0 * Math.PI) / 180);
  const E = keplerSolve(((Mraw + Math.PI) % (Math.PI * 2)) - Math.PI, a.ecc);
  const ox = Math.cos(E) * aPx - aPx * a.ecc;
  const oy = Math.sin(E) * bPx;
  const w = (a.omegaDeg * Math.PI) / 180;   // долгота перигелия из данных
  return { x: cx + ox * Math.cos(w) - oy * Math.sin(w),
           y: cy + (ox * Math.sin(w) + oy * Math.cos(w)) * TILT };
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

  /* Крупнейшие астероиды: видимые тела с подписями.
     В режиме "ellipse" — по эллипсам Кеплера (Солнце в фокусе),
     в режиме "circle" — по упрощённым кругам. */
  for (const a of BELT_ASTEROIDS) {
    const rPx = beltAUtoPx(a.mainAU);
    const pos = asteroidEllipsePos(a, cx, cy);

    // орбита астероида — пунктир (круг или эллипс с Солнцем в фокусе)
    if (state.showOrbits) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(a.color, 0.28);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      if (state.orbitMode === "circle") {
        ctx.ellipse(cx, cy, rPx, rPx * TILT, 0, 0, Math.PI * 2);
      } else {
        const bPx = rPx * Math.sqrt(1 - a.ecc * a.ecc);
        ctx.translate(cx, cy);
        ctx.rotate(((a.omegaDeg) * Math.PI) / 180);
        ctx.ellipse(-rPx * a.ecc, 0, rPx, bPx * TILT, 0, 0, Math.PI * 2);
      }
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
  drawOrbits();                          // орбиты планет: эллипсы Кеплера или упрощённые круги
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
    const yr = c.periodYr >= 100 ? Math.round(c.periodYr).toLocaleString("ru-RU") : c.periodYr;
    infoPeriod.textContent = `${yr} лет · e=${c.ecc} — сильно вытянутая орбита`;
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

/* ---------- Переключатель режима орбит: эллипсы Кеплера / упрощённые круги ---------- */
const btnOrbitMode = document.getElementById("btnOrbitMode");

function updateOrbitModeButton() {
  const isEllipse = state.orbitMode === "ellipse";
  btnOrbitMode.textContent = isEllipse ? "◯ Упрощённые круги" : "🪐 Эллипсы Кеплера";
  btnOrbitMode.title = isEllipse
    ? "Переключить на упрощённые круговые орбиты (O)"
    : "Переключить на реальные эллиптические орбиты с Солнцем в фокусе (O)";
}

function toggleOrbitMode() {
  state.orbitMode = state.orbitMode === "ellipse" ? "circle" : "ellipse";
  updateOrbitModeButton();
}

btnOrbitMode.addEventListener("click", toggleOrbitMode);
updateOrbitModeButton();

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
  "Демонстрация v2.1: два режима орбит — реальные ЭЛЛИПСЫ Кеплера (Солнце в фокусе каждой орбиты, " +
  "без преувеличения эксцентриситетов) и упрощённые КРУГИ (кнопка «◯ Упрощённые круги» / клавиша O). " +
  "Расстояния — степенная (сжатая к логарифмической) шкала r ∝ a^0.52: внутренняя система видна подробно, " +
  "порядок и непересечение орбит сохранены. Периоды пропорциональны настоящим (Земля = 365 сут ≈ 20 сек при 1×). " +
  "Пояс астероидов (2.2–3.4 а.е.) лежит строго между Марсом и Юпитером. " +
  "Кометы (Галлея, Хейл-Боппа, Энке, NEOWISE) — на реальных вытянутых эллипсах Кеплера с Солнцем в фокусе; " +
  "хвост всегда направлен от Солнца. Скорость комет — единая наглядная шкала с планетами (1 год = 20 сек при 1×): " +
  "виток Галлея ≈ 25 мин, Энке ≈ 66 сек; пропорции реальных периодов сохранены. " +
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
  } else if ((e.key === "o" || e.key === "O" || e.key === "щ" || e.key === "Щ") &&
             !e.ctrlKey && !e.metaKey && !e.altKey) {
    toggleOrbitMode();   // переключение эллипсы Кеплера ↔ упрощённые круги
  } else if (e.key === "+" || e.key === "=") {
    setSpeed(Math.min(10, +(state.speed + 0.5).toFixed(1)));
  } else if (e.key === "-") {
    setSpeed(Math.max(0, +(state.speed - 0.5).toFixed(1)));
  }
});

setSpeed(1);
updatePlayButton();
