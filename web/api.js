/* RSIM - connexion a l'agent PC.
   - Page servie par l'agent (http://IP:8888) : appels relatifs, rien a faire.
   - Appli Android (APK) : les appels "api/..." et "cars.json" partent vers l'adresse du PC
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
    url: p => base + p,
    setPC(u) { localStorage.setItem("rsimPC", norm(u)); },
    /* Recherche automatique du PC sur le Wi-Fi : teste les adresses courantes des box (port 8888). */
    async scan(onProgress, port = 8888) {
      const nets = ["192.168.1", "192.168.0", "192.168.2", "192.168.3", "192.168.10", "192.168.100", "192.168.178", "10.0.0", "10.0.1", "172.16.0"];
      const last = (localStorage.getItem("rsimPC") || "").match(/\d+\.\d+\.\d+\.\d+/);
      const hosts = [];
      if (last) hosts.push(last[0]);
      nets.forEach(n => { for (let i = 1; i < 255; i++) hosts.push(n + "." + i); });
      let found = null, done = 0;
      const tryHost = async h => { if (found) return; const j = await this.ping(h + ":" + port, 900); done++;
        if (j && !found) found = h + ":" + port; };
      for (let k = 0; k < hosts.length && !found; k += 128) {
        await Promise.all(hosts.slice(k, k + 128).map(tryHost));
        if (onProgress) onProgress(Math.min(1, done / hosts.length));
      }
      return found;
    },
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
