/* RSIM Dash - rendu des dashboards (Canvas 2D). Toile logique 1000 x 450 (format 20:9). */
"use strict";
const W = 1000, H = 450;
const FONTS = {
  mono: "'Roboto Mono', 'DejaVu Sans Mono', ui-monospace, monospace",
  sans: "'Roboto', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  cond: "'Roboto Condensed', sans-serif-condensed, 'Arial Narrow', 'DejaVu Sans Condensed', sans-serif",
};

/* ---------- utilitaires ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (v === null || v === undefined || isNaN(v)) ? "--" : Number(v).toFixed(d);
function fmtTime(s) {
  if (s === null || s === undefined || s <= 0) return "-:--.---";
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ":" + (r < 10 ? "0" : "") + r.toFixed(3);
}
function fmtClock(s) {
  if (s === null || s === undefined) return "--:--";
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(r).padStart(2, "0");
}
const gearTxt = g => g < 0 ? "R" : g === 0 ? "N" : String(g);
function tempCol(t, cold, ok, hot) {
  if (t === null || t === undefined || isNaN(t)) return "#333";
  if (t < cold) return "#2f7bff";
  if (t < ok) return "#21c55d";
  if (t < hot) return "#ffb000";
  return "#ff3b30";
}
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function text(c, s, x, y, size, color, font, align = "center", weight = "700", base = "middle") {
  c.font = `${weight} ${size}px ${font}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = base; c.fillText(s, x, y);
}
function rpmFrac(d) {
  const max = d.maxRpm > 500 ? d.maxRpm : 8000;
  return clamp(d.rpm / max, 0, 1.05);
}
/* LEDs de rapport : renvoie un tableau de couleurs (null = eteinte) */
function ledColors(d, n, mode, t) {
  const f = rpmFrac(d), start = 0.72, shift = d.shiftRpm && d.maxRpm ? clamp(d.shiftRpm / d.maxRpm, 0.85, 0.99) : 0.965;
  const flash = f >= shift + 0.015;
  if (d.limiter) return Array.from({ length: n }, (_, i) => (Math.floor(t * 4) % 2 ? (i % 2 ? "#2f7bff" : null) : (i % 2 ? null : "#2f7bff")));
  if (flash) return Array(n).fill(Math.floor(t * 10) % 2 ? "#2f7bff" : null);
  const lit = clamp((f - start) / (shift - start), 0, 1);
  const out = Array(n).fill(null);
  if (mode === "center") {
    const half = Math.ceil(n / 2), on = Math.round(lit * half);
    for (let i = 0; i < on; i++) {
      const col = i < half * 0.45 ? "#21e05d" : i < half * 0.8 ? "#ffcc00" : "#ff2a1a";
      out[i] = col; out[n - 1 - i] = col;
    }
  } else {
    const on = Math.round(lit * n);
    for (let i = 0; i < on; i++) out[i] = i < n * 0.4 ? "#21e05d" : i < n * 0.73 ? "#ff2a1a" : "#2f7bff";
  }
  return out;
}
function drawLeds(c, d, x, y, w, h, n, mode, shape, t) {
  const cols = ledColors(d, n, mode, t), gap = w / n;
  for (let i = 0; i < n; i++) {
    const cx = x + gap * i + gap / 2, col = cols[i];
    c.fillStyle = col || "#1a1a1a";
    if (col) { c.shadowColor = col; c.shadowBlur = 18; }
    if (shape === "bar") { rr(c, cx - gap * 0.42, y, gap * 0.84, h, 4); c.fill(); }
    else if (shape === "chevron") {
      c.beginPath(); c.moveTo(cx - gap * 0.38, y); c.lineTo(cx + gap * 0.1, y); c.lineTo(cx + gap * 0.38, y + h / 2);
      c.lineTo(cx + gap * 0.1, y + h); c.lineTo(cx - gap * 0.38, y + h); c.lineTo(cx - gap * 0.1, y + h / 2); c.closePath(); c.fill();
    } else { c.beginPath(); c.arc(cx, y + h / 2, Math.min(gap * 0.36, h / 2), 0, Math.PI * 2); c.fill(); }
    c.shadowBlur = 0;
  }
}
function box(c, x, y, w, h, label, val, th, valCol, big = 44) {
  rr(c, x, y, w, h, 10); c.fillStyle = th.panel; c.fill();
  text(c, label, x + 12, y + 18, 15, th.accent, FONTS[th.font] || FONTS.mono, "left", "700");
  text(c, val, x + w - 12, y + h / 2 + 10, big, valCol || th.text, FONTS[th.font] || FONTS.mono, "right", "700");
}
function tyreQuad(c, x, y, w, h, d, th, label = "PNEUS") {
  const f = FONTS[th.font] || FONTS.mono;
  rr(c, x, y, w, h, 10); c.fillStyle = th.panel; c.fill();
  text(c, label, x + 12, y + 16, 14, th.accent, f, "left");
  const cw = (w - 36) / 2, ch = (h - 42) / 2;
  for (let i = 0; i < 4; i++) {
    const cx = x + 12 + (i % 2) * (cw + 12), cy = y + 28 + Math.floor(i / 2) * (ch + 6);
    const tt = d.tyreT[i], tp = d.tyreP[i];
    rr(c, cx, cy, cw, ch, 6); c.fillStyle = tempCol(tt, 65, 95, 105); c.fill();
    const two = ch > 30;
    text(c, num(tt, 0) + "°", two ? cx + cw * 0.3 : cx + cw / 2, cy + ch / 2 + 1, Math.min(22, ch * 0.75), "#000", f);
    if (two) text(c, tp ? tp.toFixed(tp > 5 ? 1 : 2) : "--", cx + cw * 0.75, cy + ch / 2 + 1, Math.min(16, ch * 0.55), "#000", f, "center", "600");
  }
}
function deltaBar(c, x, y, w, h, delta, th) {
  const f = FONTS[th.font] || FONTS.mono;
  rr(c, x, y, w, h, 10); c.fillStyle = th.panel; c.fill();
  if (delta === null || delta === undefined) { text(c, "Δ --.--", x + w / 2, y + h / 2, 34, th.text, f); return; }
  const v = clamp(delta, -2, 2), col = delta <= 0 ? "#21e05d" : "#ff3b30";
  const mid = x + w / 2, bw = (w / 2 - 10) * Math.abs(v) / 2;
  c.fillStyle = "#222"; c.fillRect(x + 10, y + h - 12, w - 20, 5);
  c.fillStyle = col; c.fillRect(v < 0 ? mid - bw : mid, y + h - 14, bw, 9);
  c.fillStyle = "#fff"; c.fillRect(mid - 1, y + h - 16, 2, 13);
  text(c, (delta > 0 ? "+" : "") + delta.toFixed(2), mid, y + h / 2 - 4, 40, col, f);
}

