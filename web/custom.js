/* RSIM Dash - moteur des dashboards personnalises (crees dans l'editeur).
   Un dashboard = { id, name, bg, fonts:[], pages:[ { name, widgets:[...] } ] }
   Chaque widget : { id, type, x, y, w, h, ...proprietes }  (toile logique 1000 x 450) */
"use strict";
(function () {
  const W = 1000, H = 450;

  /* ---- polices proposees (Google Fonts, repli systeme si pas d'internet) ---- */
  const FONT_LIST = ["Roboto", "Roboto Mono", "Roboto Condensed", "Orbitron", "Rajdhani", "Oxanium", "Share Tech Mono",
    "Michroma", "Bebas Neue", "Exo 2", "Teko", "Saira Condensed", "Russo One", "Chakra Petch", "Audiowide",
    "Barlow Condensed", "JetBrains Mono", "Arial", "Georgia", "Courier New"];
  const SYSTEM = ["Arial", "Georgia", "Courier New"];
  function loadFonts() {
    if (document.getElementById("rsim-gfonts")) return;
    const fams = FONT_LIST.filter(f => !SYSTEM.includes(f)).map(f => "family=" + f.replace(/ /g, "+") + ":wght@400;700");
    const l = document.createElement("link"); l.id = "rsim-gfonts"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?" + fams.join("&") + "&display=swap";
    document.head.appendChild(l);
  }
  const fontCss = (f, size, bold) => `${bold ? 700 : 400} ${size}px "${f || "Roboto"}", "Roboto", Arial, sans-serif`;

  /* ---- telemetrie disponible pour les liaisons ---- */
  const FIELDS = [
    ["gear", "Rapport"], ["rpm", "Régime (tr/min)"], ["rpmPct", "Régime (% du max)"], ["maxRpm", "Régime max"],
    ["speed", "Vitesse km/h"], ["throttle", "Accélérateur (0-1)"], ["brake", "Frein (0-1)"], ["clutch", "Embrayage (0-1)"],
    ["fuel", "Carburant (L)"], ["fuelCap", "Capacité réservoir"], ["fuelPerLap", "Conso / tour"], ["fuelLaps", "Tours restants (fuel)"],
    ["tc", "TC"], ["abs", "ABS"], ["map", "Map moteur"], ["bb", "Répartition frein %"],
    ["water", "Temp. eau"], ["oil", "Temp. huile"], ["turbo", "Turbo (bar)"],
    ["lap", "Tour"], ["pos", "Position"], ["cur", "Tour en cours"], ["last", "Dernier tour"], ["best", "Meilleur tour"],
    ["delta", "Delta"], ["sessionLeft", "Temps session restant (s)"],
    ["tyreT.0", "Temp pneu AVG"], ["tyreT.1", "Temp pneu AVD"], ["tyreT.2", "Temp pneu ARG"], ["tyreT.3", "Temp pneu ARD"],
    ["tyreP.0", "Pression AVG"], ["tyreP.1", "Pression AVD"], ["tyreP.2", "Pression ARG"], ["tyreP.3", "Pression ARD"],
    ["brakeT.0", "Temp frein AVG"], ["brakeT.1", "Temp frein AVD"], ["brakeT.2", "Temp frein ARG"], ["brakeT.3", "Temp frein ARD"],
    ["tyreWear.0", "Usure AVG"], ["tyreWear.1", "Usure AVD"], ["tyreWear.2", "Usure ARG"], ["tyreWear.3", "Usure ARD"],
    ["limiter", "Limiteur stand (0/1)"], ["lights", "Phares (0/1)"], ["tcActive", "TC actif (0/1)"], ["absActive", "ABS actif (0/1)"],
    ["inPit", "Aux stands (0/1)"], ["car", "Nom voiture"], ["game", "Jeu"], ["page", "N° page"],
  ];
  function val(d, key) {
    if (!key) return null;
    if (key === "rpmPct") return d.maxRpm > 0 ? d.rpm / d.maxRpm * 100 : null;
    if (key === "page") return (d._page || 0) + 1;
    if (key.includes(".")) { const [k, i] = key.split("."); return d[k] ? d[k][+i] : null; }
    const v = d[key];
    return typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  const isNil = v => v === null || v === undefined || (typeof v === "number" && isNaN(v));

  /* ---- formats d'affichage ---- */
  function fmt(v, w) {
    const f = w.format || "num";
    if (f === "text") return isNil(v) ? "" : String(v);
    if (f === "gear") return isNil(v) ? "-" : v < 0 ? "R" : v === 0 ? "N" : String(v);
    if (isNil(v)) return w.empty !== undefined ? w.empty : "--";
    if (f === "time" || f === "time2") {
      if (v <= 0) return f === "time" ? "-:--.---" : "--:--:--";
      const m = Math.floor(v / 60), r = v - m * 60;
      if (f === "time2") return String(m).padStart(2, "0") + ":" + String(Math.floor(r)).padStart(2, "0") + ":" + String(Math.min(99, Math.round((r % 1) * 100))).padStart(2, "0");
      return m + ":" + (r < 10 ? "0" : "") + r.toFixed(3);
    }
    if (f === "clock") { v = Math.max(0, Math.floor(v)); const h = Math.floor(v / 3600), m = Math.floor(v % 3600 / 60), s = v % 60;
      return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); }
    if (f === "delta") return (v > 0 ? "+" : v < 0 ? "-" : "") + Math.abs(v).toFixed(w.decimals ?? 2);
    if (f === "pct") v = v * 100;
    if (f === "onoff") return v ? (w.onText || "ON") : (w.offText || "OFF");
    return Number(v).toFixed(w.decimals ?? 0);
  }

  /* ---- regles : [{field?, op, v, color, bg, blink}] -> premiere qui matche ---- */
  function test(a, op, b) {
    if (isNil(a)) return op === "nil";
    switch (op) { case ">": return a > b; case ">=": return a >= b; case "<": return a < b; case "<=": return a <= b;
      case "==": return a == b; case "!=": return a != b; default: return false; }
  }
  function rule(w, d, v, t) {
    for (const r of w.rules || []) {
      const a = r.field ? val(d, r.field) : v;
      if (test(a, r.op, +r.v)) {
        if (r.blink && Math.floor(t * 6) % 2) return { blinkOff: true, ...r };
        return r;
      }
    }
    return null;
  }
  function visible(w, d) {
    if (!w.showIf || !w.showIf.field) return true;
    return test(val(d, w.showIf.field), w.showIf.op || "==", +w.showIf.v);
  }

  /* ---- primitives ---- */
  function rrect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function frame(c, w, bg) {
    if (bg) { rrect(c, w.x, w.y, w.w, w.h, w.radius); c.fillStyle = bg; c.fill(); }
    if (w.border && w.borderW) { rrect(c, w.x, w.y, w.w, w.h, w.radius); c.lineWidth = w.borderW; c.strokeStyle = w.border; c.stroke(); }
  }
  function txt(c, s, x, y, font, size, color, align, bold, glow) {
    c.font = fontCss(font, size, bold); c.fillStyle = color; c.textAlign = align || "center"; c.textBaseline = "middle";
    if (glow) { c.shadowColor = color; c.shadowBlur = glow; }
    c.fillText(s, x, y); c.shadowBlur = 0;
  }
  function alignX(w) { return w.align === "left" ? w.x + (w.pad ?? 10) : w.align === "right" ? w.x + w.w - (w.pad ?? 10) : w.x + w.w / 2; }

  function ledColors(d, w, t) {
    const n = w.count || 15, f = d.maxRpm > 0 ? d.rpm / d.maxRpm : 0;
    const start = w.start ?? 0.72, shift = w.shift ?? 0.965;
    const cols = [w.c1 || "#00e13c", w.c2 || "#ffd000", w.c3 || "#ff1a0d"], flashC = w.flash || "#2f7bff";
    if (d.limiter && w.limiterBlink !== false) return Array.from({ length: n }, (_, i) => (Math.floor(t * 4) + i) % 2 ? flashC : null);
    if (f >= shift + 0.01) return Array(n).fill(Math.floor(t * 10) % 2 ? flashC : null);
    const lit = Math.max(0, Math.min(1, (f - start) / (shift - start)));
    const out = Array(n).fill(null), z = (i, m) => cols[i < m * 0.4 ? 0 : i < m * 0.75 ? 1 : 2];
    if (w.mode === "center") { const half = Math.ceil(n / 2), on = Math.round(lit * half);
      for (let i = 0; i < on; i++) { out[i] = out[n - 1 - i] = z(i, half); } }
    else if (w.mode === "rl") { const on = Math.round(lit * n); for (let i = 0; i < on; i++) out[n - 1 - i] = z(i, n); }
    else { const on = Math.round(lit * n); for (let i = 0; i < on; i++) out[i] = z(i, n); }
    return out;
  }

  /* ---- rendu des widgets ---- */
  const R = {
    rect(c, w, d, t) { const r = rule(w, d, null, t); frame(c, w, r && r.bg ? r.bg : w.bg); },

    label(c, w, d, t) {
      const r = rule(w, d, null, t); frame(c, w, r && r.bg ? r.bg : w.bg);
      if (r && r.blinkOff) return;
      txt(c, w.text || "", alignX(w), w.y + w.h / 2, w.font, w.size || 20, (r && r.color) || w.color || "#fff", w.align, w.bold, w.glow);
    },

    value(c, w, d, t) {
      const v = val(d, w.field), r = rule(w, d, v, t);
      frame(c, w, r && r.bg ? r.bg : w.bg);
      const hasLabel = !!w.label, ly = w.y + (w.labelSize || 14) * 0.9 + 4;
      if (hasLabel) txt(c, w.label, w.labelAlign === "center" ? w.x + w.w / 2 : w.x + (w.pad ?? 10), ly, w.labelFont || w.font,
        w.labelSize || 14, w.labelColor || "#aaa", w.labelAlign === "center" ? "center" : "left", true);
      if (r && r.blinkOff) return;
      const s = (w.prefix || "") + fmt(v, w) + (w.suffix || "");
      const cy = hasLabel ? w.y + (w.h + (w.labelSize || 14)) / 2 + 2 : w.y + w.h / 2;
      txt(c, s, alignX(w), cy, w.font, w.size || 40, (r && r.color) || w.color || "#fff", w.align, w.bold !== false, w.glow);
    },

    gear(c, w, d, t) {
      const r = rule(w, d, val(d, "rpmPct"), t); frame(c, w, r && r.bg ? r.bg : w.bg);
      if (r && r.blinkOff) return;
      txt(c, fmt(d.gear, { format: "gear" }), w.x + w.w / 2, w.y + w.h / 2 + (w.size || w.h * 0.8) * 0.04, w.font || "Roboto Condensed",
        w.size || w.h * 0.85, (r && r.color) || w.color || "#fff", "center", w.bold !== false, w.glow);
    },

    bar(c, w, d, t) {
      const v = val(d, w.field), r = rule(w, d, v, t);
      const min = +w.min || 0, max = w.maxField ? (val(d, w.maxField) || 1) : (+w.max || 1);
      const f = isNil(v) ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)));
      frame(c, w, w.bg || "#1a1a1a");
      const col = (r && r.color) || w.color || "#00e13c", vert = w.orient === "v";
      const segs = +w.segments || 0;
      if (segs > 0) {
        for (let i = 0; i < segs; i++) {
          const on = (i + 0.5) / segs <= f, gap = w.gap ?? 2;
          c.fillStyle = on ? (w.zones && (i / segs) >= (w.zone2 ?? 2) ? w.zoneColor2 : w.zones && (i / segs) >= (w.zone1 ?? 2) ? w.zoneColor1 : col) : (w.offColor || "#222");
          if (vert) { const sh = w.h / segs; c.fillRect(w.x, w.y + w.h - (i + 1) * sh + gap / 2, w.w, sh - gap); }
          else { const sw = w.w / segs; c.fillRect(w.x + i * sw + gap / 2, w.y, sw - gap, w.h); }
        }
      } else {
        c.fillStyle = col;
        if (vert) c.fillRect(w.x, w.y + w.h * (1 - f), w.w, w.h * f); else c.fillRect(w.x, w.y, w.w * f, w.h);
      }
    },

    leds(c, w, d, t) {
      frame(c, w, w.bg);
      const cols = ledColors(d, w, t), n = cols.length, vert = w.orient === "v";
      const step = (vert ? w.h : w.w) / n;
      for (let i = 0; i < n; i++) {
        const col = cols[i], cx = vert ? w.x + w.w / 2 : w.x + step * i + step / 2, cy = vert ? w.y + step * i + step / 2 : w.y + w.h / 2;
        c.fillStyle = col || w.offColor || "#1c1c1c";
        if (col && w.glow !== 0) { c.shadowColor = col; c.shadowBlur = w.glow || 16; }
        const sz = step * (w.size ?? 0.8), thick = vert ? w.w : w.h;
        if (w.shape === "bar") { if (vert) c.fillRect(w.x, cy - sz / 2, w.w, sz); else rrect(c, cx - sz / 2, w.y, sz, w.h, 3), c.fill(); }
        else { c.beginPath(); c.arc(cx, cy, Math.min(sz, thick) / 2, 0, Math.PI * 2); c.fill(); }
        c.shadowBlur = 0;
      }
    },

    gauge(c, w, d, t) {
      const v = val(d, w.field), min = +w.min || 0, max = w.maxField ? (val(d, w.maxField) || 1) : (+w.max || 100);
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2, rad = Math.min(w.w, w.h) / 2 - 4;
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = x => a0 + (a1 - a0) * Math.max(0, Math.min(1.02, (x - min) / (max - min)));
      c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fillStyle = w.face || "#0b0b0b"; c.fill();
      if (w.border) { c.lineWidth = w.borderW || 6; c.strokeStyle = w.border; c.stroke(); }
      if (w.redFrom) { c.beginPath(); c.arc(cx, cy, rad - 12, ang(+w.redFrom), a1); c.lineWidth = 10; c.strokeStyle = w.red || "#e8231b"; c.stroke(); }
      const step = +w.step || (max - min) / 10;
      for (let x = min; x <= max + 1e-6; x += step / 2) {
        const a = ang(x), major = Math.abs((x - min) / step - Math.round((x - min) / step)) < 1e-6, r2 = rad - (major ? 20 : 12);
        c.beginPath(); c.moveTo(cx + Math.cos(a) * (rad - 3), cy + Math.sin(a) * (rad - 3)); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        c.lineWidth = major ? 3 : 1.5; c.strokeStyle = w.ink || "#eee"; c.stroke();
        if (major) txt(c, String(Math.round(x / (+w.div || 1))), cx + Math.cos(a) * (rad - 38), cy + Math.sin(a) * (rad - 38), w.font, rad * 0.14, w.ink || "#eee", "center", true);
      }
      if (w.label) txt(c, w.label, cx, cy + rad * 0.4, w.font, rad * 0.11, w.ink || "#eee", "center", false);
      const a = ang(isNil(v) ? min : v);
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (rad - 14), cy + Math.sin(a) * (rad - 14));
      c.lineWidth = 5; c.lineCap = "round"; c.strokeStyle = w.needle || "#ff5a1f"; c.stroke();
      c.beginPath(); c.arc(cx, cy, rad * 0.08, 0, Math.PI * 2); c.fillStyle = "#222"; c.fill();
    },

    tyres(c, w, d, t) {
      frame(c, w, w.bg);
      const g = w.gap ?? 6, cw = (w.w - g) / 2, ch = (w.h - g) / 2, src = w.show || "temp";
      for (let i = 0; i < 4; i++) {
        const x = w.x + (i % 2) * (cw + g), y = w.y + Math.floor(i / 2) * (ch + g);
        const tt = d.tyreT ? d.tyreT[i] : null, tp = d.tyreP ? d.tyreP[i] : null;
        const col = isNil(tt) ? (w.cold || "#2f7bff") : tt < (w.coldMax ?? 65) ? (w.cold || "#2f7bff") : tt < (w.okMax ?? 95) ? (w.ok || "#00c83c") : tt < (w.hotMax ?? 105) ? (w.warm || "#ffb000") : (w.hot || "#ff1a0d");
        rrect(c, x, y, cw, ch, w.radius ?? 6); c.fillStyle = col; c.fill();
        const s = src === "pressure" ? (isNil(tp) ? "-.--" : tp.toFixed(tp > 5 ? 1 : 2)) : (isNil(tt) ? "--" : Math.round(tt) + "°");
        txt(c, s, x + cw / 2, y + ch / 2, w.font, w.size || ch * 0.5, w.color || "#000", "center", true);
      }
    },

    button(c, w, d, t) {
      const pressed = w._pressed && t - w._pressed < 0.2;
      frame(c, w, pressed ? (w.pressBg || "#fff") : (w.bg || "#333"));
      txt(c, w.text || "BTN", w.x + w.w / 2, w.y + w.h / 2, w.font, w.size || 22, pressed ? (w.pressColor || "#000") : (w.color || "#fff"), "center", true);
    },
  };

  /* types + valeurs par defaut (utilise par l'editeur) */
  const DEFAULTS = {
    label: { w: 160, h: 40, text: "TEXTE", font: "Roboto", size: 22, color: "#ffffff", align: "center", bold: true },
    value: { w: 200, h: 80, field: "speed", format: "num", decimals: 0, label: "VITESSE", labelSize: 14, labelColor: "#aaaaaa",
      font: "Roboto Mono", size: 44, color: "#ffffff", bg: "#141414", radius: 8, align: "right", bold: true },
    gear: { w: 180, h: 220, font: "Roboto Condensed", bold: true, color: "#ffffff", bg: "#141414", radius: 10,
      rules: [{ op: ">=", v: 96, color: "#ff1a0d" }] },
    bar: { w: 400, h: 30, field: "rpm", maxField: "maxRpm", min: 0, color: "#00e13c", bg: "#1a1a1a", segments: 30, gap: 3,
      zones: true, zone1: 0.7, zoneColor1: "#ffd000", zone2: 0.9, zoneColor2: "#ff1a0d" },
    leds: { w: 600, h: 34, count: 15, mode: "lr", shape: "dot", start: 0.72, shift: 0.965 },
    gauge: { w: 300, h: 300, field: "rpm", min: 0, max: 9000, step: 1000, div: 1000, redFrom: 7500, label: "x1000 RPM",
      face: "#0b0b0b", ink: "#eeeeee", needle: "#ff5a1f", font: "Roboto" },
    tyres: { w: 200, h: 120, show: "temp", font: "Roboto Mono", color: "#000000", coldMax: 65, okMax: 95, hotMax: 105 },
    button: { w: 140, h: 70, text: "START", font: "Roboto", size: 24, color: "#ffffff", bg: "#b3261a", radius: 10, border: "#ffffff", borderW: 2,
      action: "key:S" },
    rect: { w: 200, h: 100, bg: "#222222", radius: 8, border: "#888888", borderW: 0 },
  };

  function draw(c, d, dash, pageIdx, t) {
    const page = (dash.pages || [])[pageIdx] || (dash.pages || [])[0] || { widgets: [] };
    c.fillStyle = page.bg || dash.bg || "#000"; c.fillRect(0, 0, W, H);
    d._page = pageIdx;
    for (const w of page.widgets) {
      if (!visible(w, d)) continue;
      const fn = R[w.type]; if (!fn) continue;
      c.save(); if (w.opacity !== undefined && w.opacity !== "") c.globalAlpha = +w.opacity;
      try { fn(c, w, d, t); } catch (e) { /* widget mal configure : on ignore */ }
      c.restore();
    }
  }
  function hit(dash, pageIdx, x, y) {
    const page = (dash.pages || [])[pageIdx] || { widgets: [] };
    for (let i = page.widgets.length - 1; i >= 0; i--) {
      const w = page.widgets[i];
      if (w.type === "button" && x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return w;
    }
    return null;
  }
  window.RSIMC = { W, H, FONT_LIST, FIELDS, DEFAULTS, draw, hit, val, fmt, loadFonts };
})();
