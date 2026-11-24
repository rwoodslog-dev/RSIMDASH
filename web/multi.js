/* RSIM Dash - ecrans multi-pages : un ecran = une liste de pages, chaque page affiche
   un dashboard existant (dash integre, dash perso, button box) ou "auto" (dash de la voiture).
   Format : { id, name, type:"multi", category:"Multi-pages", w:1600, h:900, pages:[ {ref:"d169_gt3oem", name:"Dash"}, ... ] } */
"use strict";
(function () {
  function isMulti(dsh) { return !!(dsh && dsh.type === "multi"); }

  // d = trame telemetrie ; getDash(id) -> dash perso (ou null) ; profiles = liste cars.json
  function resolve(d, getDash, profiles) {
    let id = d.profile, page = d.page || 0, multi = null;
    for (let depth = 0; depth < 3; depth++) {
      if (id && id.startsWith("custom:")) {
        const dsh = getDash(id.slice(7));
        if (!dsh) return { kind: "loading", multi };
        if (isMulti(dsh)) {
          if (multi) { id = "universal"; break; }               // pas de multi dans un multi
          const n = Math.max(1, (dsh.pages || []).length), pi = ((page % n) + n) % n, pg = (dsh.pages || [])[pi] || {};
          multi = { dsh, index: pi, count: n, name: pg.name || "" };
          id = pg.ref === "auto" || !pg.ref ? (d.autoProfile && d.autoProfile !== d.profile ? d.autoProfile : "universal") : pg.ref;
          page = pg.sub || 0;
          continue;
        }
        return { kind: "custom", dsh, page, multi };
      }
      break;
    }
    const p = profiles.find(x => x.id === id) || profiles.find(x => x.id === "universal");
    return { kind: "fam", p, multi };
  }
  function size(v) {
    if (v.kind === "custom") return [v.dsh.w || RSIM.W, v.dsh.h || RSIM.H];
    const asp = v.p && RSIM.ASPECT && RSIM.ASPECT[v.p.family];
    return asp ? [asp[0], asp[1]] : [RSIM.W, RSIM.H];
  }
  function draw(c, v, d, t) {
    if (v.kind === "custom") { RSIMC.draw(c, d, v.dsh, v.page, t); return true; }
    if (v.kind === "fam" && v.p && RSIM.FAMILIES[v.p.family]) { RSIM.FAMILIES[v.p.family](c, d, v.p.theme, t); return true; }
    return false;
  }
  // points de page + nom de la page (affiche 1,5 s apres un changement)
  function overlay(c, v, W, H, t, changedAt) {
    if (!v.multi || v.multi.count < 2) return;
    const n = v.multi.count, r = H * 0.0065, gap = r * 3.4, x0 = W / 2 - (n - 1) * gap / 2, y = H - r * 1.7;
    c.save();
    for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x0 + i * gap, y, r, 0, Math.PI * 2);
      c.fillStyle = i === v.multi.index ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)"; c.fill(); }
    const age = t - changedAt;
    if (age < 1.5) {
      const a = Math.min(1, (1.5 - age) * 2), label = (v.multi.index + 1) + " / " + n + (v.multi.name ? "  ·  " + v.multi.name : "");
      c.globalAlpha = a; c.font = "700 " + Math.round(H * 0.045) + "px Rajdhani, Roboto, sans-serif";
      const tw = c.measureText(label).width + H * 0.06, th = H * 0.08;
      c.fillStyle = "rgba(0,0,0,0.75)"; c.beginPath(); c.roundRect(W / 2 - tw / 2, H * 0.44, tw, th, th / 2); c.fill();
      c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(label, W / 2, H * 0.44 + th / 2);
    }
    c.restore();
  }
  window.RSIMM = { isMulti, resolve, size, draw, overlay };
})();