/* ---------- famille GT3 (ecran couleur type afficheur course moderne) ---------- */
function drawGT3(c, d, th, t) {
  const f = FONTS[th.font] || FONTS.mono;
  c.fillStyle = th.bg; c.fillRect(0, 0, W, H);
  drawLeds(c, d, 20, 10, W - 40, 30, 15, th.leds || "lr", th.ledShape || "dot", t);
  // barre regime fine
  const fr = rpmFrac(d);
  c.fillStyle = "#1a1a1a"; c.fillRect(20, 48, W - 40, 6);
  c.fillStyle = fr > 0.95 ? "#ff2a1a" : th.accent; c.fillRect(20, 48, (W - 40) * clamp(fr, 0, 1), 6);
  const warn = th.warn || "#ff3b30";
  if (th.layout === "B") {
    // rapport a droite, delta au centre
    rr(c, 700, 66, 280, 250, 14); c.fillStyle = th.panel; c.fill();
    text(c, gearTxt(d.gear), 840, 196, 230, th.gear, FONTS.cond, "center", "800");
    text(c, num(d.speed, 0), 840, 290, 42, th.text, f);
    deltaBar(c, 20, 66, 665, 70, d.delta, th);
    box(c, 20, 146, 325, 78, "DERNIER", fmtTime(d.last), th, null, 36);
    box(c, 360, 146, 325, 78, "MEILLEUR", fmtTime(d.best), th, "#c86bff", 36);
    box(c, 20, 234, 160, 82, "TC", num(d.tc), th, d.tcActive ? warn : null);
    box(c, 188, 234, 160, 82, "ABS", num(d.abs), th, d.absActive ? warn : null);
    box(c, 356, 234, 160, 82, "MAP", num(d.map), th);
    box(c, 524, 234, 161, 82, "BB", num(d.bb, 1), th, null, 38);
    box(c, 20, 326, 220, 112, "FUEL L", num(d.fuel, 1), th, null, 52);
    box(c, 250, 326, 200, 112, "TOURS", num(d.fuelLaps, 1), th, d.fuelLaps !== null && d.fuelLaps < 2 ? warn : null, 52);
    tyreQuad(c, 460, 326, 260, 112, d, th);
    box(c, 730, 326, 250, 112, "POS / TOUR", (d.pos || "-") + " / " + (d.lap || 0), th, null, 40);
  } else {
    // rapport au centre
    rr(c, 330, 66, 340, 260, 14); c.fillStyle = th.panel; c.fill();
    text(c, gearTxt(d.gear), 500, 190, 240, th.gear, FONTS.cond, "center", "800");
    text(c, num(d.speed, 0) + " km/h", 500, 300, 34, th.text, f);
    box(c, 20, 66, 145, 80, "TC", num(d.tc), th, d.tcActive ? warn : null);
    box(c, 175, 66, 145, 80, "ABS", num(d.abs), th, d.absActive ? warn : null);
    box(c, 20, 156, 145, 80, "MAP", num(d.map), th);
    box(c, 175, 156, 145, 80, "BB", num(d.bb, 1), th, null, 36);
    box(c, 20, 246, 300, 80, "FUEL L / TOURS", num(d.fuel, 1) + " / " + num(d.fuelLaps, 1), th,
      d.fuelLaps !== null && d.fuelLaps < 2 ? warn : null, 38);
    deltaBar(c, 680, 66, 300, 80, d.delta, th);
    box(c, 680, 156, 300, 80, "DERNIER", fmtTime(d.last), th, null, 36);
    box(c, 680, 246, 300, 80, "MEILLEUR", fmtTime(d.best), th, "#c86bff", 36);
    tyreQuad(c, 20, 336, 300, 102, d, th);
    box(c, 330, 336, 340, 102, "TOUR EN COURS", fmtTime(d.cur), th, null, 44);
    box(c, 680, 336, 145, 102, "POS", String(d.pos || "-"), th, null, 48);
    box(c, 835, 336, 145, 102, "EAU", num(d.water, 0) + "°", th, d.water > 105 ? warn : null, 40);
  }
  if (d.limiter) { rr(c, 330, 66, 340, 40, 10); c.fillStyle = "#2f7bff"; c.fill(); text(c, "PIT LIMITER", 500, 87, 26, "#fff", f); }
}

