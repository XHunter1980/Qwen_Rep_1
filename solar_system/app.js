"use strict";

/* =========================================================
   Интерактивная демонстрация Солнечной системы
   Canvas 2D: Солнце + 8 планет, клик по планете — карточка
   с фактами, управление: воспроизведение/пауза, скорость.
   ========================================================= */

/* Версия сборки — ТОЛЬКО номер, без описаний (по требованию).
   Видна в заголовке вкладки, в шапке страницы и в консоли. */
const VERSION = "v3.6";
document.title = `Солнечная система ${VERSION}`;
console.log(`%c☀️ Солнечная система — сборка: ${VERSION}`, "color:#ffd75e;font-weight:bold");
/* Бейдж версии в шапке страницы */
{
  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = VERSION;
}

/* ---------- Общие вспомогательные функции ---------- */
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
function shadeDown(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * 0.45);
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
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
  zoom: 1,                       // масштаб вида (0.6× … 8×), колесо мыши / слайдер
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
/* Коэффициент сжатия внешней области: шкала нормирована не на Нептун,
   а на AU_REF — так внутренние планеты занимают больше места и читаются
   подробнее, а Нептун упирается в ~90% доступного радиуса. */
const AU_REF = 18;                                     // «условная граница» шкалы, а.е.
function availPx() {
  // полуширина / «глубина» эллипсов под размер окна
  return Math.min(W / 2 - 46, (H / 2 - 34) / TILT);
}
function scaleAUtoPx(aAU) {
  const norm = Math.pow(AU_REF / AU_MAX, SCALE_POW);  // поправка нормировки
  const stretch = state.realScale ? REAL_ORBIT_STRETCH : 1; // см. REAL_ORBIT_STRETCH
  return Math.pow(aAU / AU_MAX, SCALE_POW) / norm * availPx() * 0.9 * stretch;
}

/* Угол тела на КРУГОВОЙ орбите: полный оборот за periodDays суток */
function circleAngle(simDays, periodDays, phase0) {
  return ((simDays / Math.abs(periodDays)) * Math.PI * 2 + phase0) % (Math.PI * 2);
}

/* Приведение угла к диапазону (−π, +π] БЕЗ потери знака.
   Стандартное выражение (M + π) % 2π − π в JavaScript некорректно для
   отрицательных M: оператор % сохраняет знак делимого, из-за чего
   эллиптическая аномалия E получалась со «сдвинутым» знаком sin(E),
   и тело при прохождении перигелия отражалось относительно оси
   перигелия — визуально это выглядело как скачок/рывок у Солнца. */
