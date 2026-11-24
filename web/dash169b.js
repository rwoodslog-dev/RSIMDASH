/* RSIM - dashboards 16:9, serie 2 (toile 1600 x 900). Charge apres dash169.js. */
"use strict";
(function () {
  const { W, H, cell, ledRow, ledBars, alarm, tyres4, deltaBar, rpmArc, dCol, dTxt, fuelLow, blink, has } = RSIM.H169;
  const F = FONTS;

  /* ---------- Minimal : rapport geant + barre de shift ---------- */
  function minimal(c, d, th, t) {
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    const f = clamp(rpmFrac(d), 0, 1), cols = ledColors(d, 1, "lr", t);
    rr(c, 80, 60, 1440, 40, 20); c.fillStyle = "#121212"; c.fill();
    rr(c, 80, 60, 1440 * f, 40, 20); c.fillStyle = f > 0.96 ? (blink(t, 10) ? "#2f7bff" : "#ff1a0d") : f > 0.85 ? "#ff1a0d" : f > 0.7 ? "#ffd000" : "#21e05d"; c.fill();
    text(c, gearTxt(d.gear), 800, 500, 640, th.gear || "#fff", F.cond, "center", "800");
    text(c, num(d.speed, 0), 800, 840, 70, "#6d747c", F.cond, "center", "700");
  }

  /* ---------- Coach delta : tout sur le delta ---------- */
  function coachDelta(c, d, th, t) {
    const good = has(d.delta) && d.delta <= 0;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, has(d.delta) ? (good ? "#03240f" : "#2a0705") : "#0b0d10"); g.addColorStop(1, "#000");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    text(c, "DELTA vs MEILLEUR", 800, 90, 34, "#8b939c", F.sans, "center", "800");
    text(c, dTxt(d), 800, 330, 300, dCol(d), F.cond, "center", "800");
    deltaBar(c, 200, 520, 1200, 50, d);
    text(c, "−1.0", 200, 600, 26, "#21e05d", F.mono, "center", "700"); text(c, "+1.0", 1400, 600, 26, "#ff3b30", F.mono, "center", "700");
    cell(c, 120, 680, 430, 170, { bg: "#0f1114", r: 14, label: "TOUR", value: fmtTime(d.cur), vs: 72 });
    cell(c, 585, 680, 430, 170, { bg: "#0f1114", r: 14, label: "MEILLEUR", value: fmtTime(d.best), vs: 72, vcol: "#c86bff" });
    cell(c, 1050, 680, 430, 170, { bg: "#0f1114", r: 14, label: "RAPPORT · KM/H", value: gearTxt(d.gear) + " · " + num(d.speed, 0), vs: 72 });
  }

  /* ---------- Drift neon ---------- */
  function driftNeon(c, d, th, t) {
    c.fillStyle = "#07020c"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) { c.strokeStyle = "rgba(255,0,180,0.06)"; c.beginPath(); c.moveTo(0, 500 + i * 26); c.lineTo(W, 500 + i * 26); c.stroke(); }
    const pk = th.accent || "#ff2bd6", cy = "#2bf3ff";
    rpmArc(c, d, 800, 760, 640, 60, Math.PI * 1.08, Math.PI * 1.92, 60, { c1: cy, c2: pk, c3: "#ffffff", off: "#1a0b24", glow: 18, scale: true, sc: "#b78ad0", ss: 32 });
    c.shadowColor = pk; c.shadowBlur = 40;
    text(c, gearTxt(d.gear), 800, 520, 360, pk, F.cond, "center", "800");
    c.shadowColor = cy; c.shadowBlur = 30;
    text(c, num(d.speed, 0), 800, 730, 110, cy, F.cond, "center", "800");
    c.shadowBlur = 0;
    text(c, "KM/H", 800, 805, 30, "#b78ad0", F.sans, "center", "800");
    text(c, Math.round(d.rpm || 0) + " RPM", 140, 840, 44, cy, F.mono, "left", "700");
    text(c, has(d.turbo) ? "BOOST " + d.turbo.toFixed(2) : "", 1460, 840, 44, pk, F.mono, "right", "700");
  }

  /* ---------- Karting / club (chrono au centre) ---------- */
  function kart(c, d, th, t) {
    c.fillStyle = "#e9ecef"; c.fillRect(0, 0, W, H);
    rr(c, 40, 40, W - 80, H - 80, 40); c.fillStyle = "#1b1e22"; c.fill();
    ledRow(c, d, 300, 110, 1000, 8, t, { r: 26 });
    text(c, fmtTime(d.cur), 800, 330, 190, "#fff", F.mono, "center", "700");
    text(c, "BEST " + fmtTime(d.best), 800, 470, 70, "#ffd400", F.mono, "center", "700");
    cell(c, 110, 560, 440, 260, { bg: "#0f1114", r: 20, label: "RPM", lc: "c", value: Math.round(d.rpm || 0), vs: 110 });
    cell(c, 580, 560, 440, 260, { bg: "#0f1114", r: 20, label: "RAPPORT", lc: "c", value: gearTxt(d.gear), vs: 170 });
    cell(c, 1050, 560, 440, 260, { bg: "#0f1114", r: 20, label: "EAU °C", lc: "c", value: num(d.water, 0), vs: 110, vcol: d.water > 105 ? "#ff3b30" : "#fff" });
  }

  /* ---------- Cup car (bandeaux gris, rapport a droite) ---------- */
  function cupCar(c, d, th, t) {
    c.fillStyle = "#0a0a0a"; c.fillRect(0, 0, W, H);
    ledBars(c, d, 60, 24, 1480, 34, 16, t);
    const band = (y, h, l, v, col) => { c.fillStyle = "#2b2d31"; c.fillRect(60, y, 980, 46); text(c, l, 80, y + 24, 28, "#d0d4d8", F.sans, "left", "800");
      c.fillStyle = "#131416"; c.fillRect(60, y + 46, 980, h - 46); text(c, v, 1020, y + 46 + (h - 46) / 2, Math.min(96, h * 0.72), col || "#fff", F.cond, "right", "800"); };
    band(90, 190, "DELTA", dTxt(d), dCol(d)); band(300, 170, "LAP TIME", fmtTime(d.cur)); band(490, 170, "LAST LAP", fmtTime(d.last));
    band(680, 190, "FUEL L · LAPS", num(d.fuel, 1) + " · " + num(d.fuelLaps, 1), fuelLow(d) ? "#ff3b30" : "#fff");
    c.fillStyle = "#131416"; c.fillRect(1080, 90, 460, 560);
    text(c, gearTxt(d.gear), 1310, 360, 470, d.limiter && blink(t) ? "#2f7bff" : "#ffd400", F.cond, "center", "800");
    text(c, num(d.speed, 0) + " km/h", 1310, 610, 54, "#c8ced4", F.cond, "center", "700");
    [["TC", d.tc, d.tcActive], ["ABS", d.abs, d.absActive]].forEach(([l, v, a], i) => {
      cell(c, 1080 + i * 235, 680, 225, 190, { bg: a ? "#c86b00" : "#2b2d31", label: l, lc: "c", lcol: "#fff", value: num(v), vs: 96 }); });
  }

  /* ---------- Hypercar (energie / hybride, bleu nuit) ---------- */
  function hypercar(c, d, th, t) {
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#020617"); g.addColorStop(1, "#06142e"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const acc = th.accent || "#00e1ff";
    ledBars(c, d, 300, 26, 1000, 30, 12, t, { mode: "center" });
    text(c, gearTxt(d.gear), 865, 360, 380, "#fff", F.cond, "center", "800");
    text(c, num(d.speed, 0), 865, 600, 80, acc, F.cond, "center", "700");
    // jauge "energie" = carburant/stint
    const fe = d.fuelCap ? clamp(d.fuel / d.fuelCap, 0, 1) : 0;
    text(c, "ÉNERGIE / FUEL", 120, 110, 26, "#7aa5d8", F.sans, "left", "800");
    for (let i = 0; i < 18; i++) { c.fillStyle = (i + 0.5) / 18 <= fe ? (fe < 0.15 ? "#ff3b30" : acc) : "#0d2344"; rr(c, 120, 840 - i * 36, 120, 28, 5); c.fill(); }
    text(c, num(d.fuel, 1) + " L", 120, 160, 40, "#fff", F.cond, "left", "700");
    cell(c, 290, 140, 380, 170, { bg: "#0a1b36", r: 14, label: "DELTA", lcol: "#7aa5d8", value: dTxt(d), vcol: dCol(d), vs: 90 });
    cell(c, 290, 330, 380, 150, { bg: "#0a1b36", r: 14, label: "LAPS FUEL", lcol: "#7aa5d8", value: num(d.fuelLaps, 1), vs: 76, vcol: fuelLow(d) ? "#ff3b30" : "#fff" });
    cell(c, 1070, 140, 420, 170, { bg: "#0a1b36", r: 14, label: "LAST", lcol: "#7aa5d8", value: fmtTime(d.last), vs: 76 });
    cell(c, 1070, 330, 420, 150, { bg: "#0a1b36", r: 14, label: "BEST", lcol: "#7aa5d8", value: fmtTime(d.best), vs: 70, vcol: "#c86bff" });
    [["TC", num(d.tc), "#1f4fff"], ["ABS", num(d.abs), "#ffd400"], ["BB", has(d.bb) ? d.bb.toFixed(1) : "--", "#8a2be2"], ["MAP", num(d.map), "#ff7a00"]].forEach(([l, v, col], i) => {
      const x = 290 + i * 300; rr(c, x, 690, 280, 170, 14); c.fillStyle = "#0a1b36"; c.fill(); c.fillStyle = col; c.fillRect(x, 690, 280, 10);
      text(c, l, x + 22, 735, 28, "#7aa5d8", F.sans, "left", "800"); text(c, v, x + 258, 810, 80, "#fff", F.cond, "right", "800"); });
    tyres4(c, 1070, 500, 420, 170, d, { press: true });
  }

  /* ---------- Tourisme jour (fond clair, lisible au soleil) ---------- */
  function touringDay(c, d, th, t) {
    c.fillStyle = "#f4f5f7"; c.fillRect(0, 0, W, H);
    ledRow(c, d, 300, 50, 1000, 12, t, { r: 24, off: "#c8ccd2" });
    const L = "#5b636c", box = (x, y, w, h, l, v, col) => { rr(c, x, y, w, h, 14); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 3; c.strokeStyle = "#d3d7dc"; c.stroke();
      text(c, l, x + 20, y + 32, 26, L, F.sans, "left", "800"); text(c, v, x + w - 20, y + h / 2 + 22, Math.min(90, h * 0.55), col || "#111", F.cond, "right", "800"); };
    rr(c, 560, 110, 480, 520, 20); c.fillStyle = "#111"; c.fill();
    text(c, gearTxt(d.gear), 800, 380, 430, th.gear || "#ffd400", F.cond, "center", "800");
    box(80, 110, 440, 160, "VITESSE", num(d.speed, 0)); box(80, 290, 440, 160, "DELTA", dTxt(d), has(d.delta) ? (d.delta <= 0 ? "#0a8a35" : "#c4170c") : "#111");
    box(80, 470, 440, 160, "TOUR", fmtTime(d.cur));
    box(1080, 110, 440, 160, "DERNIER", fmtTime(d.last)); box(1080, 290, 440, 160, "MEILLEUR", fmtTime(d.best), "#7a2fd0"); box(1080, 470, 440, 160, "POS / TOUR", "P" + (d.pos || "-") + " · " + (d.lap || 0));
    [["TC", num(d.tc)], ["ABS", num(d.abs)], ["BB", has(d.bb) ? d.bb.toFixed(1) : "--"], ["FUEL", num(d.fuel, 1)], ["EAU", num(d.water, 0) + "°"]].forEach(([l, v], i) => box(80 + i * 290, 670, 270, 190, l, v));
  }

  /* ---------- Stock car (compte-tours numerique + pressions) ---------- */
  function stockCar(c, d, th, t) {
    c.fillStyle = "#101010"; c.fillRect(0, 0, W, H);
    const max = d.maxRpm > 500 ? d.maxRpm : 9000, f = clamp((d.rpm || 0) / max, 0, 1);
    rr(c, 60, 60, 1480, 250, 20); c.fillStyle = "#000"; c.fill();
    text(c, Math.round(d.rpm || 0), 1480, 165, 170, f > 0.95 ? "#ff3b30" : "#ffb000", F.mono, "right", "700");
    text(c, "RPM", 100, 120, 34, "#777", F.sans, "left", "800");
    rr(c, 100, 262, 1380, 30, 6); c.fillStyle = "#1d1d1d"; c.fill(); rr(c, 100, 262, 1380 * f, 30, 6); c.fillStyle = f > 0.95 ? "#ff3b30" : "#ffb000"; c.fill();
    const g = [["WATER", num(d.water, 0) + "°", d.water > 105], ["OIL", num(d.oil, 0) + "°"], ["FUEL", num(d.fuel, 1)], ["SPEED", num(d.speed, 0)]];
    g.forEach(([l, v, w], i) => cell(c, 60 + i * 375, 350, 355, 240, { bg: w && blink(t) ? "#5a0a06" : "#1c1c1c", r: 16, label: l, lc: "c", lcol: "#aaa", ls: 30, value: v, vs: 110 }));
    cell(c, 60, 630, 520, 230, { bg: "#1c1c1c", r: 16, label: "GEAR", lc: "c", lcol: "#aaa", value: gearTxt(d.gear), vs: 170 });
    cell(c, 620, 630, 920, 230, { bg: "#1c1c1c", r: 16, label: "LAP · LAST · POS", lc: "c", lcol: "#aaa", value: (d.lap || 0) + " · " + fmtTime(d.last) + " · P" + (d.pos || "-"), vs: 80 });
  }

  /* ---------- Strategie carburant (page muret) ---------- */
  function fuelStrategy(c, d, th, t) {
    c.fillStyle = "#06090d"; c.fillRect(0, 0, W, H);
    text(c, "STRATÉGIE CARBURANT", 80, 70, 40, "#3fd0ff", F.sans, "left", "800");
    text(c, "P" + (d.pos || "-") + " · TOUR " + (d.lap || 0) + " · SESSION " + fmtClock(d.sessionLeft), 1520, 70, 34, "#8fa3b5", F.sans, "right", "700");
    const fe = d.fuelCap ? clamp(d.fuel / d.fuelCap, 0, 1) : 0;
    rr(c, 80, 130, 1440, 90, 16); c.fillStyle = "#121820"; c.fill();
    rr(c, 80, 130, 1440 * fe, 90, 16); c.fillStyle = fuelLow(d) ? "#ff3b30" : "#2fbf5a"; c.fill();
    text(c, num(d.fuel, 1) + " L / " + num(d.fuelCap, 0) + " L", 800, 177, 52, "#fff", F.cond, "center", "800");
    const lapsSess = d.sessionLeft && d.last ? d.sessionLeft / d.last : null;
    const need = lapsSess && d.fuelPerLap ? Math.max(0, lapsSess * d.fuelPerLap - d.fuel) : null;
    const items = [["CONSO / TOUR", d.fuelPerLap ? d.fuelPerLap.toFixed(2) + " L" : "--"], ["TOURS RESTANTS (FUEL)", num(d.fuelLaps, 1)],
      ["TOURS RESTANTS (SESSION)", lapsSess ? lapsSess.toFixed(1) : "--"], ["À AJOUTER POUR FINIR", need !== null ? need.toFixed(1) + " L" : "--"],
      ["DERNIER TOUR", fmtTime(d.last)], ["MEILLEUR TOUR", fmtTime(d.best)]];
    items.forEach(([l, v], i) => cell(c, 80 + (i % 3) * 485, 270 + Math.floor(i / 3) * 300, 465, 280,
      { bg: "#0f141b", r: 16, label: l, lcol: "#8fa3b5", ls: 26, hh: 50, value: v, vs: 100, vcol: i === 3 && need > 0 ? "#ffb000" : "#fff" }));
  }

  /* ---------- Moniteur pneus & freins ---------- */
  function tyreMonitor(c, d, th, t) {
    c.fillStyle = "#05070a"; c.fillRect(0, 0, W, H);
    text(c, "PNEUS & FREINS", 800, 60, 40, "#3fd0ff", F.sans, "center", "800");
    const pos = [[120, 120], [920, 120], [120, 500], [920, 500]], names = ["AVANT G", "AVANT D", "ARRIÈRE G", "ARRIÈRE D"];
    pos.forEach(([x, y], i) => {
      const tt = d.tyreT ? d.tyreT[i] : null, tp = d.tyreP ? d.tyreP[i] : null, bt = d.brakeT ? d.brakeT[i] : null, tw = d.tyreWear ? d.tyreWear[i] : null;
      rr(c, x, y, 560, 340, 22); c.fillStyle = "#10151c"; c.fill();
      rr(c, x + 20, y + 20, 200, 300, 30); c.fillStyle = tempCol(tt, 65, 95, 105); c.fill();
      text(c, has(tt) ? Math.round(tt) + "°" : "--", x + 120, y + 150, 80, "#000", F.cond, "center", "800");
      text(c, has(tp) ? tp.toFixed(tp > 5 ? 1 : 2) : "-.--", x + 120, y + 240, 44, "#000", F.mono, "center", "700");
      text(c, names[i], x + 250, y + 50, 30, "#8fa3b5", F.sans, "left", "800");
      text(c, "FREIN", x + 250, y + 120, 26, "#8fa3b5", F.sans, "left", "700");
      text(c, has(bt) ? Math.round(bt) + "°" : "--", x + 540, y + 160, 80, has(bt) && bt > 800 ? "#ff3b30" : has(bt) && bt < 200 ? "#2f7bff" : "#fff", F.cond, "right", "800");
      const wp = has(tw) ? (tw > 1.5 ? tw / 100 : tw) : null;
      text(c, "USURE", x + 250, y + 250, 26, "#8fa3b5", F.sans, "left", "700");
      text(c, wp !== null ? Math.round(wp * 100) + "%" : "--", x + 540, y + 285, 64, "#fff", F.cond, "right", "800");
    });
    text(c, "BB " + (has(d.bb) ? d.bb.toFixed(1) : "--") + "  ·  ABS " + num(d.abs) + "  ·  TC " + num(d.tc), 800, 870, 34, "#c8ced4", F.sans, "center", "700");
  }

  /* ---------- Pedales (coaching) ---------- */
  function pedals(c, d, th, t) {
    c.fillStyle = "#06080b"; c.fillRect(0, 0, W, H);
    const bar = (x, v, col, l) => { rr(c, x, 120, 200, 640, 18); c.fillStyle = "#141922"; c.fill();
      const h = 640 * clamp(v || 0, 0, 1); rr(c, x, 760 - h, 200, h, 18); c.fillStyle = col; c.fill();
      text(c, Math.round((v || 0) * 100) + "%", x + 100, 820, 56, "#fff", F.cond, "center", "800"); text(c, l, x + 100, 80, 30, "#8fa3b5", F.sans, "center", "800"); };
    bar(120, d.clutch, "#3f8bff", "EMBRAYAGE"); bar(380, d.brake, "#ff3b30", "FREIN"); bar(640, d.throttle, "#21e05d", "ACCÉLÉRATEUR");
    text(c, gearTxt(d.gear), 1200, 330, 360, "#fff", F.cond, "center", "800");
    text(c, num(d.speed, 0) + " km/h", 1200, 600, 80, "#c8ced4", F.cond, "center", "700");
    text(c, dTxt(d), 1200, 760, 80, dCol(d), F.cond, "center", "800");
    if (d.absActive) text(c, "ABS", 480, 450, 60, blink(t, 8) ? "#fff" : "#ff3b30", F.sans, "center", "800");
    if (d.tcActive) text(c, "TC", 740, 450, 60, blink(t, 8) ? "#fff" : "#ffb000", F.sans, "center", "800");
  }

  /* ---------- Synthwave (fun) ---------- */
  function synthwave(c, d, th, t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1a0533"); g.addColorStop(0.55, "#3d0a4f"); g.addColorStop(0.56, "#0a0012"); g.addColorStop(1, "#000");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const sun = c.createLinearGradient(0, 160, 0, 500); sun.addColorStop(0, "#ffd319"); sun.addColorStop(1, "#ff2975");
    c.beginPath(); c.arc(800, 500, 300, Math.PI, 0); c.fillStyle = sun; c.fill();
    for (let i = 0; i < 6; i++) { c.fillStyle = "#3d0a4f"; c.fillRect(500, 330 + i * 30, 600, 6 + i * 2); }
    c.strokeStyle = "#ff2bd6"; c.lineWidth = 2; const off = (t * 60) % 60;
    for (let i = 0; i < 10; i++) { const y = 500 + Math.pow(i / 10, 2) * 400 + off * (i / 10); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(800 + i * 30, 500); c.lineTo(800 + i * 160, H); c.stroke(); }
    c.shadowColor = "#2bf3ff"; c.shadowBlur = 30;
    text(c, gearTxt(d.gear), 800, 360, 300, "#2bf3ff", F.cond, "center", "800");
    c.shadowColor = "#ff2bd6";
    text(c, num(d.speed, 0), 250, 700, 150, "#ff2bd6", F.cond, "center", "800"); text(c, Math.round(d.rpm || 0), 1350, 700, 130, "#ffd319", F.cond, "center", "800");
    c.shadowBlur = 0;
    text(c, "KM/H", 250, 800, 34, "#ffb3ef", F.sans, "center", "800"); text(c, "RPM", 1350, 800, 34, "#ffe99a", F.sans, "center", "800");
    ledBars(c, d, 300, 40, 1000, 30, 20, t);
  }

  const FAM = { minimal, coachDelta, driftNeon, kart, cupCar, hypercar, touringDay, stockCar, fuelStrategy, tyreMonitor, pedals, synthwave };
  Object.assign(RSIM.FAMILIES, FAM);
  Object.keys(FAM).forEach(k => RSIM.ASPECT[k] = [W, H]);
})();