/* ---------- famille Rallye moderne (Rally2 / Rally4) ---------- */
function drawRally(c, d, th, t) {
  const f = FONTS[th.font] || FONTS.mono;
  c.fillStyle = th.bg; c.fillRect(0, 0, W, H);
  drawLeds(c, d, 20, 10, W - 40, 26, 12, th.leds || "lr", "bar", t);
  // bargraphe regime segmente
  const segs = 50, fr = clamp(rpmFrac(d), 0, 1), max = d.maxRpm > 500 ? d.maxRpm : 8000;
  for (let i = 0; i < segs; i++) {
    const on = i / segs < fr, x = 20 + i * ((W - 40) / segs);
    const col = i / segs > 0.88 ? "#ff2a1a" : i / segs > 0.7 ? "#ffcc00" : th.accent;
    c.fillStyle = on ? col : "#161616"; c.fillRect(x + 1, 46, (W - 40) / segs - 3, 44);
  }
  for (let k = 0; k <= Math.floor(max / 1000); k++) {
    const x = 20 + (k * 1000 / max) * (W - 40);
    text(c, String(k), x, 102, 14, "#888", f, "center", "600");
  }
  // centre : rapport
  rr(c, 360, 118, 280, 230, 14); c.fillStyle = th.panel; c.fill();
  text(c, gearTxt(d.gear), 500, 238, 220, th.gear, FONTS.cond, "center", "800");
  // gauche : vitesse + chrono
  box(c, 20, 118, 325, 110, "KM/H", num(d.speed, 0), th, null, 80);
  box(c, 20, 238, 325, 110, "CHRONO", fmtTime(d.cur), th, null, 46);
  // droite : temperatures + fuel
  box(c, 655, 118, 160, 110, "EAU °C", num(d.water, 0), th, d.water > 105 ? "#ff3b30" : null, 50);
  box(c, 825, 118, 155, 110, "HUILE", num(d.oil, 0), th, null, 50);
  box(c, 655, 238, 160, 110, "FUEL L", num(d.fuel, 1), th, null, 44);
  box(c, 825, 238, 155, 110, "TURBO", d.turbo ? d.turbo.toFixed(2) : "--", th, null, 40);
  // bas
  tyreQuad(c, 20, 358, 325, 82, d, th, "PNEUS °C");
  rr(c, 360, 358, 280, 82, 10); c.fillStyle = th.panel; c.fill();
  const thr = clamp(d.throttle, 0, 1), brk = clamp(d.brake, 0, 1);
  c.fillStyle = "#21e05d"; c.fillRect(376, 372, 248 * thr, 22);
  c.fillStyle = "#ff3b30"; c.fillRect(376, 404, 248 * brk, 22);
  text(c, d.limiter ? "LIMITEUR" : d.lights ? "PHARES" : "", 500, 383, 18, "#fff", f);
  box(c, 655, 358, 325, 82, "DERNIER / MEILLEUR", fmtTime(d.last), th, null, 34);
}