function normalizeAngle(a) {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

/* Позиция планеты — зависит от выбранного режима орбит:
   • "ellipse" — РЕАЛЬНЫЙ эллипс Кеплера (a, e из данных планет, без
     преувеличений), Солнце строго в ФОКУСЕ; движение неравномерно:
     быстрее в перигелии, медленнее в афелии (II закон Кеплера).
   • "circle"  — упрощённая круговая орбита с радиусом = a, Солнце в центре.
   Возвращает { x, y, rAU }: экранная позиция + НАСТОЯЩЕЕ расстояние тела
   до Солнца в а.е. (r = a(1 − e·cosE)) — именно по нему определяется,
   «за» тело Солнцем или «перед» ним (глубина sortKey). */
function planetPosition(p) {
  if (state.orbitMode === "circle") {
    const rPx = scaleAUtoPx(p.orbitAU);
    const pt = circleScreenPoint(W / 2, H / 2, rPx,
      circleAngle(state.simDays, p.periodDays, p.phase0), TILT);
    return { x: pt.x, y: pt.y, rAU: p.orbitAU };
  }
  // Эллипс Кеплера: большая полуось a и эксцентриситет e — реальные.
  // Средней аномалией M служит угол обращения по времени (линейно растёт
  // со временем — это и есть «равномерное усреднённое» движение).
  const aPx = scaleAUtoPx(p.orbitAU);
  const bPx = aPx * Math.sqrt(1 - p.ecc * p.ecc);
  const Mraw = circleAngle(state.simDays, p.periodDays, p.phase0);
  /* Нормализация M в (−π, +π] без потери знака: выражение (M+π)%2π−π на
     отрицательных углах давало неверный знак sin(E) — «скачки» тела через
     ось перигелия при прохождении Солнца. */
  const Ecc = keplerSolve(normalizeAngle(Mraw), p.ecc);
  const rAU = p.orbitAU * (1 - p.ecc * Math.cos(Ecc));   // истинное расстояние до Солнца
  const ox = Math.cos(Ecc) * aPx - aPx * p.ecc;   // фокус (Солнце) в начале координат
  const oy = Math.sin(Ecc) * bPx;
  const w = (p.omegaDeg * Math.PI) / 180;       // ориентация эллипса на плоскости
  const rx = ox * Math.cos(w) - oy * Math.sin(w);
  const ry = (ox * Math.sin(w) + oy * Math.cos(w)) * TILT;
  return { x: W / 2 + rx, y: H / 2 + ry, rAU };
}

/* Глубина тела: знак «за Солнцем» определяется ИСТИННЫМ расстоянием rAU
   по кеплеровской орбите, а не направлением нарисованного эллипса.
   Причина: наклон вида (TILT) сжимает вертикаль в ~2.4 раза, поэтому
   перигелий/афелий повёрнутой орбиты могут лежать «по горизонтали» —
   и тогда y-критерий ошибочно решал бы, что тело в перигелии (у Солнца!)
   находится «перед» ним. Теперь это невозможно: у Солнца (rAU < 1 а.е.)
   тело всегда считается «за» диском, на окраине системы — «перед». */
function depthSortKey(rAU, y) {
  const behind = rAU <= 1.0 || y >= H / 2;
  return behind ? -rAU : rAU;
}

/* Вспомогательная: «за» ли тело Солнцем — единый критерий для всей отрисовки
   (слои back/front, экранирование диском). Согласован с depthSortKey. */
function isBehindSun(rAU, y) {
  return rAU <= 1.0 || y >= H / 2;
}

/* Экранное расстояние планеты от центра (для попаданий и подписей) */
function planetScreenRadius(p) {
  if (!state.realScale) return p.drawR;
  // режим реальных размеров: ЛОГАРИФМИЧЕСКИЙ масштаб по диаметру
  return bodyRealPx(p.diameterKm);
}

/* ЕДИНАЯ ЛОГАРИФМИЧЕСКАЯ ШКАЛА РАЗМЕРОВ для ВСЕХ твёрдых тел системы
   (планеты, спутники, крупные астероиды) в режиме «Реальные размеры».

   Почему логарифм: линейный масштаб делает Солнце (109 земных радиусов)
   гигантским диском на пол-экрана, а Фобос (22 км) — невидимой точкой.
   Размер ∝ ln(диаметр / BASE), BASE = 100 км — точка «нулевого» размера
   лежит НИЖЕ самого мелкого показываемого тела (Деймос 12 км → floor).

   ВАЖНО (исправление v3.5): раньше планеты и луны считались по ДВУМ
   РАЗНЫМ шкалам с разными основаниями (3000 км против 500 км), из-за
   чего Марс (6 779 км) давал 5.8 px, а Луна (3 479 км) — 5.6 px: при
   реальном соотношении 1.95× они выглядели одинаковыми. Теперь у всех
   тел одна формула, поэтому ОТНОСИТЕЛЬНЫЙ порядок размеров строгий:
   разница Марс/Луна в пикселях 1.19× при реальных 1.95× — сжатие неизбежно для лог-шкалы, но визуальное равенство исключено
   Порядок сохраняется автоматически, т.к. ln — монотонная функция. */
const BODY_LOG_BASE_KM = 100;    // «нуль» единой шкалы диаметров
const BODY_LOG_UNIT_PX = 1.55;   // px на ln(diam / 100 км)
const BODY_MIN_PX = 1.2;         // нижняя граница различимости точки
function bodyRealPx(diameterKm) {
  const v = Math.log(Math.max(diameterKm, 1) / BODY_LOG_BASE_KM);
  return Math.max(BODY_MIN_PX, v * BODY_LOG_UNIT_PX);
}

/* РЕАЛИСТИЧНЫЕ РАЗМЕРЫ СПУТНИКОВ (исправление v3.6).
   История бага:
   - до v3.5 луны имели СВОЮ лог-шкалу (основание 500 км), планеты свою
     (3000 км) → Марс 5.8 px против Луны 5.6 px: «выглядят одинаково»;
   - в v3.5 лунам дали ТЕ ЖЕ ЛОГАРИФМЫ, что планетам → наивная
     монотонность появилась, но логарифм сплющивает разрыв в ~2 порядка:
     Ганимед 6.1 px против Юпитера 10.7 px (в реальности в 26.5 раза
     меньше!) — спутники стали выглядеть СЛИШКОМ КРУПНЫМИ.
   Решение v3.6: для спутников — ОТДЕЛЬНАЯ ЛИНЕЙНАЯ шкала. Диаметр
   самой крупной луны (Ганимед, 5 268 км) заданно мал относительно
   диска любой его несущей планеты (доля MOON_LIN_FRAC), а все прочие
   луны пропорциональны своему реальному диаметру. Линейная шкала
   честна для сопоставления «спутник ↔ планета»: Деймос действительно
   в ~440 раз меньше Ганимеда и становится точкой, а не «карликовым
   Ганимедом». Перекрёстные сравнения «планета ↔ планета» при этом НЕ
   тронуты: они остаются на единой лог-шкале bodyRealPx (Марс > Луны
   видно по-прежнему — floor ниже диаметра Луны).
   Проверка долей в режиме «Реальные размеры» (MOON_LIN_PX_PER_KM =
   0.00084; r_планеты из bodyRealPx):
   Земля 7.4 px ← Луна 2.9 px (39%, реально 27% — чуть увеличена для
   различимости); Марс 6.5 ← Фобос 1.2 / Деймос 1.2 (точки, ≤19%);
   Юпитер 10.7 ← Ио 3.1 / Европа 2.6 / Ганимед 4.4 / Каллисто 4.1
   (≤41%, реально ≤3.8%); Сатурн 10.4 ← Титан 4.3 / Рея 1.3 / Япет
   1.2; Уран 9.4 ← Титания 1.0 / Оберон 1.0; Нептун 9.4 ← Тритон 2.3.
   Все спутники гарантированно мельче своих планет. */
const MOON_LIN_PX_PER_KM = 0.00084; // линейный коэффициент: px на км диаметра
const MOON_MIN_PX = 1.2;             // нижняя граница различимости точки
function moonSizePx(moon, planetScreenR) {
  if (!state.realScale) {
    /* Условный режим: размер относительно планеты, порядок соблюдён. */
    return Math.max(1.4, planetScreenR * (moon.relR || 0.1) * 0.5);
  }
  /* Режим реальных размеров: ЛИНЕЙНАЯ шкала по диаметру луны
     (relR × 12 742 км — диаметр относительно Земли). */
  const diaKm = Math.max(1, (moon.relR || 0.1) * 12742);
  return Math.max(MOON_MIN_PX, diaKm * MOON_LIN_PX_PER_KM);
}

/* Общее правило для ВСЕХ слоёв режима реальных размеров: орбиты
   растягиваются множителем, чтобы тела не слипались в одну точку.
   Используется планетами (через scaleAUtoPx), лунами и поясом. */
const REAL_ORBIT_STRETCH = 3;

/* Позиция луны вокруг планеты. Орбиты спутников реалистичнее:
   1) радиус пропорционален РЕАЛЬНОму расстоянию до спутника
      (distKm → логарифмический масштаб MOON_DIST_LOG_UNIT_PX), поэтому
      порядок и относительные дистанции соблюдены: Фобос (9 376 км)
      сидит вплотную к Марсу, Каллисто (1.88 млн км) далеко от Юпитера,
      Луна — примерно на трёх земных диаметрах;
   2) эллипс проекции: видимый «наклон» орбиты задаётся реальным
      наклонением спутника (moon.incl, град) — у Тритона ретроградная
      сильно наклонённая орбита, у галилеевых спутников почти лежат
      в плоскости экватора;
   3) минимальный зазор от поверхности планеты, чтобы луна не рисовалась
      внутри диска планеты. */
const MOON_DIST_LOG_UNIT_PX = 4.2;          // px на ln(dist/10 000 км) — шкала РАДИУСОВ орбит лун
function moonOrbitPx(distKm) {
  return Math.max(7, Math.log(Math.max(distKm, 1) / 10000) * MOON_DIST_LOG_UNIT_PX);
}
function moonPosition(planet, moon, pos, R) {
  const ang = circleAngle(state.simDays, moon.periodDays, moon.phase0 || 0);
  let orbR = moonOrbitPx(moon.distKm);
  if (!state.realScale) orbR = Math.max(orbR, R + moon.drawOrbR * 0.45);
  else orbR = Math.max(orbR, R + 4);
  /* Проекция наклонённой орбиты: сжатие вертикали cos(i), ориентация
     линии узлов случайна, но постоянна для каждой луны (seed из distKm). */
  const node = ((moon.distKm % 97) / 97) * Math.PI;      // стабильный seed
  /* Наклонение >90° (ретроградные луны, как Тритон i=157°) — то же самое
     «видимое сжатие», что и 180−i, но орбита обходится в обратную сторону
     (знак periodDays уже это делает). Поэтому берём min(i, 180−i). */
  const inclEff = Math.min(moon.incl || 0, 180 - (moon.incl || 0));
  const squash = Math.max(0.12, Math.cos(inclEff * Math.PI / 180));
  const ex = Math.cos(ang) * orbR, ey = Math.sin(ang) * orbR * squash;
  /* РЕАЛИСТИЧНЫЙ РАЗМЕР СПУТНИКА: в режиме «Реальные размеры» — по
     отдельной логарифмической шкале диаметров (moonSizePx), в обычном —
     условный размер относительно планеты с сохранением порядка величин
     (Фобос/Деймос заметно меньше Луны, Ганимед/Титан — самые крупные). */
  const r = moonSizePx(moon, R);
  return {
    x: pos.x + ex * Math.cos(node) - ey * Math.sin(node),
    y: pos.y + ex * Math.sin(node) + ey * Math.cos(node),
    r, orbR, squash, node,
  };
}

/* Решение уравнения Кеплера M = E − e·sinE.
   Метод Ньютона сам по себе точен, но при ЭКРАННЫХ эксцентриситетах
   комет (visEcc ≈ 0.95–0.96, см. ниже) у перигелия производная
   1 − e·cosE → 0: знаменатель итерации вырождается, шаг расходится и
   решение «прыгает» между двумя ветвями — это и был остаточный баг
   v2.9 («кометы дёргаются даже после замедления»). Поэтому для e > 0.7
   используется БЕЗУСЛОВНО СХОДЯЩИЙСЯ метод бисекции: функция
   f(E) = E − e·sinE − M монотонна (f' ≥ 1−e > 0), корень единственен,
   половинное деление на [−π, π] сходится за ~40 итераций с точностью
   до машинного эпсилон. Для планетных эллипсов (e ≤ 0.21) Ньютон
   оставлен — он там лавиноустойчив и быстрее. */
function keplerSolve(M, e) {
  if (e > 0.7) {
    // бисекция: f(−π) ≤ 0 ≤ f(+π) для M ∈ (−π, +π]
    let lo = -Math.PI, hi = Math.PI;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (mid - e * Math.sin(mid) - M <= 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  let E = M;
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  return E;
}

/* ---------- Остаточный баг «кометы дёргаются» (исправлен в v3.0) ----------
   Разобрано посимвольно по коду v2.9: simDays уже был вещественным,
   нормализация угла и замедление — корректными. Единственный оставшийся
   источник ДЁРГАНИЯ — решение уравнения Кеплера методом Ньютона при
   ЭКРАННЫХ эксцентриситетах комет (visEcc = 0.95/0.96): у перигелия
   знаменатель итерации (1 − e·cosE) вырождается в 0, Ньютон сходится к
   соседнему корню ветки и позиция «прыгает». Исправлено выше: для e > 0.7
   применена безусловная бисекция. Дополнительно страховка от любых будущих
   дискретностей времени — сглаживание позиции кометы (см. cometPosition). */

/* Визуальное замедление времени комет.
   Корень бага v2.3: орбиты комет на экране сжаты (длиннопериодические
   упираются в край экрана), но их РЕАЛЬНЫЕ периоды (тысячи лет)
   использовались как есть — из-за этого кометы выглядели неподвижными,
   а короткопериодические (Галлея, Энке), наоборот, «носились».
   Решение v2.5: оставлены только длиннопериодические кометы, а их
   модельный период берётся НЕ реальный, а КЕПЛЕРОВСКИЙ ДЛЯ ВИДИМОЙ
   ОРБИТЫ: комета движется так, как двигалась бы планета на её видимом
   радиусе (III закон T = a^1.5), плюс доп. замедление COMET_SLOW.
   Замечание v2.5: из-за сильного сжатия внешней области шкалы
   «видимая» полуось обеих комет ≈ орбите Нептуна, поэтому их модельный
   период получался одинаковым (~327 земных лет) — при скорости 1× они
   пролетали дугу заметно быстрее внешних планет («носились»).
   В v2.6 это исправлено индивидуальными коэффициентами slowFor.
   В v2.8 коэффициенты увеличены (×160 и ×220): раньше «медленной» была
   только ОБРАТНАЯ ветвь орбиты, а вблизи Солнца комета пролетала всю
   внутреннюю систему за ~3 секунды при скорости 1× — визуально это и
   выглядело как «сверхбыстрый бег». Теперь полный оборот занимает
   ~10.5 ч (Хейл-Боппа) и ~13.5 ч (NEOWISE) реального времени при 1× —
   кометы заметно медленнее внешних планет на всей дуге, включая перигелий. */
const COMET_SLOW = 160;
/* Эквивалент «1 а.е.» в пикселях при текущем экране (из scaleAUtoPx(1)). */
function auPx() {
  return scaleAUtoPx(1);
}
function cometVisPeriodDays(c) {
  const rEq = cometAPx(c) / auPx();              // видимая полуось в «эквивалентных а.е.»
  /* III закон на ВИДИМОЙ орбите + индивидуальное замедление slowFor
     (по умолчанию общий COMET_SLOW). Без slowFor обе кометы имели бы
     одинаковый период ≈ Нептун×12 и выглядели «слишком быстрыми»
     по сравнению с внешними планетами. */
  return Math.pow(Math.max(rEq, 0.05), 1.5) * 365.25 * (c.slowFor || COMET_SLOW);
}

function cometPosition(c) {
  const aPx = cometAPx(c);                       // экранная полуось (не за край экрана)
  const eVis = c.visEcc ?? c.ecc;                // модельный эксцентриситет: реальные 0.995+ дают «иголку» b=a√(1−e²) ≈ 1–3% от a, по которой тело пролетает сквозь Солнце
  const bPx = aPx * Math.sqrt(1 - eVis * eVis);
  /* Движение кометы синхронизировано с модельным временем симуляции
     (state.simDays): при паузе комета останавливается, при «Сбросе» —
     возвращается на исходную точку. */
  const periodDays = cometVisPeriodDays(c);      // модельный период по ВИДИМОЙ орбите (медленный)
  const Mraw = circleAngle(state.simDays, periodDays, c.phase || 0);
  /* Нормализация средней аномалии в диапазон (−π, +π] без потери знака
     (см. normalizeAngle): раньше из-за знака оператора % комета
     отражалась относительно оси перигелия и «телепортировалась» на
     другую сторону эллипса именно вблизи Солнца — это и выглядело как
     «сбой / сверхбыстрый рывок». */
  const Ecc = keplerSolve(normalizeAngle(Mraw), eVis);
  /* rAU — расстояние по МОДЕЛЬНОЙ орбите (сохраняет реальный перигелий
     q = a·(1−e)), поэтому у Солнца комета максимально активна, а вдали —
     тусклое ядро; раньше rAU считался по настоящему эллипсу (r до 709 а.е.),
     из-за чего act≈0 и комета «исчезала/скакала» вблизи Солнца. */
  const rAU = (aPx / auPx()) * (1 - eVis * Math.cos(Ecc));
  // координаты в плоскости орбиты (фокус — Солнце — в центре экрана)
  const ox = Math.cos(Ecc) * aPx - aPx * eVis;   // ось к перигелию
  const oy = Math.sin(Ecc) * bPx;
  // поворот на долготу перигелия ω и «наклон» вида сверху вниз
  const w = (c.omegaDeg * Math.PI) / 180;
  const rx = ox * Math.cos(w) - oy * Math.sin(w);
  const ry = (ox * Math.sin(w) + oy * Math.cos(w)) * TILT;
  const rawX = W / 2 + rx, rawY = H / 2 + ry;

  /* Сглаживание позиции (v3.0). Экспоненциальный фильтр первого порядка:
     даже если источник движения даст неидеально равномерный прирост
     времени или решатель Кеплера вернёт соседний корень, видимое тело
     движется непрерывно — «дёрганье» физически невозможно. Фильтр
     сбрасывается при resize() (координаты центра экрана меняются), а
     также при нулевой скорости/паузе позиция просто стабилизируется. */
  if (!c._sm || c._smW !== W || c._smH !== H) {
    c._sm = { x: rawX, y: rawY };
    c._smW = W; c._smH = H;
  } else {
    const k = 0.45;                       // доля «догоняемого» пути за кадр
    c._sm.x += (rawX - c._sm.x) * k;
    c._sm.y += (rawY - c._sm.y) * k;
  }
  return { x: c._sm.x, y: c._sm.y, rAU };
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
let sunScreenR = 34;   // текущий экранный радиус диска Солнца (для перекрытия тел)

function drawSun(timeSec) {
  const cx = W / 2, cy = H / 2;
  const pulse = 1 + 0.05 * Math.sin(timeSec * 1.7);
  /* В режиме реальных размеров Солнце получает тот же ЛОГАРИФМИЧЕСКИЙ
     масштаб, что планеты (по диаметру 1 391 000 км → ≈14 px): оно остаётся
     самым большим телом на экране, но больше не «съедает» внутреннюю систему. */
  const baseR = state.realScale ? bodyRealPx(1391000) : SUN.drawR;
  const R = baseR * pulse;
  sunScreenR = R;
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
/* Экранная большая полуось кометы: та же степенная шкала, что у планет,
   но не дальше края экрана (у сильно вытянутых эллипсов дальняя точка
   афелия может выходить за холст). */
function cometAPx(c) {
  const maxR = Math.min(W, H) * 0.5 - 14;
  return Math.min(scaleAUtoPx(c.visA ?? c.aAU), maxR);
}

/* В v2.5 оставлены только ДВЕ МЕДЛЕННЫЕ длиннопериодические кометы
   (Хейла-Боппа, NEOWISE); быстрые короткопериодические (Галлея 75 лет,
   Энке 3.3 года) были убраны.
   В v2.6 найдена ИСТИННАЯ причина «сверхбыстрого» бега: модельный период
   вычислялся по ВИДИМОЙ (экранной) орбите — из-за сжатия внешней области
   шкалы обе кометы получали одинаковый период ≈ Нептун×COMET_SLOW и на
   фоне медленно идущих внешних планет выглядели носителями. Исправлено
   индивидуальными коэффициентами slowFor: теперь обе кометы медленные
   (оборот ~10 мин при 1×), движение плавное на любой скорости. */
/* Экранные полуоси комет (в а.е. условной шкалы). Настоящие a у этих
   комет 170–360 а.е., но при эллипсе Кеплера b = a·√(1−e²) поперёк орбиты
   составлял бы всего 1–3% от длины — «иголка», по которой комета носится
   сквозь Солнце. Поэтому модельные орбиты сохраняют РЕАЛЬНЫЙ перигелий
   q = a·(1−e), но имеют разумный эксцентриситет и вписываются в экран. */
const COMET_VIS_A = { hb: 24, nw: 28 };

const COMETS = [
  {
    name: "Комета Хейла-Боппа", nameEn: "C/1995 O1 Hale-Bopp",
    aAU: 173, ecc: 0.995, periodYr: 7470, perihelionAU: 0.87, aphelionAU: 345,
    visA: COMET_VIS_A.hb, visEcc: 0.95, omegaDeg: 282, phase: 5.5, slowFor: 160,
    color: "#d8f0ff", type: "Длиннопериодическая комета (облако Оорта)",
    desc: "Одна из самых наблюдаемых комет XX века (1997 г.): видна невооружённым глазом 18 месяцев, период ~7470 лет, ядро ~60–80 км.",
  },
  {
    name: "Комета NEOWISE", nameEn: "C/2020 F3 (NEOWISE)",
    aAU: 355, ecc: 0.998, periodYr: 6800, perihelionAU: 0.69, aphelionAU: 709,
    visA: COMET_VIS_A.nw, visEcc: 0.96, omegaDeg: 61, phase: 5.9, slowFor: 220,
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
    const eVis = c.visEcc ?? c.ecc;
    const bPx = aPx * Math.sqrt(1 - eVis * eVis);
    const w = (c.omegaDeg * Math.PI) / 180;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(w);
    ctx.scale(1, TILT);
    ctx.beginPath();
    // настоящий эллипс: центр смещён от фокуса (Солнца) на c = a·e
    ctx.ellipse(-aPx * eVis, 0, aPx, bPx, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/* layer === "back" — кометы за Солнцем (нижняя половина вида), их рисовать
   ДО диска Солнца; "front" — перед Солнцем, после планет. */
function drawComets(timeSec, layer) {
  if (!state.showComets) return;
  const cx = W / 2, cy = H / 2;
  for (const c of COMETS) {
    const pos = cometPosition(c);                 // rAU — истинное расстояние по эллипсу Кеплера
    c._screen = { x: pos.x, y: pos.y, r: Math.max(2.6, 8) };

    const behind = isBehindSun(pos.rAU, pos.y);  // «за» Солнцем или «перед» ним (единый критерий глубины)
    if ((layer === "back") !== behind) continue;

    /* ---- Реалистичная активность и размеры хвостов ----
       Активность кометы физически растёт как ~1/r² (сублимация льдов),
       а не линейно. Хвосты в реальности ОГРОМНЫ: ионный у Гейла-Боппы
       достигал 3.7 млн км (~0.025 а.е.), пылевой — сопоставим.
       Для наглядности задаём эталонную длину при r=1 а.е., но НЕ даём
       хвосту перекрывать всю систему: ограничиваем его долей расстояния
       кометы до Солнца (макс. ~0.45·r) — так сохраняется масштаб. */
    const act = Math.pow(Math.min(1, 1.6 / (pos.rAU + 0.25)), 1.5); // ~1 у Солнца, быстро гаснет
    if (act <= 0.02) {
      ctx.fillStyle = hexToRgba(c.color, 0.5);                     // далеко — лишь тусклое ядро
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const dirX = pos.x - cx, dirY = pos.y - cy;
    const dlPx = Math.hypot(dirX, dirY) || 1;                     // расстояние до Солнца в px
    /* Эталон: у Земли (1 а.е.) активная комета даёт хвост ~ 90 px;
       дальше по орбите хвост растёт с act, но не длиннее 0.45·dlPx. */
    const TAIL_REF_PX = 90;
    const tailIon   = Math.min(TAIL_REF_PX * act * 1.6, dlPx * 0.45); // ионный — прямой и длинный
    const tailDust  = Math.min(TAIL_REF_PX * act * 1.0, dlPx * 0.30); // пылевой — короче и шире
    const ux = dirX / dlPx, uy = dirY / dlPx;                       // единичный вектор «от Солнца»
    const ix = pos.x + ux * tailIon,  iy = pos.y + uy * tailIon;
    const dxv = pos.x + ux * tailDust, dyv = pos.y + uy * tailDust;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";                      // свечение складывается аддитивно

    // ПЫЛЕВОЙ хвост: широкий, жёлто-белый, слегка изогнут (отстаёт от движения)
    const dg = ctx.createLinearGradient(pos.x, pos.y, dxv, dyv);
    dg.addColorStop(0, `rgba(255, 236, 190, ${0.55 * act})`);
    dg.addColorStop(0.5, `rgba(255, 220, 160, ${0.22 * act})`);
    dg.addColorStop(1, "rgba(255, 210, 150, 0)");
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(pos.x - uy * 3, pos.y + ux * 3);
    ctx.quadraticCurveTo(
      pos.x + ux * tailDust * 0.55 - uy * tailDust * 0.22,
      pos.y + uy * tailDust * 0.55 + ux * tailDust * 0.22,
      dxv - uy * tailDust * 0.18, dyv + ux * tailDust * 0.18);
    ctx.lineTo(dxv + uy * tailDust * 0.18, dyv - ux * tailDust * 0.18);
    ctx.quadraticCurveTo(
      pos.x + ux * tailDust * 0.55 + uy * tailDust * 0.10,
      pos.y + uy * tailDust * 0.55 - ux * tailDust * 0.10,
      pos.x + uy * 3, pos.y - ux * 3);
    ctx.closePath();
    ctx.fill();

    // ИОННЫЙ хвост: тонкий, голубой, строго от Солнца (солнечный ветер)
    const ig = ctx.createLinearGradient(pos.x, pos.y, ix, iy);
    ig.addColorStop(0, `rgba(150, 200, 255, ${0.8 * act})`);
    ig.addColorStop(0.4, `rgba(120, 170, 255, ${0.35 * act})`);
    ig.addColorStop(1, "rgba(100, 150, 255, 0)");
    ctx.strokeStyle = ig;
    ctx.lineCap = "round";
    ctx.lineWidth = 1.5 + act * 4;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(ix, iy);
    ctx.stroke();
    ctx.restore();

    // КОМА — светящееся облако газа вокруг ядра (радиус растёт с активностью)
    const comaR = 2.5 + act * 9;
    const coma = ctx.createRadialGradient(pos.x, pos.y, 0.5, pos.x, pos.y, comaR);
    coma.addColorStop(0, `rgba(255,255,255,${0.9 * act})`);
    coma.addColorStop(0.4, hexToRgba(c.color, 0.5 * act));
    coma.addColorStop(1, "rgba(160, 200, 255, 0)");
    ctx.fillStyle = coma;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, comaR, 0, Math.PI * 2);
    ctx.fill();

    // ЯДРО — крошечное (реально 5–15 км, в любом масштабе — точка)
    ctx.fillStyle = "#eef6ff";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
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
      { name: "Луна", nameEn: "Moon", periodDays: 27.3, distKm: 384400, relR: 0.273, drawOrbR: 19, color: "#cfcfcf", incl: 5.1 },
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
      { name: "Фобос", nameEn: "Phobos", periodDays: 0.319, distKm: 9376, relR: 0.0016, drawOrbR: 12, color: "#a89a8c", incl: 1.1 },
      { name: "Деймос", nameEn: "Deimos", periodDays: 1.263, distKm: 23463, relR: 0.0009, drawOrbR: 18, color: "#bdb0a2", incl: 1.8 },
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
      { name: "Ио", nameEn: "Io", periodDays: 1.769, distKm: 421700, relR: 0.286, drawOrbR: 28, color: "#e8d174", incl: 0.05 },
      { name: "Европа", nameEn: "Europa", periodDays: 3.551, distKm: 671034, relR: 0.245, drawOrbR: 35, color: "#d9cbb2", incl: 0.47 },
      { name: "Ганимед", nameEn: "Ganymede", periodDays: 7.155, distKm: 1070412, relR: 0.413, drawOrbR: 44, color: "#b8a894", incl: 0.2 },
      { name: "Каллисто", nameEn: "Callisto", periodDays: 16.689, distKm: 1882709, relR: 0.378, drawOrbR: 55, color: "#9d9184", incl: 0.28 },
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
      { name: "Титан", nameEn: "Titan", periodDays: 15.945, distKm: 1221870, relR: 0.404, drawOrbR: 46, color: "#e0b463", incl: 0.33 },
      { name: "Рея", nameEn: "Rhea", periodDays: 4.518, distKm: 527108, relR: 0.124, drawOrbR: 34, color: "#cfc9c0", incl: 0.35 },
      { name: "Япет", nameEn: "Iapetus", periodDays: 79.33, distKm: 3560820, relR: 0.098, drawOrbR: 62, color: "#b6ab9c", incl: 15.5 },
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
      { name: "Титания", nameEn: "Titania", periodDays: 8.706, distKm: 435910, relR: 0.124, drawOrbR: 26, color: "#c5ccd2", incl: 0.34 },
      { name: "Оберон", nameEn: "Oberon", periodDays: 13.463, distKm: 583520, relR: 0.119, drawOrbR: 34, color: "#b3bcc4", incl: 0.06 },
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
      { name: "Тритон", nameEn: "Triton", periodDays: -5.877, distKm: 354759, relR: 0.212, drawOrbR: 28, color: "#cdd8e8", incl: 157 },
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
   с Солнцем в фокусе; в режиме "circle" — упрощённый круг.
   Возвращает { x, y, rAU } — rAU нужно для корректного перекрытия Солнцем. */
function asteroidEllipsePos(a, cx, cy) {
  if (state.orbitMode === "circle") {
    const pt = circleScreenPoint(cx, cy, beltAUtoPx(a.mainAU),
      circleAngle(state.simDays, a.periodDays, (a.M0 * Math.PI) / 180), TILT);
    return { x: pt.x, y: pt.y, rAU: a.mainAU };
  }
  const aPx = beltAUtoPx(a.mainAU);
  const bPx = aPx * Math.sqrt(1 - a.ecc * a.ecc);
  const Mraw = circleAngle(state.simDays, a.periodDays, (a.M0 * Math.PI) / 180);
  const Ecc = keplerSolve(normalizeAngle(Mraw), a.ecc);   // нормализация без потери знака
  const rAU = a.mainAU * (1 - a.ecc * Math.cos(Ecc));   // истинное расстояние до Солнца
  const ox = Math.cos(Ecc) * aPx - aPx * a.ecc;
  const oy = Math.sin(Ecc) * bPx;
  const w = (a.omegaDeg * Math.PI) / 180;   // долгота перигелия из данных
  return { x: cx + ox * Math.cos(w) - oy * Math.sin(w),
           y: cy + (ox * Math.sin(w) + oy * Math.cos(w)) * TILT, rAU };
}

/* layer === "back" — камни и астероиды ЗА Солнцем (нижняя половина вида):
   рисуем до диска Солнца; "front" — ПЕРЕД Солнцем: после планет.
   Тело, попавшее под диск Солнца на дальней половине, экранируется им. */
function drawBelt(timeSec, layer) {
  if (!state.showBelt) return;
  const cx = W / 2, cy = H / 2;
  ctx.save();
  /* Фоновые камни пояса: движутся по упрощённым круговым орбитам */
  for (const rock of beltRocks) {
    const ang = circleAngle(state.simDays, rock.periodDays, rock.M0);
    const pt = circleScreenPoint(cx, cy, beltAUtoPx(rock.aAU), ang, TILT + rock.tilt);
    if (pt.x < -5 || pt.x > W + 5 || pt.y < -5 || pt.y > H + 5) continue;
    // слоение по глубине + экранирование диском Солнца для дальних камней
    if ((layer === "back") !== (pt.y >= cy)) continue;   // круговые орбиты: y-критерий корректен
    if (layer === "back" && Math.hypot(pt.x - cx, pt.y - cy) < sunScreenR) continue;
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
    // слоение по глубине: единый критерий (истинное rAU + y) — как у планет и комет
    if ((layer === "back") !== isBehindSun(pos.rAU, pos.y)) continue;
    // заходящий за Солнце астероид скрывается его диском
    if (layer === "back" && Math.hypot(pos.x - cx, pos.y - cy) < sunScreenR + a.drawR) continue;

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

/* layer === "back" — планета на дальней половине вида (за Солнцем): рисуется
   ДО диска Солнца и экранируется им целиком; "front" — перед Солнцем. */
function drawPlanet(p, timeSec, layer) {
  const pos = planetPosition(p);
  const R = planetScreenRadius(p);
  p._screen = { x: pos.x, y: pos.y, r: R }; // для попаданий

  const behind = isBehindSun(pos.rAU, pos.y); // «за» Солнцем или «перед» ним (по истинному расстоянию)
  if ((layer === "back") !== behind) return;
  /* Зашедшая за Солнце планета скрывается его изображением: если центр
     планеты на дальней половине попал под диск Солнца — не рисуем вовсе. */
  if (behind && Math.hypot(pos.x - W / 2, pos.y - H / 2) < sunScreenR + R * 0.35) return;

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
  ctx.ellipse(pos.x, pos.y, mp.orbR, mp.orbR * mp.squash, mp.node, 0, Math.PI * 2);
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

/* ============================================================
   ИНОПЛАНЕТЯНЕ — случайные визиты НЛО в Солнечную систему.
   Визит происходит не по расписанию: каждый кадр есть небольшая
   вероятность появления гостя (средний интервал ~25–60 с реального
   времени при скорости 1×). Корабль входит по гиперболической
   траектории из-за края экрана, делает облё́т вокруг Солнца
   (гравитационный манёвр — по дуге) и улетает прочь. Во время
   визита показывается уведомление; корабль кликабелен — карточка
   «контакта». Экстренно вызвать/скрыть: клавиша U или чекбокс.
   ============================================================ */
const ALIEN_NAMES = [
  { race: "Зета-Ретикульцы", ship: "Разведчик «Искра»",        color: "#7dffb2" },
  { race: "Gliese 667C",     ship: "Крейсер «Туманность»",     color: "#b48cff" },
  { race: "Кеплер-442b",     ship: "Посол «Аврора»",           color: "#ffd75e" },
  { race: "TRAPPIST-1e",     ship: "Сонда «Мерцание»",         color: "#7dd8ff" },
  { race: "Проксима Центавра b", ship: "Штурмовик «Тень»",     color: "#ff9d7a" },
];
const alienState = {
  enabled: true,          // общий выключатель слоя
  active: null,           // текущий визит или null
  lastSpawnReal: -1e9,    // реальное время последнего успешного спавна
  minGapSec: 22,          // минимальная пауза между визитами (реальные сек)
  spawnChancePerSec: 0.06,// базовая вероятность появления за секунду реального времени
};

/* Запуск визита. Возвращает true/false — важно для кнопки «Позвать гостя»:
   раньше вызов «не срабатывал», потому что активный визит уже существовал
   и новый молча отменялся, а после завершения визита поле active могло
   оставаться занятым (см. cleanup в drawAlien). Теперь состояние всегда
   очищается, а повторный вызов форсирует смену гостя. */
function startAlienVisit(nowSec, force = false) {
  if (alienState.active && !force) return false;
  /* Если гость ещё в системе и force=true — прошлый визит просто
     завершается досрочно (корабль уходит со сцены немедленно). */
  const info = ALIEN_NAMES[Math.floor(Math.random() * ALIEN_NAMES.length)];
  /* Точка входа — случайный угол за краем экрана. */
  const angle = Math.random() * Math.PI * 2;
  const R0 = Math.hypot(W, H) / 2 + 80;               // старт за видимой границей
  /* Дуга облёта: пролетаем на расстоянии rFlyby от Солнца. */
  const rFlybyPx = 60 + Math.random() * 120;
  /* Скорость облёта px/сек (реального времени): умеренная, заметная. */
  const speed = 140 + Math.random() * 120;
  /* Направление вращения вокруг Солнца: по или против часовой. */
  const dir = Math.random() < 0.5 ? 1 : -1;
  /* Полный угол облёта: сколько радиан «огибаем» Солнце. */
  const sweep = Math.PI * (0.9 + Math.random() * 1.4); // 0.9π..2.3π
  alienState.active = {
    ...info,
    t0: nowSec,            // старт (сек реального времени)
    angle, R0, rFlybyPx, speed, dir, sweep,
    entryLen: R0 - rFlybyPx, // путь по прямой до начала дуги
    exitExtra: 0,
    totalDur: ((R0 - rFlybyPx) + rFlybyPx * sweep + (R0 - rFlybyPx)) / speed,
    _screen: null,
    warpPhase: 0,          // фаза мерцания/следа
  };
  alienState.lastSpawnReal = nowSec;
  showAlienToast(info);
  return true;
}

/* Позиция корабля по прогрессу визита (прямое вхождение → дуга → уход). */
function alienPosition(a, nowSec) {
  const cx = W / 2, cy = H / 2;
  const s = (nowSec - a.t0) * a.speed;   // пройденный путь, px
  if (s <= 0 || s >= a.totalDur * a.speed) return null; // до старта / после конца
  let x, y;
  /* Позиция считается в МИРОВЫХ координатах (ctx сам применяет zoom).
     Дуга облёта и путь входа — мировые px. */
  const rFb = a.rFlybyPx;
  const rEnter = a.entryLen;
  if (s < rEnter) {
    // входим по прямой к точке касания орбиты облёта
    const k = s / rEnter;
    const tx = cx + Math.cos(a.angle) * rFb;
    const ty = cy + Math.sin(a.angle) * rFb;
    const sx = cx + Math.cos(a.angle) * (rFb + rEnter);
    const sy = cy + Math.sin(a.angle) * (rFb + rEnter);
    x = sx + (tx - sx) * k; y = sy + (ty - sy) * k;
  } else if (s < rEnter + rFb * a.sweep) {
    // облёт Солнца по дуге радиуса rFb
    const arc = (s - rEnter) / rFb;   // radians travelled
    const ang = a.angle + a.dir * arc;
    x = cx + Math.cos(ang) * rFb;
    y = cy + Math.sin(ang) * rFb;
    a._lastAng = ang;
  } else {
    // уход по касательной от точки окончания дуги
    const out = s - rEnter - rFb * a.sweep;
    const ang = a.angle + a.dir * a.sweep;
    const tanX = -Math.sin(ang) * a.dir, tanY = Math.cos(ang) * a.dir;
    x = cx + Math.cos(ang) * rFb + tanX * out;
    y = cy + Math.sin(ang) * rFb + tanY * out;
  }
  return { x, y };
}

/* Отрисовка гостя: строгий минимализм — тёмный сигарообразный корпус с
   бликом, маленькая светящаяся полоса иллюминаторов и тонкий парус-антенна.
   Никаких «тарелок», куполов и мигающих огней. Размер ~16 px на базовом
   зуме, масштабируется вместе с видом. */
function drawAlien(nowSec) {
  const a = alienState.active;
  if (!a) return;
  const pos = alienPosition(a, nowSec);
  if (!pos) {                              // визит завершён — освобождаем слот
    alienState.active = null;
    a._screen = null;
    if (state.selected === a) state.selected = null;
    if (state.hovered === a) state.hovered = null;
    return;
  }
  const sc = state.zoom;   // размер корабля растёт вместе с зумом
  a._screen = { x: pos.x, y: pos.y, r: Math.max(8, 9 * sc) };

  /* Направление полёта — производная траектории (касательная). */
  const ahead = alienPosition(a, nowSec + 0.05);
  const heading = ahead ? Math.atan2(ahead.y - pos.y, ahead.x - pos.x) : 0;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(heading);

  /* Инверсионный след — тонкая затухающая линия за кормой. */
  a.warpPhase += 0.06;
  const trail = ctx.createLinearGradient(-8 * sc, 0, -34 * sc, 0);
  trail.addColorStop(0, hexToRgba(a.color, 0.35));
  trail.addColorStop(1, "rgba(0,0,0,0)");
  ctx.strokeStyle = trail;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-8 * sc, 0); ctx.lineTo(-34 * sc, 0); ctx.stroke();

  /* Корпус: вытянутый эллипс (сигара), градиент от света Солнца. */
  const bodyGrad = ctx.createLinearGradient(0, -2.6 * sc, 0, 2.6 * sc);
  bodyGrad.addColorStop(0, "#9aa4b2");
  bodyGrad.addColorStop(0.45, "#4a5260");
  bodyGrad.addColorStop(1, "#171b22");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8 * sc, 2.4 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(220,228,240,0.25)";
  ctx.lineWidth = 0.6;
  ctx.stroke();

  /* Полоса мягкого света вдоль борта — единственная «декорация». */
  ctx.fillStyle = hexToRgba(a.color, 0.55 + 0.25 * Math.sin(a.warpPhase));
  ctx.fillRect(-5.5 * sc, -0.4 * sc, 11 * sc, 0.8 * sc);

  /* Тонкий «парус»-антенна у носа. */
  ctx.strokeStyle = "rgba(200,210,230,0.5)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(6 * sc, -1.4 * sc); ctx.lineTo(9.5 * sc, -5 * sc);
  ctx.stroke();

  ctx.restore();

  // подпись расы рядом с кораблём
  if (state.showLabels) {
    ctx.fillStyle = hexToRgba(a.color, 0.85);
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(a.race, pos.x, pos.y - 9 * sc - 5);
  }

  // подсветка при наведении/выборе
  const isSel = state.selected === a, isHov = state.hovered === a;
  if (isSel || isHov) {
    ctx.strokeStyle = isSel ? "rgba(255,215,106,0.9)" : hexToRgba(a.color, 0.6);
    ctx.lineWidth = 1.5; ctx.setLineDash(isSel ? [] : [3, 4]);
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 13 * sc, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* Уведомление о прибытии гостей (внизу по центру, автоисчезает). */
const alienToast = document.getElementById("alienToast");
let toastTimer = null;
function showAlienToast(info) {
  if (!alienToast) return;
  alienToast.innerHTML = `Неопознанный объект: борт <b>${info.ship}</b> (${info.race}) вошёл в систему`;
  alienToast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => alienToast.classList.remove("show"), 5200);
}

/* Проверка спавна визита — в каждом кадре, с пуассоновской вероятностью. */
/* Случайный визит: пуассоновская проверка каждый кадр, но с гарантией —
   если с прошлого спавна прошло больше 90 с, гость приходит гарантированно.
   Раньше «вызов не срабатывал», потому что active мог не очищаться после
   завершения визита; теперь очистка идёт в drawAlien (см. cleanup). */
function maybeSpawnAlien(dtSec, nowSec) {
  if (!alienState.enabled || !state.playing) return;
  if (alienState.active) return;                       // гость ещё в системе
  const since = nowSec - alienState.lastSpawnReal;
  if (since < alienState.minGapSec) return;            // короткая пауза между визитами
  const overdue = since > 90 ? 1 : alienState.spawnChancePerSec * dtSec;
  if (Math.random() < overdue) startAlienVisit(nowSec);
}

function pickAlien(mx, my) {
  const a = alienState.active;
  if (!a || !a._screen) return null;
  /* Радиус попадания — как у корабля (масштабируется зумом), +5 px запаса. */
  return Math.hypot(mx - a._screen.x, my - a._screen.y) <= a._screen.r + 5 ? a : null;
}

function showAlienInfo(a) {
  state.selected = a;
  infoIcon.style.background = `radial-gradient(circle at 32% 30%, #ffffff, ${a.color} 45%, #101a30)`;
  infoName.textContent = `${a.ship}`;
  infoSize.textContent = "≈ 22 м (диаметр диска)";
  infoDist.textContent = "внекаталогный объект — траектория облёта Солнца";
  infoPeriod.textContent = "гиперболический пролёт (не периодическая орбита)";
  infoMoons.textContent = "—";
  infoType.textContent = `Разведчик цивилизации ${a.race}`;
  infoDesc.textContent = "Случайный межзвёздный гость. Визиты нерегулярны: следующий может " +
    "случайно начаться в любой момент. Клавиша U — включить/выключить слой пришельцев.";
  infoPanel.classList.remove("hidden");
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
  maybeSpawnAlien(dt, timeSec);          // случайные визиты инопланетян
  drawBackground(timeSec);               // звёздный фон — вне масштаба (бесконечно далёк)
  /* Трансформация масштаба вида: всё «мировое» содержимое рисуется с
     scale(zoom) вокруг центра экрана. Клик/наведение пересчитываются
     обратно через toWorld(). */
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(state.zoom, state.zoom);
  ctx.translate(-W / 2, -H / 2);
  drawOrbits();                          // орбиты планет: эллипсы Кеплера или упрощённые круги
  drawCometOrbits();                     // эллиптические орбиты комет (пунктир)
  /* Дальний слой: тела «за» Солнцем — их перекроет диск Солнца */
  drawBelt(timeSec, "back");             // дальняя половина пояса астероидов
  for (const p of PLANETS) drawPlanet(p, timeSec, "back");
  drawComets(timeSec, "back");           // кометы за Солнцем
  const alienPosNow = alienState.active ? alienPosition(alienState.active, timeSec) : null;
  if (alienPosNow && alienPosNow.y < H / 2) drawAlien(timeSec);  // НЛО за Солнцем
  drawSun(timeSec);                      // Солнце поверх дальних тел
  /* Ближний слой: тела «перед» Солнцем */
  for (const p of PLANETS) drawPlanet(p, timeSec, "front");
  drawBelt(timeSec, "front");            // ближняя половина пояса
  drawComets(timeSec, "front");          // кометы перед Солнцем: ядро + кома + хвост
  if (alienPosNow && alienPosNow.y >= H / 2) drawAlien(timeSec); // НЛО перед Солнцем
  ctx.restore();

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
  const al = alienState.enabled ? pickAlien(mx, my) : null;
  if (al) return { alien: al };
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

/* Преобразование экранных координат курсора в координаты «мира» с учётом
   текущего масштаба вида (state.zoom). Центр масштабирования — экранная
   середина; без этого клики и наведение «мимо» промахивались бы при zoom≠1. */
function toWorld(mx, my) {
  return { x: (mx - W / 2) / state.zoom + W / 2, y: (my - H / 2) / state.zoom + H / 2 };
}

canvas.addEventListener("mousemove", (e) => {
  const wpt = toWorld(e.clientX, e.clientY);
  const hit = pickAny(wpt.x, wpt.y);
  state.hovered = hit ? (hit.alien || hit.comet || hit.asteroid || hit.planet) : null;
  canvas.classList.toggle("hovering", !!hit);
  if (hit) {
    tooltip.textContent = hit.alien
      ? `🛸 ${hit.alien.ship} — незваный гость (нажмите для подробностей)`
      : hit.comet
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
  const wpt = toWorld(e.clientX, e.clientY);
  const hit = pickAny(wpt.x, wpt.y);
  if (hit && hit.alien) showAlienInfo(hit.alien);
  else if (hit && hit.comet) showInfo(null, null, null, hit.comet);
  else if (hit && hit.asteroid) showInfo(null, null, hit.asteroid);
  else if (hit) showInfo(hit.planet, hit.moon);
  else hideInfo();
});

/* Колесо мыши над космосом — масштабирование вида (с зажатым Ctrl — скорость) */
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.ctrlKey) {
    // Ctrl+колесо: шаг скорости по логарифмической шкале (×1.25 за щелчок)
    const l = Math.log10(state.speed) + (e.deltaY < 0 ? 0.1 : -0.1);
    setSpeed(Math.pow(10, Math.min(3, Math.max(-1.301, l))));
  } else {
    setZoom(state.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  }
}, { passive: false });

/* Тач-поддержка */
canvas.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  const wpt = toWorld(t.clientX, t.clientY);
  const hit = pickAny(wpt.x, wpt.y);
  if (hit && hit.alien) { showAlienInfo(hit.alien); e.preventDefault(); }
  else if (hit && hit.comet) { showInfo(null, null, null, hit.comet); e.preventDefault(); }
  else if (hit && hit.asteroid) { showInfo(null, null, hit.asteroid); e.preventDefault(); }
  else if (hit) { showInfo(hit.planet, hit.moon); e.preventDefault(); }
}, { passive: true });

/* ---------- Управление: воспроизведение / пауза / скорость / масштаб ---------- */
const btnPlayPause = document.getElementById("btnPlayPause");
const btnReset     = document.getElementById("btnReset");
const speedSlider  = document.getElementById("speedSlider");
const speedLabel   = document.getElementById("speedLabel");
const presetBtns   = [...document.querySelectorAll(".speed-presets button[data-speed]")];
const zoomSlider   = document.getElementById("zoomSlider");
const zoomLabel    = document.getElementById("zoomLabel");
const zoomBtns     = [...document.querySelectorAll(".speed-presets button[data-zoom]")];

function updatePlayButton() {
  btnPlayPause.textContent = state.playing ? "⏸ Пауза" : "▶ Играть";
}

/* Форматирование множителя скорости: «разы от реальной» — дробные значения
   до 1× показываем с точностью до сотых, крупные — без дробей. */
function fmtSpeed(v) {
  if (v < 0.1) return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "×";
  if (v < 10)  return (+v.toFixed(2)) + "×";
  return Math.round(v) + "×";
}

/* Скорость задаётся ЧИСЛОМ (разы от реальной). Ползунок — логарифмический:
   его позиция t = log10(speed), диапазон 0.05× … 1000×. Так «иксы на
   увеличение» распределены равномерно по десятичным порядкам. */
function setSpeed(v) {
  v = Math.min(1000, Math.max(0, v));
  state.speed = v;
  speedSlider.value = v > 0 ? Math.log10(v) : -1.301;
  speedLabel.textContent = fmtSpeed(v);
  presetBtns.forEach(b => b.classList.toggle("active", parseFloat(b.dataset.speed) === v));
}

/* Масштаб вида: весь мир рисуется в ctx c трансформацией scale(zoom) вокруг
   центра экрана; клики пересчитываются обратно через toWorld(). */
function setZoom(z) {
  z = Math.min(8, Math.max(0.6, z));
  state.zoom = z;
  zoomSlider.value = z;
  zoomLabel.textContent = (z < 1 ? z.toFixed(1) : (+z.toFixed(2))) + "×";
  zoomBtns.forEach(b => b.classList.toggle("active", parseFloat(b.dataset.zoom) === z));
}

btnPlayPause.addEventListener("click", () => {
  state.playing = !state.playing;
  updatePlayButton();
});

btnReset.addEventListener("click", () => {
  state.simDays = 0;
  setSpeed(0.05);   // стартовая скорость: 0.05× от реальной
  setZoom(1);       // и возврат масштаба к обзору всей системы
  state.playing = true;
  updatePlayButton();
  hideInfo();
});

/* ---------- Переключатель режима орбит: эллипсы Кеплера / упрощённые круги ---------- */
const btnOrbitMode = document.getElementById("btnOrbitMode");

function updateOrbitModeButton() {
  const isEllipse = state.orbitMode === "ellipse";
  btnOrbitMode.textContent = isEllipse ? "◯ Упрощённые орбиты" : "🪐 Эллипсы Кеплера";
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

speedSlider.addEventListener("input", () => setSpeed(Math.pow(10, parseFloat(speedSlider.value))));
presetBtns.forEach(b => b.addEventListener("click", () => setSpeed(parseFloat(b.dataset.speed))));
zoomSlider.addEventListener("input", () => setZoom(parseFloat(zoomSlider.value)));
zoomBtns.forEach(b => b.addEventListener("click", () => setZoom(parseFloat(b.dataset.zoom))));

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
document.getElementById("chkAliens").addEventListener("change", (e) => {
  alienState.enabled = e.target.checked;
  if (!alienState.enabled) {
    alienState.active = null;                                  // прогнать гостя
    if (state.selected && state.selected.ship) hideInfo();
  }
});
/* Кнопка «позвать гостя» — для демонстрации без ожидания случайного спавна */
document.getElementById("btnAlienCall").addEventListener("click", () => {
  if (!alienState.enabled) {
    alienState.enabled = true;
    document.getElementById("chkAliens").checked = true;
  }
  /* force=true: если предыдущий гость завис/ещё летит — он досрочно
     завершает визит, новый появляется гарантированно по нажатию. */
  startAlienVisit(performance.now() / 1000, true);
});

/* Сноска: только номер версии сборки — без описаний и подробностей
   (требование пользователя: «пусть отображается только версия приложения»).
   Длинный текст не размещается в одну строку и залезал на легенду. */
const footnote = document.getElementById("footnote");
footnote.textContent = VERSION;

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
  } else if ((e.key === "u" || e.key === "U" || e.key === "г" || e.key === "Г") &&
             !e.ctrlKey && !e.metaKey && !e.altKey) {
    alienState.enabled = !alienState.enabled;
    const chk = document.getElementById("chkAliens");
    chk.checked = alienState.enabled;
    if (!alienState.enabled) {
      alienState.active = null;
      if (state.selected && state.selected.ship) hideInfo();
    }
  } else if (e.key === "+" || e.key === "=") {
    // шаг по логарифмической шкале: ×1.25 за нажатие
    setSpeed(Math.pow(10, Math.min(3, Math.log10(state.speed || 0.05) + 0.1)));
  } else if (e.key === "-") {
    setSpeed(Math.pow(10, Math.max(-1.301, Math.log10(state.speed || 0.05) - 0.1)));
  } else if (e.key === "[" ) {
    setZoom(state.zoom / 1.2);
  } else if (e.key === "]") {
    setZoom(state.zoom * 1.2);
  }
});

setSpeed(0.05);   // старт: 0.05× от реальной скорости
setZoom(1);
updatePlayButton();
