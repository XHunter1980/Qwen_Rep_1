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
  },
  {
    name: "Венера", nameEn: "Venus",
    orbitAU: 0.72, periodDays: 225, diameterKm: 12104,
    drawR: 9, realRel: 0.95,
    color: "#e6c47a", shades: ["#f5e0ac", "#dfb877", "#a97f49"],
    moons: 0, type: "Каменистая планета",
    desc: "Самая горячая планета (≈ +465 °C) из-за плотной углекислотной атмосферы и парникового эффекта. Вращается в обратную сторону.",
  },
  {
    name: "Земля", nameEn: "Earth",
    orbitAU: 1.0, periodDays: 365.25, diameterKm: 12742,
    drawR: 10, realRel: 1.0,
    color: "#4f8fd6", shades: ["#8ec6ff", "#3f7fc8", "#1d4a86"],
    moons: 1, type: "Каменистая планета",
    desc: "Единственная известная планета с жизнью. 71 % поверхности покрыт водой, атмосферу защищает магнитное поле.",
  },
  {
    name: "Марс", nameEn: "Mars",
    orbitAU: 1.52, periodDays: 687, diameterKm: 6779,
    drawR: 7, realRel: 0.53,
    color: "#d1663d", shades: ["#f08a5d", "#c85a34", "#8a3a20"],
    moons: 2, type: "Каменистая планета",
    desc: "«Красная планета» — оксид железа в грунте. Здесь находится самый большой вулкан Солнечной системы — Олимп (≈ 22 км).",
  },
  {
    name: "Юпитер", nameEn: "Jupiter",
    orbitAU: 5.2, periodDays: 4333, diameterKm: 139820,
    drawR: 20, realRel: 11.2,
    color: "#d9a066", shades: ["#eec79a", "#cf9460", "#9a6a40"],
    moons: 95, type: "Газовый гигант",
    desc: "Крупнейшая планета: в неё поместились бы 1300 Земель. Большое красное пятно — шторм больше Земли, бушующий столетиями.",
  },
  {
    name: "Сатурн", nameEn: "Saturn",
    orbitAU: 9.58, periodDays: 10759, diameterKm: 116460,
    drawR: 17, realRel: 9.45, hasRings: true,
    color: "#e3cf9d", shades: ["#f3e4bd", "#dcc48c", "#ab9260"],
    moons: 146, type: "Газовый гигант",
    desc: "Знаменит кольцами из льда и камней шириной ~280 000 км и толщиной всего десятки метров. Планета легче воды.",
  },
  {
    name: "Уран", nameEn: "Uranus",
    orbitAU: 19.2, periodDays: 30687, diameterKm: 50724,
    drawR: 13, realRel: 4.0,
    color: "#9fdfe6", shades: ["#c9f2f6", "#8ed4dd", "#5aa4b0"],
    moons: 28, type: "Ледяной гигант",
    desc: "Вращается «лёжа на боку» — ось наклонена на 98°. Метан в атмосфере придаёт ему голубовато-зелёный цвет.",
  },
  {
    name: "Нептун", nameEn: "Neptune",
    orbitAU: 30.05, periodDays: 60190, diameterKm: 49244,
    drawR: 12, realRel: 3.88,
    color: "#4a6fdc", shades: ["#7d9bf0", "#4066cc", "#27408f"],
    moons: 16, type: "Ледяной гигант",
    desc: "Самая далёкая планета. Ветры достигают 2100 км/ч — быстрейшие в Солнечной системе. Обнаружен «на кончике пера» (1846 г.).",
  },
];

/* ---------- Состояние симуляции ---------- */
const EARTH_YEAR_SECONDS = 20;     // 1 земной год = 20 сек при скорости 1×
const state = {
  playing: true,
  speed: 1,
  simDays: 0,          // модельные сутки
  selected: null,       // выбранная планета
  hovered: null,
  showOrbits: true,
  showLabels: true,
  realScale: false,
};

/* ---------- Звёздный фон ---------- */
let stars = [];
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
}

/* ---------- Компонновка / размеры ---------- */
let W = 0, H = 0, DPR = 1;
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
  const cx = W / 2, cy = H / 2;
  const angle = (state.simDays / planet.periodDays) * Math.PI * 2 + planet.phase;
  const r = orbitRadius(planet);
  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r * 0.62, // лёгкий наклон плоскости эклиптики
    angle, r,
  };
}

// стартовые фазы — планеты разбросаны по орбитам
PLANETS.forEach((p, i) => { p.phase = (i * 2.399963) % (Math.PI * 2); }); // золотой угол

/* ---------- Отрисовка ---------- */
function drawBackground(timeSec) {
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, W, H);
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

function drawSun(timeSec) {
  const cx = W / 2, cy = H / 2;
  const pulse = 1 + 0.03 * Math.sin(timeSec * 2);
  const R = SUN.drawR * pulse;

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

  // подпись
  if (state.showLabels) {
    ctx.fillStyle = isSel ? "#ffd76a" : "rgba(210, 222, 245, 0.85)";
    ctx.font = (isSel ? "600 " : "") + "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.name, pos.x, pos.y - R - 8);
  }
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
  drawOrbits();
  drawSun(timeSec);
  for (const p of PLANETS) drawPlanet(p, timeSec);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- Попадание курсора по планете ---------- */
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

function showInfo(p) {
  state.selected = p;
  infoIcon.style.background = `radial-gradient(circle at 32% 30%, ${p.shades[0]}, ${p.shades[1]} 55%, ${p.shades[2]})`;
  infoName.textContent = `${p.name}  ·  ${p.nameEn}`;
  infoSize.textContent = `${p.diameterKm.toLocaleString("ru-RU")} км`;
  infoDist.textContent = `${p.orbitAU} а.е. (${Math.round(p.orbitAU * 149.6).toLocaleString("ru-RU")} млн км)`;
  infoPeriod.textContent = formatPeriod(p.periodDays);
  infoMoons.textContent = p.moons === 0 ? "нет" : String(p.moons);
  infoType.textContent = p.type;
  infoDesc.textContent = p.desc;
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
  const p = pickPlanet(e.clientX, e.clientY);
  state.hovered = p;
  canvas.classList.toggle("hovering", !!p);
  if (p) {
    tooltip.textContent = `${p.name} — нажмите для подробностей`;
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
  const p = pickPlanet(e.clientX, e.clientY);
  if (p) showInfo(p);
  else hideInfo();
});

/* Тач-поддержка */
canvas.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  const p = pickPlanet(t.clientX, t.clientY);
  if (p) { showInfo(p); e.preventDefault(); }
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

/* Горячие клавиши */
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    state.playing = !state.playing;
    updatePlayButton();
  } else if (e.key === "Escape") {
    hideInfo();
  } else if (e.key === "+" || e.key === "=") {
    setSpeed(Math.min(10, +(state.speed + 0.5).toFixed(1)));
  } else if (e.key === "-") {
    setSpeed(Math.max(0, +(state.speed - 0.5).toFixed(1)));
  }
});

setSpeed(1);
updatePlayButton();