/* ---------- famille LCD annees 90-2000 (monochrome 7 segments) ---------- */
const SEG = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc",
  "8": "abcdefg", "9": "abcdfg", "-": "g", "R": "efa", "N": "ceg", " ": "" };
function seg7(c, ch, x, y, w, h, on, off) {
  const t = w * 0.18, s = SEG[ch] !== undefined ? SEG[ch] : "";
  const P = {
    a: [x + t, y, w - 2 * t, t, 0], d: [x + t, y + h - t, w - 2 * t, t, 0], g: [x + t, y + h / 2 - t / 2, w - 2 * t, t, 0],
    f: [x, y + t, t, h / 2 - t * 1.5, 1], b: [x + w - t, y + t, t, h / 2 - t * 1.5, 1],
    e: [x, y + h / 2 + t / 2, t, h / 2 - t * 1.5, 1], c: [x + w - t, y + h / 2 + t / 2, t, h / 2 - t * 1.5, 1],
  };
  for (const k of "abcdefg") {
    const [px, py, pw, ph] = P[k]; c.fillStyle = s.includes(k) ? on : off;
    c.beginPath();
    if (pw > ph) { c.moveTo(px, py + ph / 2); c.lineTo(px + ph / 2, py); c.lineTo(px + pw - ph / 2, py); c.lineTo(px + pw, py + ph / 2); c.lineTo(px + pw - ph / 2, py + ph); c.lineTo(px + ph / 2, py + ph); }
    else { c.moveTo(px + pw / 2, py); c.lineTo(px + pw, py + pw / 2); c.lineTo(px + pw, py + ph - pw / 2); c.lineTo(px + pw / 2, py + ph); c.lineTo(px, py + ph - pw / 2); c.lineTo(px, py + pw / 2); }
    c.closePath(); c.fill();
  }
}
function segNum(c, str, x, y, w, h, on, off, gap = 0.28, digits = null) {
  str = String(str);
  if (digits) str = str.padStart(digits, " ");
  for (let i = 0; i < str.length; i++) seg7(c, str[i], x + i * w * (1 + gap), y, w, h, on, off);
}
function drawLCD(c, d, th, t) {
  const on = th.text, off = th.lcdOff;
  c.fillStyle = "#111"; c.fillRect(0, 0, W, H);
  // cadre + vitre retroeclairee
  rr(c, 10, 10, W - 20, H - 20, 18); c.fillStyle = "#1e1e1e"; c.fill();
  const g = c.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 600);
  g.addColorStop(0, th.backlight); g.addColorStop(1, th.bg);
  rr(c, 28, 28, W - 56, H - 56, 10); c.fillStyle = g; c.fill();
  // bargraphe RPM
  const segs = 40, fr = clamp(rpmFrac(d), 0, 1), max = d.maxRpm > 500 ? d.maxRpm : 8000;
  for (let i = 0; i < segs; i++) {
    const x = 50 + i * 22.5, hh = 18 + i * 1.3;
    c.fillStyle = (i / segs < fr) ? on : off;
    if (i / segs > 0.9 && i / segs < fr && Math.floor(t * 8) % 2) c.fillStyle = off;
    c.fillRect(x, 120 - hh, 17, hh);
  }
  c.font = "600 14px " + FONTS.mono; c.fillStyle = on; c.textAlign = "center";
  for (let k = 0; k <= Math.floor(max / 1000); k++) c.fillText(String(k), 50 + (k * 1000 / max) * 900, 138);
  text(c, "x1000 RPM", 940, 40, 13, on, FONTS.mono, "right", "600");
  // rapport
  seg7(c, gearTxt(d.gear), 420, 160, 120, 210, on, off);
  // vitesse
  text(c, "KM/H", 70, 165, 16, on, FONTS.mono, "left");
  segNum(c, Math.round(d.speed), 60, 180, 70, 120, on, off, 0.3, 3);
  // donnees droite
  const rows = [["EAU", d.water], ["HUILE", d.oil], ["FUEL", d.fuel]];
  rows.forEach(([l, v], i) => {
    const y = 160 + i * 75;
    text(c, l, 620, y + 28, 18, on, FONTS.mono, "left");
    segNum(c, v === null || v === undefined ? "---" : Math.round(v), 760, y, 36, 58, on, off, 0.3, 3);
  });
  // bas : chrono
  text(c, "TEMPS", 70, 345, 16, on, FONTS.mono, "left");
  text(c, fmtTime(d.cur), 70, 385, 40, on, FONTS.mono, "left", "700");
  if (d.limiter) text(c, "PIT", 600, 395, 30, on, FONTS.mono, "left");
  if (d.lights) text(c, "◐", 900, 395, 32, on, FONTS.mono, "left");
}

