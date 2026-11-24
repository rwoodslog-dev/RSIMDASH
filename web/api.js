/* RSIM - connexion a l'agent PC.
   - Page servie par l'agent (http://IP:8888) : appels relatifs, rien a faire.
   - Page servie ailleurs (Netlify, APK) : les appels "api/..." et "cars.json" partent vers l'adresse du PC
     enregistree dans Parametres (localStorage "rsimPC", ex. http://192.168.1.20:8888/).
   A charger en PREMIER dans chaque page. */
"use strict";
(function () {
  const saved = (localStorage.getItem("rsimPC") || "").trim();
  const norm = u => u ? (/^https?:\/\//i.test(u) ? u : "http://" + u).replace(/\/?$/, "/") : "";
  const servedByAgent = location.protocol === "http:" && location.port !== "";
  const base = servedByAgent ? "" : norm(saved);
  const isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  window.RSIMAPI = {
    base, servedByAgent, isApp, norm,
    needsSetup: !servedByAgent && !base,
    // site https (Netlify) + PC en http sur le reseau local = bloque par le navigateur (sauf localhost)
    blocked: !servedByAgent && location.protocol === "https:" && base && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(base),
    url: p => base + p,
    setPC(u) { localStorage.setItem("rsimPC", norm(u)); },
    async ping(u, ms = 2500) {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
      try { const r = await fetch(norm(u) + "api/ping", { signal: ctl.signal, cache: "no-store" }); clearTimeout(to);
        const j = await r.json(); return j.app === "rsim-agent" ? j : null; }
      catch (e) { clearTimeout(to); return null; }
    },
  };
  if (!base) return;
  const rewrite = u => (typeof u === "string" && /^(api\/|cars\.json)/.test(u)) ? base + u : u;
  const of = window.fetch.bind(window);
  window.fetch = (u, o) => of(rewrite(u), o);
  const OE = window.EventSource;
  window.EventSource = function (u, c) { return new OE(rewrite(u), c); };
  window.EventSource.prototype = OE.prototype;
})();
