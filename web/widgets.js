/* RSIM Dash - widgets supplementaires (style "button box" / SimDashboard) + catalogue.
   Charge APRES custom.js. Ajoute : panel (fonds/cadres), lamp (voyants), gear7, arcbar, image,
   switch (interrupteurs / killswitch) et des styles pour button (demarrage moteur, rond, image). */
"use strict";
(function () {
  const { R, H_, val, fmt, DEFAULTS } = RSIMC;
  const { rrect, frame, txt, rule, test, ledColors, isNil } = H_;

  /* ---------------- images (fichiers importes dans le dash, en base64) ---------------- */
  const IMG = {};
  function img(src) {
    if (!src) return null;
    if (!IMG[src]) { const i = new Image(); i.src = src; IMG[src] = i; }
    return IMG[src].complete && IMG[src].naturalWidth ? IMG[src] : null;
  }
  function drawImg(c, src, x, y, w, h, fit) {
    const i = img(src); if (!i) return false;
    if (fit === "stretch") { c.drawImage(i, x, y, w, h); return true; }
    const s = fit === "cover" ? Math.max(w / i.naturalWidth, h / i.naturalHeight) : Math.min(w / i.naturalWidth, h / i.naturalHeight);
    const iw = i.naturalWidth * s, ih = i.naturalHeight * s;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.drawImage(i, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); c.restore();
    return true;
  }

  /* ---------------- motifs (carbone, grille d'ecran) ---------------- */
  const PAT = {};
  function pattern(c, kind, col) {
    const key = kind + col;
    if (PAT[key]) return PAT[key];
    const o = document.createElement("canvas"), g = o.getContext("2d");
    const base = col || "#141414";
    if (kind === "carbon" || kind === "carbon2") {
      const s = kind === "carbon" ? 8 : 5; o.width = o.height = s * 4;
      g.fillStyle = "#050505"; g.fillRect(0, 0, o.width, o.height);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const hor = (i + j) % 2 === 0, x = i * s, y = j * s;
        const gr = hor ? g.createLinearGradient(x, y, x, y + s) : g.createLinearGradient(x, y, x + s, y);
        gr.addColorStop(0, "#1b1b1b"); gr.addColorStop(0.5, hor ? "#2c2c2c" : "#232323"); gr.addColorStop(1, "#0e0e0e");
        g.fillStyle = gr; g.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
      }
    } else if (kind === "carbonDiag") {
      o.width = o.height = 16; g.fillStyle = "#0a0a0a"; g.fillRect(0, 0, 16, 16);
      g.strokeStyle = "#262626"; g.lineWidth = 3;
      for (let k = -16; k < 32; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 16, 16); g.stroke(); }
      g.strokeStyle = "#151515"; g.lineWidth = 1;
      for (let k = -16; k < 32; k += 8) { g.beginPath(); g.moveTo(k + 16, 0); g.lineTo(k, 16); g.stroke(); }
    } else if (kind === "grid") {
      o.width = o.height = 6; g.fillStyle = base; g.fillRect(0, 0, 6, 6);
      g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(0, 0, 6, 1); g.fillRect(0, 0, 1, 6);
    } else if (kind === "brushed") {
      o.width = 400; o.height = 60; g.fillStyle = "#7d8084"; g.fillRect(0, 0, 400, 60);
      for (let i = 0; i < 900; i++) { const v = Math.random() > .5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${0.03 + Math.random() * 0.05})`;
        g.fillRect(0, Math.random() * 60, 400, 1); }
    }
    return (PAT[key] = c.createPattern(o, "repeat"));
  }

  /* ---------------- panel : fonds et cadres ---------------- */
  R.panel = (c, w, d, t) => {
    const st = w.style || "carbon";
    c.save(); rrect(c, w.x, w.y, w.w, w.h, w.radius || 0); c.clip();
    if (["carbon", "carbon2", "carbonDiag", "grid", "brushed"].includes(st)) { c.fillStyle = pattern(c, st, w.color); c.fillRect(w.x, w.y, w.w, w.h);
      if (st === "brushed") { const g = c.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h); g.addColorStop(0, "rgba(255,255,255,0.18)"); g.addColorStop(0.45, "rgba(0,0,0,0.12)"); g.addColorStop(0.6, "rgba(255,255,255,0.10)"); g.addColorStop(1, "rgba(0,0,0,0.25)"); c.fillStyle = g; c.fillRect(w.x, w.y, w.w, w.h); } }
    else if (st === "gradient") { const g = c.createLinearGradient(w.x, w.y, w.x, w.y + w.h); g.addColorStop(0, w.color || "#1d2430"); g.addColorStop(1, w.color2 || "#05070a"); c.fillStyle = g; c.fillRect(w.x, w.y, w.w, w.h); }
    else if (st === "image") { c.fillStyle = w.color || "#000"; c.fillRect(w.x, w.y, w.w, w.h); drawImg(c, w.src, w.x, w.y, w.w, w.h, w.fit || "cover"); }
    else if (st === "display") { // cadre d'ecran course (lunette + vis)
      c.fillStyle = pattern(c, "carbon2"); c.fillRect(w.x, w.y, w.w, w.h);
      const m = Math.min(w.w, w.h) * 0.07;
      rrect(c, w.x + m, w.y + m * 0.8, w.w - 2 * m, w.h - 1.6 * m, m * 0.6); c.fillStyle = "#000"; c.fill();
      c.lineWidth = 3; c.strokeStyle = "#3a3a3a"; c.stroke();
      c.fillStyle = pattern(c, "grid", w.color || "#07090b"); rrect(c, w.x + m + 4, w.y + m * 0.8 + 4, w.w - 2 * m - 8, w.h - 1.6 * m - 8, m * 0.5); c.fill();
      for (const sx of [w.x + m * 0.5, w.x + w.w - m * 0.5]) for (let k = 1; k <= 3; k++) {
        c.beginPath(); c.arc(sx, w.y + w.h * k / 4, m * 0.14, 0, Math.PI * 2); c.fillStyle = "#777"; c.fill(); }
    } else if (st === "lcd") { // compteur demi-lune retroeclaire
      c.fillStyle = "#0b0b0b"; c.fillRect(w.x, w.y, w.w, w.h);
      const m = Math.min(w.w, w.h) * 0.06;
      c.beginPath(); c.moveTo(w.x + m, w.y + w.h - m); c.lineTo(w.x + m, w.y + w.h * 0.45);
      c.quadraticCurveTo(w.x + m, w.y + m, w.x + w.w / 2, w.y + m); c.quadraticCurveTo(w.x + w.w - m, w.y + m, w.x + w.w - m, w.y + w.h * 0.45);
      c.lineTo(w.x + w.w - m, w.y + w.h - m); c.closePath();
      const g = c.createRadialGradient(w.x + w.w / 2, w.y + w.h * 0.6, 10, w.x + w.w / 2, w.y + w.h * 0.6, w.w * 0.6);
      g.addColorStop(0, w.color || "#9fd8e6"); g.addColorStop(1, w.color2 || "#3e7c8c");
      c.fillStyle = g; c.fill(); c.lineWidth = m * 0.5; c.strokeStyle = "#222"; c.stroke();
    } else { c.fillStyle = w.color || "#111"; c.fillRect(w.x, w.y, w.w, w.h); }
    c.restore();
    if (w.screws) { const m = w.screws === true ? 22 : w.screws; for (const [sx, sy] of [[w.x + m, w.y + m], [w.x + w.w - m, w.y + m], [w.x + m, w.y + w.h - m], [w.x + w.w - m, w.y + w.h - m]]) screw(c, sx, sy, 9); }
    if (w.border && w.borderW) { rrect(c, w.x, w.y, w.w, w.h, w.radius || 0); c.lineWidth = w.borderW; c.strokeStyle = w.border; c.stroke(); }
  };

  /* ---------------- voyants ---------------- */
  function lampOn(w, d) {
    if (!w.field) return false;
    return test(val(d, w.field), w.op || "==", w.v === undefined || w.v === "" ? 1 : +w.v);
  }
  const ICONS = {
    abs(c, x, y, s, col) { c.strokeStyle = col; c.lineWidth = s * 0.07;
      c.beginPath(); c.arc(x, y, s * 0.3, 0, Math.PI * 2); c.stroke();
      for (const sg of [-1, 1]) { c.beginPath(); c.arc(x, y, s * 0.42, sg > 0 ? -0.6 : Math.PI - 0.6, sg > 0 ? 0.6 : Math.PI + 0.6); c.stroke(); }
      txt(c, "ABS", x, y + 1, "Roboto", s * 0.2, col, "center", true); },
    tc(c, x, y, s, col) { c.fillStyle = col; c.strokeStyle = col; c.lineWidth = s * 0.06;
      rrect(c, x - s * 0.25, y - s * 0.32, s * 0.5, s * 0.22, s * 0.06); c.fill();
      c.fillRect(x - s * 0.3, y - s * 0.12, s * 0.6, s * 0.06);
      for (const o of [-0.15, 0.15]) { c.beginPath(); c.moveTo(x + o * s - s * 0.1, y + s * 0.05);
        c.bezierCurveTo(x + o * s + s * 0.1, y + s * 0.15, x + o * s - s * 0.15, y + s * 0.25, x + o * s + s * 0.05, y + s * 0.38); c.stroke(); } },
    fuel(c, x, y, s, col) { c.fillStyle = col; c.strokeStyle = col; c.lineWidth = s * 0.06;
      rrect(c, x - s * 0.25, y - s * 0.32, s * 0.32, s * 0.62, s * 0.04); c.fill();
      c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(x - s * 0.2, y - s * 0.26, s * 0.22, s * 0.14);
      c.beginPath(); c.moveTo(x + s * 0.07, y - s * 0.1); c.lineTo(x + s * 0.2, y - s * 0.1); c.lineTo(x + s * 0.2, y + s * 0.18);
      c.quadraticCurveTo(x + s * 0.27, y + s * 0.25, x + s * 0.3, y + s * 0.15); c.lineTo(x + s * 0.3, y - s * 0.15); c.lineTo(x + s * 0.2, y - s * 0.28); c.stroke(); },
    lights(c, x, y, s, col) { c.fillStyle = col; c.strokeStyle = col; c.lineWidth = s * 0.06;
      c.beginPath(); c.arc(x - s * 0.05, y, s * 0.22, Math.PI / 2, -Math.PI / 2); c.closePath(); c.fill();
      for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(x + s * 0.08, y + k * s * 0.14); c.lineTo(x + s * 0.36, y + k * s * 0.14); c.stroke(); } },
    engine(c, x, y, s, col) { c.strokeStyle = col; c.lineWidth = s * 0.07; c.lineJoin = "round";
      c.beginPath(); c.moveTo(x - s * 0.32, y - s * 0.05); c.lineTo(x - s * 0.22, y - s * 0.05); c.lineTo(x - s * 0.22, y - s * 0.18);
      c.lineTo(x + s * 0.12, y - s * 0.18); c.lineTo(x + s * 0.2, y - s * 0.08); c.lineTo(x + s * 0.32, y - s * 0.08); c.lineTo(x + s * 0.32, y + s * 0.18);
      c.lineTo(x - s * 0.12, y + s * 0.18); c.lineTo(x - s * 0.22, y + s * 0.08); c.lineTo(x - s * 0.32, y + s * 0.08); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.08, y - s * 0.18); c.lineTo(x - s * 0.08, y - s * 0.28); c.moveTo(x - s * 0.16, y - s * 0.28); c.lineTo(x, y - s * 0.28); c.stroke(); },
    water(c, x, y, s, col) { c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.06;
      c.beginPath(); c.moveTo(x, y - s * 0.32); c.lineTo(x, y + s * 0.08); c.stroke(); c.beginPath(); c.arc(x, y + s * 0.12, s * 0.07, 0, Math.PI * 2); c.fill();
      for (const k of [0.24, 0.36]) { c.beginPath(); for (let i = -4; i <= 4; i++) { const px = x + i * s * 0.08, py = y + k * s + (i % 2 ? s * 0.03 : -s * 0.03); i === -4 ? c.moveTo(px, py) : c.lineTo(px, py); } c.stroke(); } },
    pit(c, x, y, s, col) { c.strokeStyle = col; c.lineWidth = s * 0.06; rrect(c, x - s * 0.36, y - s * 0.22, s * 0.72, s * 0.44, s * 0.08); c.stroke();
      txt(c, "PIT", x, y + 1, "Roboto", s * 0.24, col, "center", true); },
    flag(c, x, y, s, col) { c.fillStyle = col; c.fillRect(x - s * 0.25, y - s * 0.3, s * 0.06, s * 0.62);
      c.beginPath(); c.moveTo(x - s * 0.19, y - s * 0.3); c.quadraticCurveTo(x, y - s * 0.38, x + s * 0.3, y - s * 0.28); c.lineTo(x + s * 0.3, y + s * 0.02);
      c.quadraticCurveTo(x, y - s * 0.06, x - s * 0.19, y + s * 0.02); c.closePath(); c.fill(); },
  };
  R.lamp = (c, w, d, t) => {
    const on = lampOn(w, d) && !(w.blink && Math.floor(t * 4) % 2);
    frame(c, w, w.bg);
    const col = on ? (w.onColor || "#ffd400") : (w.offColor || "#2a2a2a");
    const s = Math.min(w.w, w.h), cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    if (on && w.glow !== 0) { c.shadowColor = col; c.shadowBlur = w.glow || 14; }
    if (w.icon === "text") txt(c, w.text || "ON", cx, cy, w.font, w.size || s * 0.4, col, "center", true);
    else if (w.icon === "dot") { c.beginPath(); c.arc(cx, cy, s * 0.4, 0, Math.PI * 2); c.fillStyle = col; c.fill(); }
    else (ICONS[w.icon] || ICONS.abs)(c, cx, cy, s, col);
    c.shadowBlur = 0;
  };

  /* ---------------- rapport 7 segments ---------------- */
  const SEG = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc",
    "8": "abcdefg", "9": "abcdfg", "-": "g", "R": "efa", "N": "ceg" };
  function seg7(c, ch, x, y, w, h, on, off, glow) {
    const t = w * 0.2, s = SEG[ch] || "";
    const P = { a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, y + h / 2 - t / 2, w - 2 * t, t],
      f: [x, y + t, t, h / 2 - t * 1.5], b: [x + w - t, y + t, t, h / 2 - t * 1.5], e: [x, y + h / 2 + t / 2, t, h / 2 - t * 1.5], c: [x + w - t, y + h / 2 + t / 2, t, h / 2 - t * 1.5] };
    for (const k of "abcdefg") {
      const [px, py, pw, ph] = P[k], lit = s.includes(k);
      c.fillStyle = lit ? on : off; if (lit && glow) { c.shadowColor = on; c.shadowBlur = glow; }
      c.beginPath();
      if (pw > ph) { c.moveTo(px, py + ph / 2); c.lineTo(px + ph / 2, py); c.lineTo(px + pw - ph / 2, py); c.lineTo(px + pw, py + ph / 2); c.lineTo(px + pw - ph / 2, py + ph); c.lineTo(px + ph / 2, py + ph); }
      else { c.moveTo(px + pw / 2, py); c.lineTo(px + pw, py + pw / 2); c.lineTo(px + pw, py + ph - pw / 2); c.lineTo(px + pw / 2, py + ph); c.lineTo(px, py + ph - pw / 2); c.lineTo(px, py + pw / 2); }
      c.closePath(); c.fill(); c.shadowBlur = 0;
    }
  }
  R.gear7 = (c, w, d, t) => {
    const r = rule(w, d, val(d, "rpmPct"), t);
    frame(c, w, (r && r.bg) || w.bg);
    const p = Math.min(w.w, w.h) * 0.1, gw = Math.min(w.w - 2 * p, (w.h - 2 * p) * 0.55);
    seg7(c, fmt(d.gear, { format: "gear" }), w.x + (w.w - gw) / 2, w.y + p, gw, w.h - 2 * p,
      (r && !r.blinkOff && r.color) || w.color || "#ff2a1a", w.offColor || "rgba(255,255,255,0.06)", w.glow ?? 12);
  };

  /* ---------------- barre de regime en arc ---------------- */
  R.arcbar = (c, w, d, t) => {
    frame(c, w, w.bg);
    const v = val(d, w.field || "rpm"), max = w.maxField ? (val(d, w.maxField) || 1) : (+w.max || 1), min = +w.min || 0;
    const f = isNil(v) ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)));
    const n = +w.segments || 40, cx = w.x + w.w / 2, cy = w.y + w.h * 0.92, r = Math.min(w.w / 2, w.h * 0.9) - 6, th = +w.thickness || r * 0.18;
    const a0 = Math.PI * (w.from ?? 1), a1 = Math.PI * (w.to ?? 2);
    for (let i = 0; i < n; i++) {
      const p = i / n, a = a0 + (a1 - a0) * p, a2 = a0 + (a1 - a0) * (i + 0.75) / n, on = (i + 0.5) / n <= f;
      c.beginPath(); c.arc(cx, cy, r, a, a2); c.arc(cx, cy, r - th, a2, a, true); c.closePath();
      c.fillStyle = on ? (p >= (w.zone2 ?? 0.9) ? (w.zoneColor2 || "#ff1a0d") : p >= (w.zone1 ?? 0.7) ? (w.zoneColor1 || "#ffd000") : (w.color || "#3f8bff")) : (w.offColor || "#2a2a2a");
      c.fill();
    }
  };

  /* ---------------- image ---------------- */
  R.image = (c, w, d, t) => {
    const r = rule(w, d, null, t); if (r && r.blinkOff) return;
    if (!drawImg(c, w.src, w.x, w.y, w.w, w.h, w.fit || "contain")) {
      c.strokeStyle = "#555"; c.setLineDash([6, 4]); c.strokeRect(w.x, w.y, w.w, w.h); c.setLineDash([]);
      txt(c, "IMAGE", w.x + w.w / 2, w.y + w.h / 2, "Roboto", 16, "#777", "center", true);
    }
  };


  /* ---------------- materiel realiste (dessin procedural) ---------------- */
  function hex2rgb(h) { h = (h || "#888").replace("#", ""); if (h.length === 3) h = h.split("").map(x => x + x).join("");
    const n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(h, f) { if (!/^#/.test(h || "")) return h; const [r, g, b] = hex2rgb(h);
    const m = v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)); return `rgb(${m(r)},${m(g)},${m(b)})`; }
  function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }
  function screw(c, x, y, r) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, "#e8e8e8"); g.addColorStop(0.6, "#8a8a8a"); g.addColorStop(1, "#3a3a3a");
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.strokeStyle = "#2a2a2a"; c.lineWidth = r * 0.25; c.beginPath(); c.moveTo(x - r * 0.55, y - r * 0.2); c.lineTo(x + r * 0.55, y + r * 0.2); c.stroke();
  }
  function plate(c, label, cx, y, w, font, size) { // plaque alu gravee
    const h = size * 1.5, x = cx - w / 2;
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#d4d6d9"); g.addColorStop(0.5, "#a9acb0"); g.addColorStop(1, "#8c8f93");
    c.save(); c.shadowColor = "rgba(0,0,0,0.6)"; c.shadowBlur = 4; c.shadowOffsetY = 2; rrect(c, x, y, w, h, 4); c.fillStyle = g; c.fill(); c.restore();
    c.fillStyle = pattern(c, "brushed"); c.globalAlpha = 0.35; rrect(c, x, y, w, h, 4); c.fill(); c.globalAlpha = 1;
    txt(c, label, cx, y + h / 2 + 1, font || "Rajdhani", size, "rgba(255,255,255,0.5)", "center", true);
    txt(c, label, cx, y + h / 2, font || "Rajdhani", size, "#1a1c1f", "center", true);
  }
  function hexNut(c, cx, cy, r) {
    c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath();
    const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, "#f4f4f4"); g.addColorStop(0.45, "#9a9a9a"); g.addColorStop(0.55, "#c8c8c8"); g.addColorStop(1, "#4a4a4a");
    c.save(); c.shadowColor = "rgba(0,0,0,0.7)"; c.shadowBlur = 8; c.shadowOffsetY = 4; c.fillStyle = g; c.fill(); c.restore();
    c.lineWidth = 1.5; c.strokeStyle = "#3a3a3a"; c.stroke();
    const g2 = c.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 0.6); g2.addColorStop(0, "#d0d0d0"); g2.addColorStop(1, "#5a5a5a");
    c.beginPath(); c.arc(cx, cy, r * 0.6, 0, Math.PI * 2); c.fillStyle = g2; c.fill();
  }
  function ledLit(w, d, pressed) { return pressed || (w.ledField ? lampOn({ field: w.ledField, op: w.ledOp, v: w.ledV }, d) : false); }

  // bouton poussoir rond industriel (bague moletee + capuchon bombe)
  function drawPush(c, w, d, pressed) {
    const cx = w.x + w.w / 2, bh = w.plate ? w.h - (w.size || 24) * 1.9 : w.h, cy = w.y + bh / 2, r = Math.min(w.w, bh) / 2 - 3;
    const col = w.cap || w.border || "#d01818", lit = ledLit(w, d, pressed) && w.led !== false;
    c.save(); c.shadowColor = "rgba(0,0,0,0.75)"; c.shadowBlur = r * 0.25; c.shadowOffsetY = r * 0.1;
    const gb = c.createLinearGradient(cx, cy - r, cx, cy + r); gb.addColorStop(0, "#5a5d61"); gb.addColorStop(0.5, "#1c1d1f"); gb.addColorStop(1, "#3a3c40");
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = gb; c.fill(); c.restore();
    c.strokeStyle = "rgba(255,255,255,0.10)"; c.lineWidth = 1.2;            // moletage
    for (let i = 0; i < 72; i++) { const a = i * Math.PI / 36; c.beginPath(); c.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); c.lineTo(cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * r * 0.98); c.stroke(); }
    const gc = c.createLinearGradient(cx, cy - r * 0.86, cx, cy + r * 0.86); gc.addColorStop(0, "#e6e8ea"); gc.addColorStop(0.5, "#6e7176"); gc.addColorStop(1, "#c9ccd0");
    c.beginPath(); c.arc(cx, cy, r * 0.84, 0, Math.PI * 2); c.fillStyle = gc; c.fill();      // bague chromee
    c.beginPath(); c.arc(cx, cy, r * 0.74, 0, Math.PI * 2); c.fillStyle = "#050505"; c.fill(); // puits
    if (lit) { c.save(); c.shadowColor = col; c.shadowBlur = r * 0.6; c.beginPath(); c.arc(cx, cy, r * 0.72, 0, Math.PI * 2); c.strokeStyle = shade(col, 0.4); c.lineWidth = r * 0.05; c.stroke(); c.restore(); }
    const k = pressed ? 0.66 : 0.70, oy = pressed ? r * 0.03 : -r * 0.02, cr = r * k;
    const g = c.createRadialGradient(cx - cr * 0.35, cy + oy - cr * 0.45, cr * 0.05, cx, cy + oy, cr);
    g.addColorStop(0, shade(col, lit ? 0.75 : 0.45)); g.addColorStop(0.55, lit ? shade(col, 0.15) : col); g.addColorStop(1, shade(col, -0.55));
    c.beginPath(); c.arc(cx, cy + oy, cr, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = shade(col, -0.7); c.stroke();
    const gs = c.createLinearGradient(0, cy + oy - cr, 0, cy + oy); gs.addColorStop(0, `rgba(255,255,255,${pressed ? 0.25 : 0.55})`); gs.addColorStop(1, "rgba(255,255,255,0)");
    c.beginPath(); c.ellipse(cx, cy + oy - cr * 0.45, cr * 0.68, cr * 0.42, 0, 0, Math.PI * 2); c.fillStyle = gs; c.fill();   // reflet
    const lab = w.plate ? (w.icon || "") : (w.text || "");
    if (lab) { const sz = w.capSize || Math.min(cr * 0.5, (cr * 1.6) / Math.max(1, lab.length * 0.55));
      txt(c, lab, cx, cy + oy + 1.5, w.font || "Rajdhani", sz, "rgba(0,0,0,0.45)", "center", true);
      txt(c, lab, cx, cy + oy, w.font || "Rajdhani", sz, w.color || "#fff", "center", true); }
    if (w.plate && w.text) plate(c, w.text, cx, w.y + bh + 6, Math.min(w.w, Math.max(r * 2, w.text.length * (w.size || 24) * 0.62 + 20)), w.font, w.size || 24);
  }
  // touche carree type keycap de button box (bande LED en haut)
  function drawCap(c, w, d, pressed) {
    const col = w.cap || w.border || "#a1161a", lit = ledLit(w, d, pressed), dy = pressed ? 4 : 0, rad = Math.min(w.w, w.h) * 0.12;
    c.save(); c.shadowColor = "rgba(0,0,0,0.8)"; c.shadowBlur = 14; c.shadowOffsetY = 6;
    rrect(c, w.x, w.y, w.w, w.h, rad); c.fillStyle = "#08090a"; c.fill(); c.restore();          // logement
    rrect(c, w.x, w.y, w.w, w.h, rad); c.lineWidth = 2; c.strokeStyle = "#2e3034"; c.stroke();
    const m = Math.min(w.w, w.h) * 0.07, x = w.x + m, y = w.y + m + dy, ww = w.w - 2 * m, hh = w.h - 2 * m - 4;
    const gs = c.createLinearGradient(0, y, 0, y + hh); gs.addColorStop(0, "#4a4d52"); gs.addColorStop(1, "#141517");
    rrect(c, x, y, ww, hh, rad * 0.8); c.fillStyle = gs; c.fill();                                  // flancs
    const t = Math.min(ww, hh) * 0.08, fx = x + t, fy = y + t * 0.6, fw = ww - 2 * t, fh = hh - t * 1.8;
    const gf = c.createLinearGradient(0, fy, 0, fy + fh); gf.addColorStop(0, w.tint === false ? (pressed ? "#26282b" : "#34373b") : shade(col, pressed ? -0.72 : -0.62)); gf.addColorStop(1, w.tint === false ? "#1d1f22" : shade(col, -0.85));
    rrect(c, fx, fy, fw, fh, rad * 0.6); c.fillStyle = gf; c.fill();                                // face
    const gl = c.createLinearGradient(0, fy, 0, fy + fh * 0.5); gl.addColorStop(0, "rgba(255,255,255,0.10)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    rrect(c, fx, fy, fw, fh * 0.5, rad * 0.6); c.fillStyle = gl; c.fill();
    const lh = Math.max(5, fh * 0.07);                                                             // bande LED
    c.save(); if (lit) { c.shadowColor = col; c.shadowBlur = 16; }
    rrect(c, fx + fw * 0.12, fy + fh * 0.1, fw * 0.76, lh, lh / 2); c.fillStyle = lit ? shade(col, 0.35) : shade(col, -0.6); c.fill(); c.restore();
    const lab = w.text || "", sz = Math.min(w.size || 999, fh * 0.44, fw * 0.92 / Math.max(1, lab.length * 0.52));
    txt(c, lab, fx + fw / 2, fy + fh * 0.58, w.font || "Rajdhani", sz, lit ? "#fff" : (w.color || "#e8e8e8"), "center", true);
  }

  /* ---------------- boutons stylises ---------------- */
  const baseButton = R.button;
  function chromeRing(c, cx, cy, r) {
    const g = c.createLinearGradient(cx, cy - r, cx, cy + r); g.addColorStop(0, "#f2f2f2"); g.addColorStop(0.5, "#7a7a7a"); g.addColorStop(1, "#d9d9d9");
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = g; c.fill();
  }
  R.button = (c, w, d, t) => {
    const pressed = (w._down) || (w._pressed && t - w._pressed < 0.2);
    const st = w.style || "plain", cx = w.x + w.w / 2, cy = w.y + w.h / 2, r = Math.min(w.w, w.h) / 2 - 2;
    if (st === "start") {
      chromeRing(c, cx, cy, r);
      const g = c.createRadialGradient(cx - r * 0.2, cy - r * 0.3, r * 0.1, cx, cy, r * 0.85);
      g.addColorStop(0, pressed ? "#b01010" : "#ff4a3a"); g.addColorStop(1, pressed ? "#5a0505" : "#a40d0d");
      c.beginPath(); c.arc(cx, cy, r * 0.84, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      const ledOn = pressed || (w.ledField && lampOn({ field: w.ledField, op: w.ledOp, v: w.ledV }, d));
      c.fillStyle = ledOn ? "#3dff5a" : "#174d20"; if (ledOn) { c.shadowColor = "#3dff5a"; c.shadowBlur = 10; }
      rrect(c, cx - r * 0.18, cy - r * 0.5, r * 0.36, r * 0.09, 3); c.fill(); c.shadowBlur = 0;
      txt(c, w.text1 || "ENGINE", cx, cy - r * 0.18, w.font || "Roboto", r * 0.2, "#fff", "center", true);
      txt(c, w.text || "START", cx, cy + r * 0.05, w.font || "Roboto", r * 0.26, "#fff", "center", true);
      c.fillStyle = "#fff"; c.fillRect(cx - r * 0.42, cy + r * 0.2, r * 0.84, 2);
      txt(c, w.text2 || "STOP", cx, cy + r * 0.36, w.font || "Roboto", r * 0.17, "#fff", "center", true);
    } else if (st === "round") {
      chromeRing(c, cx, cy, r);
      const g = c.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.05, cx, cy, r * 0.8);
      g.addColorStop(0, pressed ? "#cfcfcf" : "#ffffff"); g.addColorStop(1, pressed ? "#8a8a8a" : "#bdbdbd");
      c.beginPath(); c.arc(cx, cy, r * 0.78, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      if (w.text) txt(c, w.text, cx, cy, w.font, w.size || r * 0.35, w.color || "#222", "center", true);
    } else if (st === "pill") {
      rrect(c, w.x, w.y, w.w, w.h, Math.min(w.w, w.h) / 2.4); c.fillStyle = pressed ? (w.pressBg || "#fff") : (w.bg || "#151a22"); c.fill();
      c.lineWidth = w.borderW || 5; c.strokeStyle = w.border || "#a1161a"; c.stroke();
      txt(c, w.text || "Text", cx, cy, w.font, w.size || 24, pressed ? (w.pressColor || "#000") : (w.color || "#fff"), "center", true);
    } else if (st === "push") { drawPush(c, w, d, pressed);
    } else if (st === "cap") { drawCap(c, w, d, pressed);
    } else if (st === "image") {
      c.save(); if (pressed) { c.translate(cx, cy); c.scale(0.94, 0.94); c.translate(-cx, -cy); }
      if (!drawImg(c, w.src, w.x, w.y, w.w, w.h, "contain")) baseButton(c, w, d, t);
      c.restore();
    } else baseButton(c, w, d, t);
  };

  /* ---------------- interrupteurs (etat ON/OFF) ---------------- */
  function switchState(w, d) {
    if (w.stateField) return test(val(d, w.stateField), w.stateOp || "==", w.stateV === undefined || w.stateV === "" ? 1 : +w.stateV);
    return !!w._on;
  }
  R.switch = (c, w, d, t) => {
    const on = switchState(w, d), st = w.style || "rocker", cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    const glowC = w.color || "#ff5a14";
    const bh = w.plate ? w.h - (w.size || 16) * 2 : w.h;
    if (st === "rocker") { // interrupteur a bascule lumineux (type Carling)
      c.save(); c.shadowColor = "rgba(0,0,0,0.8)"; c.shadowBlur = 12; c.shadowOffsetY = 5;
      rrect(c, w.x, w.y, w.w, bh, 10); const gb = c.createLinearGradient(0, w.y, 0, w.y + bh); gb.addColorStop(0, "#3a3c40"); gb.addColorStop(1, "#111214");
      c.fillStyle = gb; c.fill(); c.restore();
      const m = Math.min(w.w, bh) * 0.11, x = w.x + m, y = w.y + m, ww = w.w - 2 * m, hh = bh - 2 * m;
      rrect(c, x - 2, y - 2, ww + 4, hh + 4, 6); c.fillStyle = "#020202"; c.fill();
      const g = c.createLinearGradient(0, y, 0, y + hh);   // bascule : moitie haute enfoncee si ON
      if (on) { g.addColorStop(0, "#0d0d0e"); g.addColorStop(0.48, "#2a2b2e"); g.addColorStop(0.52, "#45474b"); g.addColorStop(1, "#1a1b1d"); }
      else { g.addColorStop(0, "#1a1b1d"); g.addColorStop(0.48, "#45474b"); g.addColorStop(0.52, "#2a2b2e"); g.addColorStop(1, "#0d0d0e"); }
      rrect(c, x, y, ww, hh, 5); c.fillStyle = g; c.fill();
      const lx = x + ww * 0.2, lw = ww * 0.6, ly = y + hh * 0.12, lh = hh * 0.3;   // fenetre lumineuse
      c.save(); if (on) { c.shadowColor = glowC; c.shadowBlur = 20; }
      const gl = c.createLinearGradient(0, ly, 0, ly + lh); gl.addColorStop(0, on ? shade(glowC, 0.6) : shade(glowC, -0.55)); gl.addColorStop(1, on ? glowC : shade(glowC, -0.8));
      rrect(c, lx, ly, lw, lh, 3); c.fillStyle = gl; c.fill(); c.restore();
      c.strokeStyle = "#8a8d92"; c.lineWidth = 2.5; c.beginPath(); c.arc(cx, y + hh * 0.75, Math.min(ww, hh) * 0.08, 0, Math.PI * 2); c.stroke();
    } else if (st === "roundLed" || st === "round") {
      const r = Math.min(w.w, w.h) / 2 - 2;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = "#050505"; c.fill();
      const g = c.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r * 0.8); g.addColorStop(0, "#3a3a3a"); g.addColorStop(1, "#0e0e0e");
      c.beginPath(); c.arc(cx, cy, r * 0.82, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      if (st === "roundLed") { c.beginPath(); c.arc(cx, cy - r * 0.2, r * 0.1, 0, Math.PI * 2); c.fillStyle = on ? glowC : "#3a1a10";
        if (on) { c.shadowColor = glowC; c.shadowBlur = 14; } c.fill(); c.shadowBlur = 0; }
      else if (on) { c.beginPath(); c.arc(cx, cy, r * 0.9, 0, Math.PI * 2); c.lineWidth = 4; c.strokeStyle = glowC; c.shadowColor = glowC; c.shadowBlur = 12; c.stroke(); c.shadowBlur = 0; }
    } else if (st === "square") {
      rrect(c, w.x, w.y, w.w, w.h, 10); c.fillStyle = "#050505"; c.fill();
      const m = Math.min(w.w, w.h) * 0.1;
      const g = c.createLinearGradient(0, w.y, 0, w.y + w.h); g.addColorStop(0, "#2c2c2c"); g.addColorStop(1, "#0b0b0b");
      rrect(c, w.x + m, w.y + m, w.w - 2 * m, w.h - 2 * m, 8); c.fillStyle = g; c.fill();
      if (on) { c.lineWidth = 4; c.strokeStyle = glowC; c.shadowColor = glowC; c.shadowBlur = 12; c.stroke(); c.shadowBlur = 0; }
    } else if (st === "kill" || st === "toggle") { // levier metal (+ capot de securite pour "kill")
      const bw = Math.min(w.w, bh * 0.55), pcy = w.y + bh * 0.5;
      if (st === "kill") {   // embase du capot
        c.save(); c.shadowColor = "rgba(0,0,0,0.8)"; c.shadowBlur = 10; c.shadowOffsetY = 4;
        rrect(c, cx - bw * 0.48, w.y + bh * 0.08, bw * 0.96, bh * 0.86, 8); c.fillStyle = "#161719"; c.fill(); c.restore();
        screw(c, cx, w.y + bh * 0.88, bw * 0.06);
      }
      if (st === "toggle") { const gp = c.createRadialGradient(cx, pcy, bw * 0.2, cx, pcy, bw * 0.48); gp.addColorStop(0, "#1a1b1d"); gp.addColorStop(1, "#050506");
        c.save(); c.shadowColor = "rgba(0,0,0,0.6)"; c.shadowBlur = 6; c.shadowOffsetY = 3; c.beginPath(); c.arc(cx, pcy, bw * 0.46, 0, Math.PI * 2); c.fillStyle = gp; c.fill(); c.restore();
        txt(c, "ON", cx, w.y + bh * 0.08, "Rajdhani", bw * 0.16, on ? "#fff" : "#2a2a2a", "center", true);
        txt(c, "OFF", cx, w.y + bh * 0.95, "Rajdhani", bw * 0.16, on ? "#2a2a2a" : "#fff", "center", true); }
      hexNut(c, cx, pcy, bw * 0.3);
      const dir = on ? -1 : 1, len = bh * 0.3, tipY = pcy + dir * len;
      c.save(); c.shadowColor = "rgba(0,0,0,0.6)"; c.shadowBlur = 8; c.shadowOffsetX = 4; c.shadowOffsetY = 6;  // ombre du levier
      c.beginPath(); c.moveTo(cx - bw * 0.07, pcy); c.lineTo(cx - bw * 0.045, tipY); c.lineTo(cx + bw * 0.045, tipY); c.lineTo(cx + bw * 0.07, pcy); c.closePath();
      const gl = c.createLinearGradient(cx - bw * 0.08, 0, cx + bw * 0.08, 0); gl.addColorStop(0, "#6a6a6a"); gl.addColorStop(0.4, "#ffffff"); gl.addColorStop(1, "#5a5a5a");
      c.fillStyle = gl; c.fill(); c.restore();
      const gt = c.createRadialGradient(cx - bw * 0.03, tipY - bw * 0.03, 1, cx, tipY, bw * 0.09); gt.addColorStop(0, "#fff"); gt.addColorStop(1, on && st === "toggle" ? glowC : "#8a8a8a");
      c.beginPath(); c.arc(cx, tipY, bw * 0.085, 0, Math.PI * 2); c.fillStyle = gt; c.fill();
      if (st === "kill") {
        const capC = w.capColor || "rgba(200,20,20,0.75)", hy = w.y + bh * 0.06;
        c.fillStyle = "#b8bbbf"; rrect(c, cx - bw * 0.44, hy - 4, bw * 0.88, 10, 3); c.fill();   // charniere
        if (on) {   // capot releve (vu en raccourci)
          rrect(c, cx - bw * 0.44, hy - bh * 0.05, bw * 0.88, bh * 0.1, 6); c.fillStyle = capC; c.fill();
          c.strokeStyle = "rgba(255,255,255,0.45)"; c.lineWidth = 2; c.stroke();
        } else {
          rrect(c, cx - bw * 0.44, hy + 4, bw * 0.88, bh * 0.84, 12); c.fillStyle = capC; c.fill();
          c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 2; c.stroke();
          const gr = c.createLinearGradient(cx - bw * 0.44, 0, cx + bw * 0.44, 0); gr.addColorStop(0, "rgba(255,255,255,0.35)"); gr.addColorStop(0.25, "rgba(255,255,255,0.05)"); gr.addColorStop(0.8, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,0.2)");
          rrect(c, cx - bw * 0.44, hy + 4, bw * 0.88, bh * 0.84, 12); c.fillStyle = gr; c.fill();
        }
      }
    }
    if (w.plate && w.text) { plate(c, w.text, cx, w.y + bh + 8, Math.max(w.w, w.text.length * (w.size || 16) * 0.62 + 16), w.font, w.size || 16); return; }
    if (w.text) txt(c, w.text, cx, w.y + w.h + (w.size || 16) * 0.8, w.font, w.size || 16, w.labelColor || "#ddd", "center", true);
  };

  /* ---------------- LEDs : styles supplementaires ---------------- */
  const baseLeds = R.leds;
  R.leds = (c, w, d, t) => {
    if (w.shape !== "glass" && w.shape !== "rect") return baseLeds(c, w, d, t);
    frame(c, w, w.bg);
    const cols = ledColors(d, w, t), n = cols.length, vert = w.orient === "v", step = (vert ? w.h : w.w) / n;
    for (let i = 0; i < n; i++) {
      const col = cols[i], cx = vert ? w.x + w.w / 2 : w.x + step * i + step / 2, cy = vert ? w.y + step * i + step / 2 : w.y + w.h / 2;
      if (w.shape === "rect") {
        const sz = step * (w.size ?? 0.86); c.fillStyle = col || w.offColor || "#2a2a2a";
        if (col && w.glow !== 0) { c.shadowColor = col; c.shadowBlur = w.glow || 12; }
        if (vert) c.fillRect(w.x, cy - sz / 2, w.w, sz); else c.fillRect(cx - sz / 2, w.y, sz, w.h); c.shadowBlur = 0;
      } else { // LED "verre" avec reflet
        const r = Math.min(step, vert ? w.w : w.h) * 0.42;
        c.beginPath(); c.arc(cx, cy, r * 1.15, 0, Math.PI * 2); c.fillStyle = "#0a0a0a"; c.fill();
        const base = col || w.offColor || "#3a3a3a";
        const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
        g.addColorStop(0, col ? "#ffffff" : "#8a8a8a"); g.addColorStop(0.35, base); g.addColorStop(1, col ? base : "#1a1a1a");
        if (col && w.glow !== 0) { c.shadowColor = col; c.shadowBlur = w.glow || 16; }
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = g; c.fill(); c.shadowBlur = 0;
      }
    }
  };

  /* ---------------- valeurs par defaut ---------------- */
  Object.assign(DEFAULTS, {
    panel: { w: 1000, h: 450, x: 0, y: 0, style: "carbon" },
    lamp: { w: 90, h: 90, icon: "abs", field: "absActive", op: "==", v: 1, onColor: "#ffd400", offColor: "#2a2a2a" },
    gear7: { w: 160, h: 220, color: "#ff2a1a", bg: "#0a0a0a", radius: 8 },
    arcbar: { w: 420, h: 220, field: "rpm", maxField: "maxRpm", segments: 40, color: "#3f8bff", zone1: 0.7, zone2: 0.9 },
    image: { w: 200, h: 120, fit: "contain" },
    switch: { w: 90, h: 150, style: "rocker", color: "#ff5a14", act: "key", key: "L", when: "press", vibrate: true },
  });
  Object.assign(DEFAULTS.button, { style: "plain", act: "key", key: "S", when: "press", vibrate: true });

  /* ---------------- catalogue (categories facon SimDashboard) ---------------- */
  const CAT = [
    ["Fond", "🖼", [
      ["Carbone 1", "panel", { style: "carbon" }], ["Carbone 2 (fin)", "panel", { style: "carbon2" }], ["Carbone diagonal", "panel", { style: "carbonDiag" }],
      ["Écran course (cadre + vis)", "panel", { style: "display" }], ["Compteur LCD demi-lune", "panel", { style: "lcd", w: 700, h: 300, x: 150, y: 120 }],
      ["Dégradé", "panel", { style: "gradient", color: "#1d2430", color2: "#05070a" }], ["Grille d'écran", "panel", { style: "grid", color: "#0a0c0f" }],
      ["Couleur unie", "panel", { style: "solid", color: "#101418" }], ["Image perso (fichier)", "panel", { style: "image" }],
      ["Cadre / case", "rect", {}],
    ]],
    ["Boîte de vitesse", "⚙", [
      ["Rapport (texte)", "gear", {}], ["Rapport 7 segments", "gear7", {}],
      ["LEDs rondes", "leds", { shape: "dot" }], ["LEDs verre (authentique)", "leds", { shape: "glass", h: 46 }], ["LEDs rectangles", "leds", { shape: "rect", h: 24, count: 10 }],
      ["LEDs F1 (fines)", "leds", { shape: "dot", count: 20, h: 18, mode: "lr" }], ["LEDs bords → centre", "leds", { shape: "glass", mode: "center", h: 46 }],
      ["Régime : barre segmentée", "bar", {}], ["Régime : barre pleine", "bar", { segments: 0, h: 30 }], ["Régime : arc", "arcbar", {}],
      ["Régime : compteur noir", "gauge", {}], ["Régime : compteur fond jaune", "gauge", { face: "#f2c400", ink: "#111111", needle: "#d10f0f" }],
      ["Régime : compteur fond blanc", "gauge", { face: "#f3f3f3", ink: "#111111", needle: "#d10f0f" }], ["Régime (chiffres)", "value", { field: "rpm", label: "RPM" }],
      ["Shift light (case)", "lamp", { icon: "dot", field: "rpmPct", op: ">=", v: 96, onColor: "#ff1a0d", blink: true }],
    ]],
    ["Roues", "◍", [
      ["Pneus : température", "tyres", { show: "temp" }], ["Pneus : pression", "tyres", { show: "pressure" }],
      ["Temp. frein AVG", "value", { field: "brakeT.0", label: "FREIN AVG", suffix: "°" }], ["Usure pneu AVG", "value", { field: "tyreWear.0", format: "pct", label: "USURE AVG", suffix: "%" }],
    ]],
    ["Carburant", "⛽", [
      ["Carburant (L)", "value", { field: "fuel", decimals: 1, label: "FUEL L" }], ["Tours restants", "value", { field: "fuelLaps", decimals: 1, label: "TOURS" }],
      ["Conso / tour", "value", { field: "fuelPerLap", decimals: 2, label: "L / TOUR" }],
      ["Jauge carburant", "bar", { field: "fuel", maxField: "fuelCap", segments: 10, zones: false, color: "#ffb000" }],
      ["Alerte carburant", "lamp", { icon: "fuel", field: "fuelLaps", op: "<", v: 2, onColor: "#ffd400", blink: true }],
    ]],
    ["Moteur", "🔧", [
      ["Température eau", "value", { field: "water", label: "EAU °C", rules: [{ op: ">", v: 105, color: "#ff3b30", blink: true }] }],
      ["Température eau (compteur)", "gauge", { field: "water", min: 40, max: 140, step: 20, div: 1, redFrom: 115, label: "EAU °C", w: 200, h: 200 }],
      ["Température huile", "value", { field: "oil", label: "HUILE °C" }], ["Turbo", "value", { field: "turbo", decimals: 2, label: "TURBO bar" }],
      ["Voyant moteur (eau chaude)", "lamp", { icon: "water", field: "water", op: ">", v: 105, onColor: "#ff3b30" }],
    ]],
    ["Véhicule", "🚗", [
      ["Voyant ABS", "lamp", { icon: "abs", field: "absActive" }], ["Voyant TC", "lamp", { icon: "tc", field: "tcActive" }],
      ["Voyant phares", "lamp", { icon: "lights", field: "lights", onColor: "#3dff5a" }], ["Voyant limiteur (PIT)", "lamp", { icon: "pit", field: "limiter", onColor: "#2f7bff", blink: true }],
      ["Voyant moteur", "lamp", { icon: "engine", field: "water", op: ">", v: 110, onColor: "#ffb000" }],
      ["Voyant texte (ON)", "lamp", { icon: "text", text: "PSL", field: "limiter", onColor: "#e010e0" }],
      ["Réglage TC", "value", { field: "tc", label: "TC" }], ["Réglage ABS", "value", { field: "abs", label: "ABS" }], ["Map moteur", "value", { field: "map", label: "MAP" }],
      ["Répartition frein", "value", { field: "bb", decimals: 1, label: "BB" }], ["Vitesse", "value", { field: "speed", label: "KM/H" }],
      ["Image perso (logo, sticker…)", "image", {}],
    ]],
    ["Temps", "⏱", [
      ["Tour en cours", "value", { field: "cur", format: "time", label: "TOUR" }], ["Dernier tour", "value", { field: "last", format: "time", label: "DERNIER" }],
      ["Meilleur tour", "value", { field: "best", format: "time", label: "MEILLEUR", color: "#c86bff" }],
      ["Delta", "value", { field: "delta", format: "delta", decimals: 2, label: "DELTA", rules: [{ op: "<", v: 0, color: "#00e13c" }, { op: ">", v: 0, color: "#ff3b30" }] }],
      ["Temps session restant", "value", { field: "sessionLeft", format: "clock", label: "SESSION" }],
    ]],
    ["Session", "🏁", [
      ["Nom de la voiture", "value", { field: "car", format: "text", label: "", size: 28, align: "center", w: 400, h: 50 }],
      ["Position", "value", { field: "pos", label: "POS" }], ["Tour n°", "value", { field: "lap", label: "TOUR" }], ["N° de page", "value", { field: "page", label: "PAGE" }],
      ["Texte libre", "label", {}],
    ]],
    ["Button Box", "🎛", [
      ["Démarrer / arrêter le moteur", "button", { style: "start", w: 150, h: 150, key: "S" }],
      ["Bouton simple", "button", { style: "plain", text: "BTN" }], ["Bouton arrondi (texte)", "button", { style: "pill", text: "Text", w: 150, h: 100 }],
      ["Bouton rond chromé", "button", { style: "round", text: "", w: 110, h: 110 }], ["Bouton image perso", "button", { style: "image", w: 140, h: 140 }],
      ["Interrupteur à bascule (lumineux)", "switch", { style: "rocker" }], ["Interrupteur rond LED", "switch", { style: "roundLed", w: 110, h: 110 }],
      ["Interrupteur rond", "switch", { style: "round", w: 110, h: 110 }], ["Interrupteur carré", "switch", { style: "square", w: 110, h: 110 }],
      ["Killswitch rouge", "switch", { style: "kill", capColor: "rgba(200,20,20,0.75)", w: 90, h: 170 }],
      ["Killswitch bleu", "switch", { style: "kill", capColor: "rgba(30,70,220,0.75)", w: 90, h: 170 }],
      ["Interrupteur à levier métal", "switch", { style: "toggle", w: 120, h: 170 }],
      ["Page suivante", "button", { style: "plain", text: "PAGE ▶", act: "page_next" }], ["Dashboard suivant", "button", { style: "plain", text: "DASH ▶", act: "dash_next" }],
    ]],
  ];
  RSIMC.CATALOG = CAT;

  /* ---------------- appui sur un bouton / interrupteur -> actions a envoyer au PC ----------------
     phase : "down" (doigt pose) ou "up" (doigt leve). Retourne la liste des actions. */
  const combo = (w, sfx = "") => [w["mod1" + sfx], w["mod2" + sfx], w["key" + sfx]].filter(Boolean).join("+");
  RSIMC.pressActions = (w, phase, d) => {
    const act = w.act || (w.action ? (w.action.startsWith("key:") ? "key" : w.action) : "key");
    if (!w.act && w.action && w.action.startsWith("key:") && !w.key) w.key = w.action.slice(4);
    if (w.type === "switch") {
      if (phase !== "down") return [];
      const cur = switchState(w, d), next = !cur;
      if (!w.stateField) w._on = next;
      if (act !== "key") return [act];
      const k = (!next && w.altOff && combo(w, "Off")) ? combo(w, "Off") : combo(w);
      return k ? ["key:" + k] : [];
    }
    if (act !== "key") return phase === "down" ? [act] : [];
    const k = combo(w); if (!k) return [];
    const when = w.when || "press";
    if (when === "hold") return [(phase === "down" ? "keydown:" : "keyup:") + k];
    if (when === "release") return phase === "up" ? ["key:" + k] : [];
    return phase === "down" ? ["key:" + k] : [];
  };
  RSIMC.switchState = switchState;
})();