/* ---------- famille analogique (compteurs a aiguille) ---------- */
function gauge(c, cx, cy, r, val, max, step, th, opts) {
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = v => a0 + (a1 - a0) * clamp(v / max, 0, 1.02);
  c.beginPath(); c.arc(cx, cy, r + 14, 0, Math.PI * 2); c.fillStyle = th.bezel; c.fill();
  c.beginPath(); c.arc(cx, cy, r + 4, 0, Math.PI * 2); c.fillStyle = "#000"; c.fill();
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = th.face; c.fill();
  if (opts.red) { c.beginPath(); c.arc(cx, cy, r - 12, ang(opts.red), a1); c.lineWidth = 14; c.strokeStyle = th.red; c.stroke(); }
  const fnt = FONTS[th.font] || FONTS.sans;
  for (let v = 0; v <= max + 1e-6; v += step / 2) {
    const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    const r1 = r - 4, r2 = r - (major ? 26 : 16);
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    c.lineWidth = major ? 4 : 2; c.strokeStyle = th.ink; c.stroke();
    if (major) text(c, String(Math.round(v / (opts.div || 1))), cx + Math.cos(a) * (r - 48), cy + Math.sin(a) * (r - 48), r * 0.15, th.ink, fnt);
  }
  text(c, opts.label, cx, cy + r * 0.38, r * 0.1, th.ink, fnt, "center", "600");
  if (opts.sub) text(c, opts.sub, cx, cy + r * 0.52, r * 0.085, th.ink, fnt, "center", "400");
  const a = ang(val);
  c.save(); c.shadowColor = "rgba(0,0,0,0.6)"; c.shadowBlur = 8;
  c.beginPath(); c.moveTo(cx - Math.cos(a) * 20, cy - Math.sin(a) * 20); c.lineTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18));
  c.lineWidth = 6; c.strokeStyle = th.needle; c.lineCap = "round"; c.stroke(); c.restore();
  c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2); c.fillStyle = "#222"; c.fill();
}
function miniGauge(c, cx, cy, r, frac, label, th, warn) {
  const a0 = Math.PI * 1.15, a1 = Math.PI * 1.85, a = a0 + (a1 - a0) * clamp(frac, 0, 1);
  c.beginPath(); c.arc(cx, cy, r + 8, 0, Math.PI * 2); c.fillStyle = th.bezel; c.fill();
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = th.face; c.fill();
  c.beginPath(); c.arc(cx, cy, r - 10, a0, a1); c.lineWidth = 4; c.strokeStyle = th.ink; c.stroke();
  c.beginPath(); c.arc(cx, cy, r - 10, a0 + (a1 - a0) * 0.82, a1); c.lineWidth = 6; c.strokeStyle = th.red; c.stroke();
  text(c, label, cx, cy + r * 0.35, r * 0.24, th.ink, FONTS[th.font] || FONTS.sans, "center", "600");
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
  c.lineWidth = 4; c.strokeStyle = warn ? th.red : th.needle; c.stroke();
  c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fillStyle = "#222"; c.fill();
}
function lamp(c, x, y, on, col, label, th) {
  c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.fillStyle = on ? col : "#202020";
  if (on) { c.shadowColor = col; c.shadowBlur = 20; } c.fill(); c.shadowBlur = 0;
  text(c, label, x, y + 26, 12, th.accent, FONTS.sans, "center", "600");
}
function drawAnalog(c, d, th, t) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#161616"); g.addColorStop(1, "#050505");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const tmax = th.tachMax || 8000, red = d.maxRpm > 500 ? Math.min(d.maxRpm * 0.95, tmax) : tmax * 0.85;
  gauge(c, 330, 228, 200, d.rpm, tmax, 1000, th, { red, label: "RPM", sub: "x1000", div: 1000 });
  const smax = th.speedMax || 220;
  gauge(c, 720, 250, 150, d.speed, smax, smax > 200 ? 40 : 20, th, { label: "km/h" });
  miniGauge(c, 70, 110, 52, ((d.water || 40) - 40) / 90, "°C", th, d.water > 105);
  miniGauge(c, 70, 250, 52, d.fuelCap ? d.fuel / d.fuelCap : 0, "FUEL", th, d.fuelCap && d.fuel / d.fuelCap < 0.1);
  miniGauge(c, 930, 100, 52, ((d.oil || d.water || 40) - 40) / 100, "OIL", th, false);
  // petit afficheur de rapport discret (aide sim)
  rr(c, 300, 370, 60, 46, 8); c.fillStyle = "#000"; c.fill();
  text(c, gearTxt(d.gear), 330, 395, 36, th.accent, FONTS.cond, "center", "800");
  lamp(c, 40, 400, d.lights, "#21e05d", "FEUX", th);
  lamp(c, 100, 400, d.limiter, "#ffb000", "LIM", th);
  lamp(c, 160, 400, rpmFrac(d) > 0.97 && Math.floor(t * 10) % 2 === 0, "#ff2a1a", "SHIFT", th);
  text(c, fmtTime(d.cur), 940, 420, 26, th.accent, FONTS.mono, "right", "600");
}

