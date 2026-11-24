/* RSIM - dashboards 16:9 (toile logique 1600 x 900).
   Dispositions inspirees des vrais ecrans de course (afficheurs GT3 d'origine, loggers, volants
   de proto, ecrans larges, rallye), sans logos. Utilise les aides de dash.js
   (rr, text, FONTS, ledColors, fmtTime, gearTxt, num, clamp, rpmFrac, seg7, segNum). */
"use strict";
(function () {
  const W = 1600, H = 900;
  const F = FONTS;
  const has = v => v !== null && v !== undefined && !isNaN(v);
  const dCol = (d, good = "#21e05d", bad = "#ff3b30") => !has(d.delta) ? "#ffffff" : d.delta <= 0 ? good : bad;
  const dTxt = d => has(d.delta) ? (d.delta > 0 ? "+" : d.delta < 0 ? "-" : "") + Math.abs(d.delta).toFixed(2) : "--.--";
  const fuelLow = d => has(d.fuelLaps) && d.fuelLaps < 2;
  const blink = (t, hz = 4) => Math.floor(t * hz) % 2 === 0;

  function cell(c, x, y, w, h, o = {}) {
    if (o.bg) { rr(c, x, y, w, h, o.r ?? 0); c.fillStyle = o.bg; c.fill(); }
    if (o.border) { rr(c, x, y, w, h, o.r ?? 0); c.lineWidth = o.bw || 2; c.strokeStyle = o.border; c.stroke(); }
    if (o.head) { c.save(); rr(c, x, y, w, h, o.r ?? 0); c.clip(); c.fillStyle = o.head; c.fillRect(x, y, w, o.hh || 34); c.restore(); }
    if (o.label) text(c, o.label, o.lc === "c" ? x + w / 2 : x + 14, y + (o.hh || 34) / 2 + 1, o.ls || 22, o.lcol || "#9aa3ad", o.font || F.sans, o.lc === "c" ? "center" : "left", "700");
    if (o.value !== undefined) {
      const top = o.label ? (o.hh || 34) : 0;
      text(c, o.value, o.va === "l" ? x + 16 : o.va === "r" ? x + w - 16 : x + w / 2, y + top + (h - top) / 2 + 3, o.vs || 54, o.vcol || "#fff", o.vf || F.cond, o.va === "l" ? "left" : o.va === "r" ? "right" : "center", o.vw || "700");
    }
  }
  function ledRow(c, d, x, y, w, n, t, o = {}) {
    const cols = ledColors(d, n, o.mode || "lr", t), gap = w / n, r = o.r || Math.min(gap * 0.34, 22);
    for (let i = 0; i < n; i++) {
      const cx = x + gap * i + gap / 2, col = cols[i];
      c.beginPath(); c.arc(cx, y, r + 3, 0, Math.PI * 2); c.fillStyle = "#0a0a0a"; c.fill();
      const base = col || o.off || "#202326";
      const g = c.createRadialGradient(cx - r * 0.3, y - r * 0.35, 1, cx, y, r);
      g.addColorStop(0, col ? "#ffffff" : "#454a50"); g.addColorStop(0.35, base); g.addColorStop(1, col ? base : "#121416");
      if (col) { c.shadowColor = col; c.shadowBlur = 22; }
      c.beginPath(); c.arc(cx, y, r, 0, Math.PI * 2); c.fillStyle = g; c.fill(); c.shadowBlur = 0;
    }
  }
  function ledBars(c, d, x, y, w, h, n, t, o = {}) {
    const cols = ledColors(d, n, o.mode || "lr", t), gap = w / n;
    for (let i = 0; i < n; i++) {
      const col = cols[i]; c.fillStyle = col || "#1b1d20";
      if (col) { c.shadowColor = col; c.shadowBlur = 16; }
      rr(c, x + gap * i + 4, y, gap - 8, h, 4); c.fill(); c.shadowBlur = 0;
    }
  }
  function alarm(c, x, y, r, on, col, lbl) {
    c.beginPath(); c.arc(x, y, r + 3, 0, Math.PI * 2); c.fillStyle = "#050505"; c.fill();
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = on ? col : "#1d2024";
    if (on) { c.shadowColor = col; c.shadowBlur = 20; } c.fill(); c.shadowBlur = 0;
    if (lbl) text(c, lbl, x, y + 1, r * 0.7, on ? "#000" : "#4a5056", F.sans, "center", "800");
  }
  function tyres4(c, x, y, w, h, d, o = {}) {
    const g = 8, cw = (w - g) / 2, ch = (h - g) / 2;
    for (let i = 0; i < 4; i++) {
      const tx = x + (i % 2) * (cw + g), ty = y + Math.floor(i / 2) * (ch + g), tt = d.tyreT ? d.tyreT[i] : null, tp = d.tyreP ? d.tyreP[i] : null;
      rr(c, tx, ty, cw, ch, o.r ?? 6); c.fillStyle = tempCol(tt, 65, 95, 105); c.fill();
      text(c, has(tt) ? Math.round(tt) + "°" : "--", tx + cw / 2, ty + ch * (o.press ? 0.36 : 0.52), Math.min(ch * 0.5, 40), "#000", F.cond, "center", "800");
      if (o.press) text(c, has(tp) ? tp.toFixed(tp > 5 ? 1 : 2) : "-.--", tx + cw / 2, ty + ch * 0.74, Math.min(ch * 0.3, 24), "#000", F.mono, "center", "700");
    }
  }
  function deltaBar(c, x, y, w, h, d, o = {}) {
    rr(c, x, y, w, h, h / 2); c.fillStyle = o.bg || "#15181c"; c.fill();
    if (!has(d.delta)) return;
    const v = clamp(d.delta, -1, 1), mid = x + w / 2, bw = (w / 2 - 4) * Math.abs(v);
    c.fillStyle = dCol(d); rr(c, v < 0 ? mid - bw : mid, y + 3, bw, h - 6, (h - 6) / 2); c.fill();
    c.fillStyle = "#fff"; c.fillRect(mid - 1.5, y - 4, 3, h + 8);
  }
  function rpmArc(c, d, cx, cy, r, th, a0, a1, segs, o = {}) {
    const max = d.maxRpm > 500 ? d.maxRpm : 8000, f = clamp(d.rpm / max, 0, 1);
    for (let i = 0; i < segs; i++) {
      const p = i / segs, a = a0 + (a1 - a0) * p, b = a0 + (a1 - a0) * (i + 0.78) / segs, on = (i + 0.5) / segs <= f;
      c.beginPath(); c.arc(cx, cy, r, a, b); c.arc(cx, cy, r - th, b, a, true); c.closePath();
      c.fillStyle = on ? (p > 0.9 ? (o.c3 || "#ff2a1a") : p > 0.72 ? (o.c2 || "#ffd000") : (o.c1 || "#ffffff")) : (o.off || "#24272c");
      if (on && o.glow) { c.shadowColor = c.fillStyle; c.shadowBlur = o.glow; } c.fill(); c.shadowBlur = 0;
    }
    if (o.scale) for (let k = 0; k <= Math.floor(max / 1000); k++) {
      const a = a0 + (a1 - a0) * (k * 1000 / max);
      text(c, String(k), cx + Math.cos(a) * (r - th - 34), cy + Math.sin(a) * (r - th - 34), o.ss || 30, o.sc || "#c8ced4", F.cond, "center", "700");
    }
  }

  /* ===================== 1. GT3 OEM (afficheur d'origine GT3) ===================== */
  function gt3oem(c, d, th, t) {
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    ledRow(c, d, 330, 40, 940, 10, t);
    // LEDs laterales : alarmes a gauche, regime a droite
    const al = [[d.tcActive, "#ff8c00"], [d.absActive, "#ffd400"], [d.limiter, "#2f7bff"], [fuelLow(d), "#ff2a1a"], [d.water > 105, "#ff2a1a"]];
    al.forEach(([on, col], i) => alarm(c, 34, 220 + i * 120, 18, !!on, col));
    const sc = ledColors(d, 5, "lr", t);
    for (let i = 0; i < 5; i++) alarm(c, W - 34, 700 - i * 120, 18, !!sc[i], sc[i] || "#000");
    const B = "#4a4f55", L = th.label || "#9aa3ad";
    cell(c, 80, 90, 420, 150, { border: B, label: "SPEED", lcol: L, value: num(d.speed, 0), vs: 96 });
    cell(c, 80, 255, 420, 300, { border: B, label: "DELTA", lcol: L });
    text(c, dTxt(d), 290, 400, 110, dCol(d), F.cond, "center", "800");
    deltaBar(c, 110, 490, 360, 26, d);
    cell(c, 560, 90, 480, 465, { border: B });
    text(c, gearTxt(d.gear), 800, 315, 400, d.limiter ? (blink(t) ? "#2f7bff" : "#fff") : (th.gear || "#fff"), F.cond, "center", "800");
    cell(c, 1100, 90, 420, 150, { border: B, label: "LAP / POS", lcol: L, value: (d.lap || 0) + "  P" + (d.pos || "-"), vs: 72 });
    const g4 = [["TC", d.tc, d.tcActive, "#1a3fd0"], ["ABS", d.abs, d.absActive, "#d09000"], ["MAP", d.map, false], ["BB", has(d.bb) ? d.bb.toFixed(1) : "--", false]];
    g4.forEach(([l, v, act, ac], i) => {
      const x = 1100 + (i % 2) * 215, y = 255 + Math.floor(i / 2) * 152;
      cell(c, x, y, 205, 142, { border: B, bg: act ? ac : null, label: l, lcol: act ? "#fff" : L, value: num(v, 0) === "--" && l !== "BB" ? "--" : (l === "BB" ? v : num(v)), vs: 72 });
    });
    [["CURRENT", fmtTime(d.cur), "#fff"], ["LAST", fmtTime(d.last), "#fff"], ["BEST", fmtTime(d.best), "#c86bff"]].forEach(([l, v, col], i) =>
      cell(c, 80 + i * 485, 575, 470, 135, { border: B, label: l, lcol: L, value: v, vs: 68, vcol: col, vf: F.cond }));
    cell(c, 80, 730, 250, 140, { border: B, label: "FUEL L", lcol: L, value: num(d.fuel, 1), vs: 62 });
    cell(c, 345, 730, 250, 140, { border: B, bg: fuelLow(d) && blink(t) ? "#7a0d08" : null, label: "LAPS", lcol: L, value: num(d.fuelLaps, 1), vs: 62 });
    cell(c, 610, 730, 250, 140, { border: B, label: "L / LAP", lcol: L, value: d.fuelPerLap ? d.fuelPerLap.toFixed(2) : "-.--", vs: 62 });
    cell(c, 875, 730, 250, 140, { border: B, label: "WATER", lcol: L, value: num(d.water, 0) + "°", vs: 62, vcol: d.water > 105 ? "#ff3b30" : "#fff" });
    cell(c, 1140, 730, 380, 140, { border: B });
    tyres4(c, 1150, 740, 360, 120, d);
  }

  /* ===================== 2. Logger arc (style dash logger compact) ===================== */
  function loggerArc(c, d, th, t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#22252b"); g.addColorStop(1, "#111316");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    ledRow(c, d, 400, 38, 800, 10, t, { r: 20 });
    rpmArc(c, d, 800, 640, 560, 70, Math.PI * 1.12, Math.PI * 1.88, 48, { scale: true, c1: th.accent || "#3fa9ff", glow: 10, ss: 34 });
    text(c, gearTxt(d.gear), 800, 470, 330, "#fff", F.cond, "center", "800");
    text(c, num(d.speed, 0), 800, 650, 70, "#fff", F.cond, "center", "700");
    text(c, "km/h", 800, 700, 26, "#9aa3ad", F.sans, "center", "600");
    const lb = th.label || "#ffd400";
    [[d.water > 105, "#ff3b30", "H₂O"], [d.absActive, "#ffd400", "ABS"], [d.tcActive, "#ff8c00", "TC"], [d.limiter, "#2f7bff", "PIT"]].forEach(([on, col, l], i) =>
      alarm(c, 60, 240 + i * 110, 34, !!on, col, l));
    [[fuelLow(d), "#ff3b30", "FUEL"], [d.lights, "#21e05d", "LGT"], [has(d.delta) && d.delta < 0, "#21e05d", "Δ-"], [has(d.delta) && d.delta > 0, "#ff3b30", "Δ+"]].forEach(([on, col, l], i) =>
      alarm(c, W - 60, 240 + i * 110, 34, !!on, col, l));
    const bx = [["LAP TIME", fmtTime(d.cur)], ["BEST", fmtTime(d.best)], ["FUEL", num(d.fuel, 1) + " L"], ["WATER", num(d.water, 0) + "°C"]];
    bx.forEach(([l, v], i) => cell(c, 70 + i * 370, 740, 350, 135, { bg: "#0b0c0e", border: "#e8e8e8", bw: 3, r: 14, label: l, lcol: lb, lc: "c", ls: 24, value: v, vs: 60 }));
  }

  /* ===================== 3. Volant proto (ecran de volant) ===================== */
  function protoWheel(c, d, th, t) {
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    ledBars(c, d, 250, 18, 1100, 46, 10, t);
    [[d.tcActive, "#ff8c00"], [d.absActive, "#ffd400"], [d.limiter, "#2f7bff"]].forEach(([on, col], i) => alarm(c, 50, 120 + i * 90, 24, !!on, col));
    [[fuelLow(d), "#ff2a1a"], [d.water > 105, "#ff2a1a"], [has(d.delta) && d.delta < 0, "#21e05d"]].forEach(([on, col], i) => alarm(c, W - 50, 120 + i * 90, 24, !!on, col));
    text(c, Math.round(d.rpm), 800, 120, 64, rpmFrac(d) > 0.95 ? "#ff2a1a" : "#c8ced4", F.cond, "center", "700");
    text(c, gearTxt(d.gear), 800, 430, 420, "#fff", F.cond, "center", "800");
    // colonne gauche
    rr(c, 110, 90, 470, 230, 12); c.fillStyle = has(d.delta) ? (d.delta <= 0 ? "#0d7a2c" : "#9a120a") : "#1a1d21"; c.fill();
    text(c, "DELTA", 345, 128, 28, "#ffffffcc", F.sans, "center", "800");
    text(c, dTxt(d), 345, 235, 130, "#fff", F.cond, "center", "800");
    cell(c, 110, 340, 470, 160, { bg: "#141619", r: 12, label: "LAP", lcol: "#9aa3ad", value: fmtTime(d.cur), vs: 76 });
    cell(c, 110, 520, 470, 160, { bg: "#141619", r: 12, label: "LAST", lcol: "#9aa3ad", value: fmtTime(d.last), vs: 76 });
    cell(c, 1020, 90, 470, 230, { bg: "#141619", r: 12, label: "SPEED", lcol: "#9aa3ad", value: num(d.speed, 0), vs: 140 });
    cell(c, 1020, 340, 470, 160, { bg: "#141619", r: 12, label: "FUEL L / LAPS", lcol: "#9aa3ad", value: num(d.fuel, 1) + " / " + num(d.fuelLaps, 1), vs: 66, vcol: fuelLow(d) ? "#ff3b30" : "#fff" });
    cell(c, 1020, 520, 470, 160, { bg: "#141619", r: 12, label: "BEST", lcol: "#9aa3ad", value: fmtTime(d.best), vs: 76, vcol: "#c86bff" });
    // tuiles de couleur en bas (reglages)
    const tiles = [["TC", num(d.tc), "#1f4fff", "#fff", d.tcActive], ["BB", has(d.bb) ? d.bb.toFixed(1) : "--", "#8a2be2", "#fff"], ["MAP", num(d.map), "#ff7a00", "#000"], ["ABS", num(d.abs), "#ffd400", "#000", d.absActive]];
    tiles.forEach(([l, v, bg, fg, act], i) => {
      const x = 110 + i * 350;
      const flash = act && blink(t, 8), tf = flash ? "#000" : fg;
      rr(c, x, 715, 330, 160, 14); c.fillStyle = flash ? "#ffffff" : bg; c.fill();
      text(c, l, x + 165, 752, 30, tf, F.sans, "center", "800");
      text(c, v, x + 165, 825, 84, tf, F.cond, "center", "800");
    });
  }

  /* ===================== 4. Ecran large (tableaux de voies) ===================== */
  function wideLogger(c, d, th, t) {
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    const max = d.maxRpm > 500 ? d.maxRpm : 8000, f = clamp(d.rpm / max, 0, 1), n = 60;
    for (let i = 0; i < n; i++) {
      const p = i / n, on = (i + 0.5) / n <= f, x = 60 + i * (1480 / n), hh = 40 + p * 70;
      c.fillStyle = on ? (p > 0.9 ? "#ff2a1a" : p > 0.75 ? "#ffd000" : "#21e05d") : "#16181b";
      if (p > 0.9 && on && blink(t, 10) && f > 0.97) c.fillStyle = "#2f7bff";
      c.fillRect(x, 150 - hh, 1480 / n - 6, hh);
    }
    for (let k = 0; k <= Math.floor(max / 1000); k++) text(c, String(k), 60 + (k * 1000 / max) * 1480, 178, 26, "#8b939c", F.mono, "center", "700");
    const am = th.accent || "#ffb000";
    const rows = [["WATER", num(d.water, 0) + " °C", d.water > 105], ["OIL", num(d.oil, 0) + " °C"], ["FUEL", num(d.fuel, 1) + " L", fuelLow(d)], ["FUEL/LAP", d.fuelPerLap ? d.fuelPerLap.toFixed(2) : "-.--"],
      ["BRAKE BAL", has(d.bb) ? d.bb.toFixed(1) + " %" : "--"], ["TC / ABS", num(d.tc) + " / " + num(d.abs)]];
    rows.forEach(([l, v, warn], i) => {
      const y = 215 + i * 92;
      c.fillStyle = warn && blink(t) ? "#5a0a06" : (i % 2 ? "#0b0c0e" : "#111316"); c.fillRect(60, y, 500, 86);
      text(c, l, 80, y + 44, 28, am, F.mono, "left", "700"); text(c, v, 540, y + 44, 48, "#fff", F.mono, "right", "700");
    });
    cell(c, 610, 215, 380, 455, { border: "#3a3f45", bw: 3 });
    text(c, gearTxt(d.gear), 800, 420, 360, "#fff", F.cond, "center", "800");
    text(c, num(d.speed, 0) + " km/h", 800, 625, 52, "#c8ced4", F.cond, "center", "700");
    const tr = [["LAP", String(d.lap || 0)], ["CURRENT", fmtTime(d.cur)], ["LAST", fmtTime(d.last)], ["BEST", fmtTime(d.best)], ["DELTA", dTxt(d)], ["POSITION", "P" + (d.pos || "-")]];
    tr.forEach(([l, v], i) => {
      const y = 215 + i * 92;
      c.fillStyle = i % 2 ? "#0b0c0e" : "#111316"; c.fillRect(1040, y, 500, 86);
      text(c, l, 1060, y + 44, 28, am, F.mono, "left", "700");
      text(c, v, 1520, y + 44, 48, l === "DELTA" ? dCol(d) : l === "BEST" ? "#c86bff" : "#fff", F.mono, "right", "700");
    });
    // barre d'etat
    const st = d.limiter ? ["PIT LIMITER", "#2f7bff"] : fuelLow(d) ? ["LOW FUEL", "#ff2a1a"] : d.water > 105 ? ["WATER TEMP", "#ff2a1a"] : null;
    if (st) { c.fillStyle = blink(t, 3) ? st[1] : "#000"; c.fillRect(610, 700, 380, 70); text(c, st[0], 800, 736, 40, "#fff", F.sans, "center", "800"); }
    tyres4(c, 60, 785, 500, 100, d, { press: true });
    deltaBar(c, 1040, 800, 500, 34, d);
  }

  /* ===================== 5. Rallye moderne (Rally1/Rally2) ===================== */
  function rallyModern(c, d, th, t) {
    const g = c.createRadialGradient(800, 450, 100, 800, 450, 900); g.addColorStop(0, "#14161a"); g.addColorStop(1, "#020203");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const max = d.maxRpm > 500 ? d.maxRpm : 8000, f = clamp(d.rpm / max, 0, 1), n = 40, acc = th.accent || "#ff7a00";
    for (let i = 0; i < n; i++) {
      const p = i / n, on = (i + 0.5) / n <= f, x = 70 + i * 36.5;
      c.beginPath(); c.moveTo(x + 14, 40); c.lineTo(x + 34, 40); c.lineTo(x + 20, 150); c.lineTo(x, 150); c.closePath();
      c.fillStyle = on ? (p > 0.88 ? "#ff1a0d" : p > 0.7 ? acc : "#f2f2f2") : "#1c1e22";
      if (on && f > 0.97 && blink(t, 10)) c.fillStyle = "#2f7bff";
      c.fill();
    }
    text(c, "STAGE", 800, 178, 22, "#8b939c", F.sans, "center", "800");
    text(c, fmtTime(d.cur), 800, 238, 70, "#fff", F.mono, "center", "700");
    text(c, gearTxt(d.gear), 800, 520, 420, acc, F.cond, "center", "800");
    text(c, num(d.speed, 0), 330, 470, 190, "#fff", F.cond, "center", "800");
    text(c, "KM/H", 330, 580, 30, "#8b939c", F.sans, "center", "800");
    const rv = [["WATER", num(d.water, 0) + "°", d.water > 105], ["OIL", num(d.oil, 0) + "°"], ["BOOST", has(d.turbo) ? d.turbo.toFixed(2) : "--"]];
    rv.forEach(([l, v, w], i) => { text(c, l, 1160, 340 + i * 105, 26, "#8b939c", F.sans, "left", "800");
      text(c, v, 1480, 340 + i * 105, 64, w && blink(t) ? "#ff3b30" : "#fff", F.cond, "right", "800"); });
    // pedales (bord gauche/droit)
    const pb = (x, v, col) => { rr(c, x, 260, 34, 520, 8); c.fillStyle = "#1a1c20"; c.fill(); const h = 520 * clamp(v || 0, 0, 1); rr(c, x, 780 - h, 34, h, 8); c.fillStyle = col; c.fill(); };
    pb(40, d.brake, "#ff3b30"); pb(W - 74, d.throttle, "#21e05d");
    tyres4(c, 140, 700, 380, 170, d);
    cell(c, 560, 720, 480, 150, { bg: "#0d0f12", r: 12, label: "LAST STAGE", lcol: "#8b939c", value: fmtTime(d.last), vs: 66 });
    cell(c, 1080, 720, 380, 150, { bg: d.limiter ? "#2f7bff" : "#0d0f12", r: 12, label: d.limiter ? "LIMITER" : "FUEL L", lcol: "#cfd5da", value: d.limiter ? "PIT" : num(d.fuel, 1), vs: 66 });
  }

  /* ===================== 6. Monoplace (volant formule) ===================== */
  function formula(c, d, th, t) {
    c.fillStyle = "#050505"; c.fillRect(0, 0, W, H);
    rr(c, 20, 90, W - 40, H - 110, 40); c.fillStyle = "#000"; c.fill(); c.lineWidth = 6; c.strokeStyle = "#1d1f23"; c.stroke();
    // 15 LEDs : 5 vertes, 5 rouges, 5 bleues
    const max = d.maxRpm > 500 ? d.maxRpm : 8000, f = clamp(d.rpm / max, 0, 1), lit = Math.round(clamp((f - 0.75) / 0.22, 0, 1) * 15);
    const all = f > 0.975;
    for (let i = 0; i < 15; i++) {
      const col = i < 5 ? "#21e05d" : i < 10 ? "#ff2a1a" : "#2f7bff", on = all ? blink(t, 10) : i < lit, x = 240 + i * 80;
      c.beginPath(); c.arc(x, 48, 24, 0, Math.PI * 2); c.fillStyle = on ? (all ? "#2f7bff" : col) : "#191b1e";
      if (on) { c.shadowColor = c.fillStyle; c.shadowBlur = 20; } c.fill(); c.shadowBlur = 0;
    }
    rr(c, 600, 130, 400, 440, 20); c.lineWidth = 5; c.strokeStyle = "#e8e8e8"; c.stroke();
    text(c, gearTxt(d.gear), 800, 365, 400, "#fff", F.cond, "center", "800");
    const card = (x, y, l, v, col) => { rr(c, x, y, 470, 205, 18); c.fillStyle = "#121417"; c.fill();
      text(c, l, x + 24, y + 36, 28, "#8b939c", F.sans, "left", "800"); text(c, v, x + 446, y + 130, 96, col || "#fff", F.cond, "right", "800"); };
    card(90, 130, "DELTA", dTxt(d), dCol(d)); card(90, 365, "LAP", fmtTime(d.cur));
    card(1040, 130, "SPEED", num(d.speed, 0)); card(1040, 365, "POS / LAP", "P" + (d.pos || "-") + " · " + (d.lap || 0));
    const tiles = [["MAP", num(d.map), "#ff7a00"], ["BB", has(d.bb) ? d.bb.toFixed(1) : "--", "#21c55d"], ["TC", num(d.tc), "#1f4fff"], ["FUEL", num(d.fuel, 1), "#ffd400"], ["LAST", fmtTime(d.last), "#9a9a9a"]];
    tiles.forEach(([l, v, col], i) => { const x = 90 + i * 270, w = i === 4 ? 340 : 250;
      rr(c, x, 610, w, 230, 18); c.fillStyle = col; c.fill(); text(c, l, x + w / 2, 650, 30, "#000", F.sans, "center", "800");
      text(c, v, x + w / 2, 750, i === 4 ? 70 : 96, "#000", F.cond, "center", "800"); });
  }

  /* ===================== 7. Endurance nuit (faible luminosite) ===================== */
  function enduranceNight(c, d, th, t) {
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    const A = th.accent || "#ff5a1f", dim = "#6e2a14", lab = "#8a4a32";
    c.globalAlpha = 0.85;
    ledBars(c, d, 300, 24, 1000, 28, 12, t, { mode: "center" });
    c.globalAlpha = 1;
    text(c, "DELTA", 800, 105, 26, lab, F.sans, "center", "800");
    text(c, dTxt(d), 800, 195, 130, has(d.delta) ? (d.delta <= 0 ? "#3fbf5a" : "#d8402a") : A, F.cond, "center", "800");
    text(c, gearTxt(d.gear), 800, 520, 330, A, F.cond, "center", "800");
    text(c, num(d.speed, 0), 800, 700, 60, dim === "" ? A : "#c0583a", F.cond, "center", "700");
    const col = (x, items) => items.forEach(([l, v, w], i) => { text(c, l, x, 300 + i * 150, 26, lab, F.sans, "left", "800");
      text(c, v, x, 365 + i * 150, 76, w && blink(t, 2) ? "#ff2a1a" : A, F.cond, "left", "800"); });
    col(90, [["FUEL L", num(d.fuel, 1)], ["LAPS LEFT", num(d.fuelLaps, 1), fuelLow(d)], ["L / LAP", d.fuelPerLap ? d.fuelPerLap.toFixed(2) : "-.--"]]);
    col(1130, [["LAST", fmtTime(d.last)], ["BEST", fmtTime(d.best)], ["SESSION", fmtClock(d.sessionLeft)]]);
    c.globalAlpha = 0.9; tyres4(c, 90, 760, 300, 120, d); c.globalAlpha = 1;
    [["TC", num(d.tc)], ["ABS", num(d.abs)], ["BB", has(d.bb) ? d.bb.toFixed(1) : "--"], ["MAP", num(d.map)]].forEach(([l, v], i) => {
      const x = 470 + i * 270; rr(c, x, 770, 250, 110, 10); c.lineWidth = 2; c.strokeStyle = dim; c.stroke();
      text(c, l, x + 20, 800, 24, lab, F.sans, "left", "800"); text(c, v, x + 230, 840, 56, A, F.cond, "right", "800"); });
    if (d.limiter) { text(c, "PIT LIMITER", 800, 760, 34, blink(t) ? "#3a7bff" : "#000", F.sans, "center", "800"); }
  }

  /* ===================== 8. Combine numerique (voiture de route) ===================== */
  function roadCluster(c, d, th, t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0a1424"); g.addColorStop(1, "#02050a");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const acc = th.accent || "#35c8ff";
    const dial = (cx, val, max, step, lbl, red, div) => {
      const r = 285, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, f = clamp((val || 0) / max, 0, 1);
      c.beginPath(); c.arc(cx, 470, r, a0, a1); c.lineWidth = 16; c.strokeStyle = "#16233a"; c.stroke();
      if (red) { c.beginPath(); c.arc(cx, 470, r, a0 + (a1 - a0) * red / max, a1); c.strokeStyle = "#6a1010"; c.stroke(); }
      const gg = c.createLinearGradient(cx - r, 0, cx + r, 0); gg.addColorStop(0, acc); gg.addColorStop(1, f > 0.9 && red ? "#ff3b30" : "#9ff0ff");
      c.beginPath(); c.arc(cx, 470, r, a0, a0 + (a1 - a0) * f); c.lineWidth = 16; c.strokeStyle = gg; c.shadowColor = acc; c.shadowBlur = 24; c.stroke(); c.shadowBlur = 0;
      for (let v = 0; v <= max + 1e-6; v += step) { const a = a0 + (a1 - a0) * v / max;
        text(c, String(Math.round(v / div)), cx + Math.cos(a) * (r - 60), 470 + Math.sin(a) * (r - 60), 34, "#b9c7d8", F.sans, "center", "600"); }
      const a = a0 + (a1 - a0) * f; c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 110), 470 + Math.sin(a) * (r - 110)); c.lineTo(cx + Math.cos(a) * (r + 6), 470 + Math.sin(a) * (r + 6));
      c.lineWidth = 7; c.lineCap = "round"; c.strokeStyle = "#ff5a3a"; c.stroke();
      text(c, lbl, cx, 640, 28, "#7f93ab", F.sans, "center", "600");
    };
    const max = d.maxRpm > 500 ? Math.ceil(d.maxRpm / 1000) * 1000 : 8000;
    dial(355, d.rpm, max, 1000, "x1000 tr/min", (d.maxRpm || max) * 0.9, 1000);
    dial(1245, d.speed, 300, 30, "km/h", 0, 1);
    text(c, Math.round(d.speed || 0), 1245, 470, 120, "#fff", F.sans, "center", "300");
    text(c, gearTxt(d.gear), 355, 470, 160, "#fff", F.sans, "center", "300");
    rr(c, 670, 180, 260, 580, 26); c.fillStyle = "rgba(20,40,70,0.55)"; c.fill(); c.lineWidth = 2; c.strokeStyle = "#1f3a60"; c.stroke();
    text(c, fmtTime(d.cur), 800, 240, 40, "#fff", F.sans, "center", "400");
    text(c, "BEST " + fmtTime(d.best), 800, 288, 22, "#8fb3d9", F.sans, "center", "400");
    const fb = d.fuelCap ? clamp(d.fuel / d.fuelCap, 0, 1) : 0;
    text(c, "⛽", 700, 380, 30, fuelLow(d) ? "#ffb000" : "#8fb3d9", F.sans, "left", "400");
    rr(c, 745, 368, 165, 24, 12); c.fillStyle = "#13233a"; c.fill(); rr(c, 745, 368, 165 * fb, 24, 12); c.fillStyle = fuelLow(d) ? "#ffb000" : acc; c.fill();
    text(c, num(d.fuel, 0) + " L", 800, 430, 34, "#fff", F.sans, "center", "400");
    text(c, "EAU " + num(d.water, 0) + "°C", 800, 500, 30, d.water > 105 ? "#ff3b30" : "#fff", F.sans, "center", "400");
    text(c, "P" + (d.pos || "-") + " · TOUR " + (d.lap || 0), 800, 570, 26, "#8fb3d9", F.sans, "center", "400");
    deltaBar(c, 690, 640, 220, 22, d, { bg: "#13233a" });
    text(c, dTxt(d), 800, 710, 40, dCol(d, "#3fe08a", "#ff6a4a"), F.sans, "center", "600");
    // voyants
    [[d.absActive, "#ffb000", "ABS"], [d.tcActive, "#ffb000", "TC"], [d.lights, "#3fe08a", "FEUX"], [d.limiter, "#35c8ff", "PIT"]].forEach(([on, col, l], i) =>
      text(c, l, 560 + i * 160, 850, 38, on ? col : "#1c2a3e", F.sans, "center", "800"));
  }

  /* ===================== 9. Retro fluorescent (afficheur VFD annees 80-90) ===================== */
  function retroVFD(c, d, th, t) {
    c.fillStyle = "#030806"; c.fillRect(0, 0, W, H);
    const on = th.accent || "#38ffd0", off = "rgba(56,255,208,0.07)";
    c.shadowColor = on; c.shadowBlur = 0;
    const max = d.maxRpm > 500 ? d.maxRpm : 8000, f = clamp(d.rpm / max, 0, 1), n = 36;
    for (let i = 0; i < n; i++) {
      const p = i / n, lit = (i + 0.5) / n <= f, x = 90 + i * 39, h = 40 + Math.pow(p, 1.4) * 170;
      c.fillStyle = lit ? (p > 0.86 ? "#ff4a3a" : on) : off;
      if (lit) { c.shadowColor = c.fillStyle; c.shadowBlur = 14; } c.fillRect(x, 260 - h, 30, h); c.shadowBlur = 0;
    }
    for (let k = 0; k <= Math.floor(max / 1000); k++) text(c, String(k), 105 + (k * 1000 / max) * n * 39, 292, 28, on, F.mono, "center", "700");
    text(c, "x1000 RPM", 1510, 60, 22, on, F.mono, "right", "700");
    c.shadowColor = on; c.shadowBlur = 12;
    segNum(c, String(Math.round(d.speed || 0)), 110, 380, 120, 230, on, off, 0.28, 3);
    text(c, "km/h", 600, 610, 34, on, F.mono, "left", "700");
    seg7(c, gearTxt(d.gear), 760, 360, 170, 300, on, off);
    const rows = [["WATER", Math.round(d.water || 0)], ["OIL", Math.round(d.oil || d.water || 0)], ["FUEL", Math.round(d.fuel || 0)]];
    rows.forEach(([l, v], i) => { const y = 350 + i * 110; text(c, l, 1030, y + 40, 30, on, F.mono, "left", "700");
      segNum(c, String(v), 1270, y, 52, 84, (l === "WATER" && d.water > 105) ? "#ff4a3a" : on, off, 0.3, 3); });
    c.shadowBlur = 8;
    text(c, "LAP " + fmtTime(d.cur), 110, 760, 56, on, F.mono, "left", "700");
    text(c, "BEST " + fmtTime(d.best), 110, 840, 40, on, F.mono, "left", "700");
    if (d.limiter) text(c, "PIT", 1300, 800, 70, blink(t) ? on : off, F.mono, "left", "800");
    c.shadowBlur = 0;
  }

  const FAM = { gt3oem, loggerArc, protoWheel, wideLogger, rallyModern, formula, enduranceNight, roadCluster, retroVFD };
  Object.assign(RSIM.FAMILIES, FAM);
  RSIM.H169 = { W, H, cell, ledRow, ledBars, alarm, tyres4, deltaBar, rpmArc, dCol, dTxt, fuelLow, blink, has };
  RSIM.ASPECT = Object.fromEntries(Object.keys(FAM).map(k => [k, [W, H]]));
})();