/* ---------- ecran d'attente ---------- */
function drawWaiting(c, t, info) {
  c.fillStyle = "#05070a"; c.fillRect(0, 0, W, H);
  const a = (Math.sin(t * 2) + 1) / 2;
  text(c, "RSIM DASH", W / 2, 150, 64, "#ffffff", FONTS.cond, "center", "800");
  text(c, "En attente du jeu…", W / 2, 230, 30, `rgba(63,208,255,${0.4 + 0.6 * a})`, FONTS.sans, "center", "600");
  text(c, info || "AC · ACC · AC Rally · LMU · AMS2 · RaceRoom", W / 2, 290, 20, "#8899aa", FONTS.sans, "center", "400");
}

/* ---------- famille "bandes" (ecran plein shift-light, type Rally2 Hyundai) ----------
   Bandes verticales symetriques qui s'allument des bords vers le centre, rapport dans un carre,
   regime en chiffres dessous. theme.bands = couleurs des bords vers le centre. */
function drawBands(c, d, th, t) {
  const bands = th.bands || ["#dff3cf", "#dff3cf", "#fbf7c6", "#fbf7c6", "#f6b3ad"];
  const n = bands.length, f = rpmFrac(d);
  const start = th.start || 0.6, shift = d.shiftRpm && d.maxRpm ? clamp(d.shiftRpm / d.maxRpm, 0.85, 0.99) : (th.shift || 0.96);
  const flash = d.limiter ? Math.floor(t * 4) % 2 === 0 : f >= shift + 0.015 ? Math.floor(t * 10) % 2 === 0 : false;
  const blink = d.limiter || f >= shift + 0.015;
  const lit = blink ? (flash ? n : 0) : Math.round(clamp((f - start) / (shift - start), 0, 1) * n);
  c.fillStyle = th.bg || "#050505"; c.fillRect(0, 0, W, H);
  // largeur : bandes laterales egales, la derniere (centre) occupe le reste
  const side = (th.sideW || 0.12) * W, centerW = W - 2 * side * (n - 1);
  for (let i = 0; i < n; i++) {
    const on = i < lit;
    let col = on ? bands[i] : (th.off || "#0d0d0d");
    if (on && d.limiter) col = th.limiterCol || "#7fb4ff";
    c.fillStyle = col;
    if (i < n - 1) {
      c.fillRect(i * side, 0, side + 1, H);
      c.fillRect(W - (i + 1) * side - 1, 0, side + 1, H);
    } else c.fillRect((n - 1) * side, 0, centerW, H);
  }
  // separations fines entre bandes (pas de voile blanc : couleurs pleines)
  c.fillStyle = "rgba(0,0,0,0.55)";
  for (let i = 1; i < n; i++) { c.fillRect(i * side - 1, 0, 3, H); c.fillRect(W - i * side - 2, 0, 3, H); }
  // carre du rapport
  const bs = th.boxSize || 200, bx = W / 2 - bs / 2, by = (th.boxY || 70);
  c.fillStyle = th.box || "#b3261a"; c.fillRect(bx, by, bs, bs);
  c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 4; c.strokeRect(bx, by, bs, bs);
  c.save(); c.shadowColor = th.gear; c.shadowBlur = 14;
  text(c, gearTxt(d.gear), W / 2, by + bs / 2 + 8, bs * 0.86, th.gear || "#7ce000", FONTS.cond, "center", "800");
  c.restore();
  // regime en chiffres
  c.save(); c.shadowColor = "rgba(0,0,0,0.8)"; c.shadowBlur = 6;
  text(c, String(Math.round(d.rpm)), W / 2, by + bs + 62, th.rpmSize || 64, th.text || "#ffffff", FONTS.cond, "center", "800");
  c.restore();
}

/* ---------- famille "grille" (ecran GT3 a cases, type BMW M4 GT3) ----------
   Coordonnees prises sur l'ecran reel (760 x 445), mises a l'echelle ; barres de shift a droite. */
const fuelTrack = { start: null };
function drawGrid(c, d, th, t) {
  const SX = 940 / 760, SY = 450 / 445, X = x => (x - 20) * SX, Y = y => (y - 35) * SY;
  const f = FONTS.mono, br = th.border || "#9a9a9a", tx = th.text || "#e8e8e8";
  c.fillStyle = th.bg || "#2a2a2a"; c.fillRect(0, 0, W, H);
  const cell = (x1, y1, x2, y2, fill) => {
    const x = X(x1), y = Y(y1), w = X(x2) - x, h = Y(y2) - y;
    if (fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
    c.strokeStyle = br; c.lineWidth = 2; c.strokeRect(x, y, w, h);
    return [x, y, w, h];
  };
  const lbl = (s, x, y, size = 19, col = tx) => text(c, s, X(x), Y(y), size, col, f, "center", "500");
  // pressions pneus
  cell(25, 40, 252, 228);
  lbl("TYRE PRESSURE", 138, 57);
  [[28, 73, 136, 148], [139, 73, 250, 148], [28, 150, 136, 225], [139, 150, 250, 225]].forEach((r, i) => {
    const tt = d.tyreT[i], col = tt === null || tt === undefined ? th.tyre : tt < 65 ? th.tyre : tt < 100 ? "#2fbf3a" : "#e02a1a";
    const [x, y, w, h] = cell(...r, col);
    const p = d.tyreP[i];
    text(c, p ? p.toFixed(p > 5 ? 1 : 2) : "-.--", x + w / 2, y + h / 2 + 2, 42, "#1d1d1d", f, "center", "500");
  });
  // rapport + vitesse
  lbl("GEAR", 395, 63, 20);
  c.save(); c.lineWidth = 3; c.strokeStyle = "#0a5a0a";
  text(c, gearTxt(d.gear), X(395), Y(138), 120, th.gear || "#22e022", f, "center", "700"); c.restore();
  text(c, num(d.speed, 0), X(392), Y(252), 92, "#d8d8d8", f, "center", "500");
  // tuiles ALS / MAP / TC / ABS
  const tile = (x1, x2, title, val, col, active) => {
    const [x, y, w] = cell(x1, 45, x2, 128, col);
    if (active) { c.fillStyle = "rgba(255,255,255,0.35)"; c.fillRect(x, y, w, Y(128) - y); }
    text(c, title, x + w / 2, Y(62), 20, "#fff", f, "center", "500");
    text(c, val, x + w / 2, Y(103), 50, "#fff", f, "center", "500");
  };
  const [ax, ay, aw] = cell(458, 45, 535, 75, "#4fd6df");
  text(c, "ALS", ax + aw / 2, ay + 18, 19, "#1d1d1d", f, "center", "500");
  cell(458, 75, 535, 128, "#e2e2e2");
  text(c, d.turbo ? d.turbo.toFixed(1) : "OFF", X(496), Y(103), 34, "#333", f, "center", "500");
  tile(538, 615, "MAP", num(d.map), "#e01a1a");
  tile(618, 697, "TC", num(d.tc), "#1a2ee0", d.tcActive && Math.floor(t * 8) % 2);
  tile(700, 778, "ABS", num(d.abs), "#38b038", d.absActive && Math.floor(t * 8) % 2);
  // PSL (limiteur stand)
  if (d.limiter) { cell(455, 140, 528, 183, "#e010e0"); text(c, "PSL", X(491), Y(163), 32, "#fff", f, "center", "500"); }
  // temps
  const boxT = (x1, y1, x2, y2, title, val, col) => {
    const [x, y, w, h] = cell(x1, y1, x2, y2);
    text(c, title, x + w / 2, y + 18, 19, tx, f, "center", "500");
    text(c, val, x + w / 2, y + h * 0.66, Math.min(44, h * 0.5), col || tx, f, "center", "500");
  };
  const t2 = s => { if (s === null || s === undefined || s <= 0) return "00:00:00";
    const m = Math.floor(s / 60), r = s - m * 60, cs = Math.min(99, Math.round((r % 1) * 100));
    return String(m).padStart(2, "0") + ":" + String(Math.floor(r)).padStart(2, "0") + ":" + String(cs).padStart(2, "0"); };
  const dl = d.delta;
  boxT(563, 143, 775, 220, "GAIN/LOSS", dl === null || dl === undefined ? "00:00" : (dl > 0 ? "+" : "-") + Math.abs(dl).toFixed(2).padStart(5, "0").replace(".", ":"),
    dl === null || dl === undefined ? null : dl > 0 ? "#ff5a4a" : "#4cff6a");
  boxT(560, 227, 770, 303, "LAST LAP", t2(d.last));
  boxT(557, 308, 765, 374, "BEST LAP", t2(d.best));
  // carburant
  if (fuelTrack.start === null || d.fuel > fuelTrack.start + 0.5) fuelTrack.start = d.fuel;
  boxT(25, 232, 187, 302, "LAP FUEL", d.fuelPerLap ? d.fuelPerLap.toFixed(2) : "-.---");
  boxT(25, 305, 187, 376, "FUEL USED", (fuelTrack.start - d.fuel).toFixed(1));
  // ligne du bas
  const avgT = d.tyreT.filter(v => v !== null && v !== undefined);
  boxT(25, 380, 187, 460, "TYRE", avgT.length ? Math.round(avgT.reduce((a, b) => a + b, 0) / avgT.length) + "°" : "DRY");
  const [ex, ey, ew, eh] = cell(192, 380, 400, 460);
  text(c, "EAU   : " + num(d.water, 0) + "°", ex + 14, ey + eh * 0.32, 24, tx, f, "left", "500");
  text(c, "HUILE : " + num(d.oil, 0) + "°", ex + 14, ey + eh * 0.72, 24, tx, f, "left", "500");
  boxT(404, 380, 518, 460, "BRKB", num(d.bb, 1));
  boxT(521, 380, 600, 460, "POS", String(d.pos || "-"));
  boxT(603, 380, 678, 460, "LAP", String(d.lap || 0));
  boxT(681, 380, 760, 460, "MIN", d.sessionLeft ? String(Math.floor(d.sessionLeft / 60)).padStart(2, "0") : "00");
  // barres de shift verticales (bord droit)
  const cols = ledColors(d, 5, "lr", t);
  for (let i = 0; i < 5; i++) {
    const y = 40 + i * 52, col = cols[i];
    c.fillStyle = col ? (th.shiftCol || "#ffffff") : "#3a3a3a";
    if (col && cols.every(Boolean)) c.fillStyle = col;
    if (col) { c.shadowColor = c.fillStyle; c.shadowBlur = 16; }
    rr(c, 962, y, 30, 12, 3); c.fill(); c.shadowBlur = 0;
  }
}

const FAMILIES = { gt3: drawGT3, rally: drawRally, lcd: drawLCD, analog: drawAnalog, bands: drawBands, grid: drawGrid };
window.RSIM = { W, H, FAMILIES, drawWaiting };
