"""RSIM Dash - serveur. Lance :  python server.py   (ou  python server.py --demo)

Telephone : http://<IP du PC>:8888        Page admin (sur le PC) : http://localhost:8888/admin
"""
import argparse
import glob
import json
import os
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import re

import inputs
import telemetry
import recorder
import ffb
import capture
import hotkeys

BASE = os.path.dirname(os.path.abspath(sys.argv[0] if getattr(sys, "frozen", False) else __file__))
WEB = os.path.join(BASE, "web")
CARS = os.path.join(BASE, "cars.json")
ASSIGN = os.path.join(BASE, "assignments.json")
SEEN = os.path.join(BASE, "seen_cars.json")
LIVE_PATH = os.path.join(BASE, "live_pages.json")
DASH_DIR = os.path.join(BASE, "dashboards")
BB_DIR = os.path.join(BASE, "buttonboxes")      # button box fournies (modeles d'origine)
BINDS = os.path.join(BASE, "bindings.json")


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


class State:
    def __init__(self, demo=False):
        self.lock = threading.Lock()
        self.cars = load_json(CARS, {"profiles": [], "defaults": {}})
        self.assign = load_json(ASSIGN, {})          # "jeu|voiture" -> profil
        self.seen = load_json(SEEN, {})              # "jeu|voiture" -> {game, car, cls, last}
        self.frame = {"connected": False}
        self.demo = telemetry.Demo() if demo else None
        self.fuel_lap = {"lap": None, "fuel": None, "avg": 0.0}
        self.ui = {"page": 0, "override": None, "lastProfile": None, "lastAuto": None}
        self.binds = load_json(BINDS, [])            # [{dev, btn, action, devName}]
        self.dash_rev = 0
        self.joy = None
        self.phone_url = ""
        os.makedirs(DASH_DIR, exist_ok=True)
        self.dashes = {}
        self.load_dashes()
        self.ring = recorder.Ring(300)                                   # 5 min de telemetrie pour les videos
        self.laps = recorder.LapRecorder(os.path.join(BASE, "telemetry"))
        self.ffb = ffb.FFBStore(os.path.join(BASE, "ffb_profiles.json"))
        self.cap = None
        self.hk = None
        # dash en direct : page 1 = dash principal ("auto" = selon jeu + voiture, sinon dash choisi et bloque) + pages ajoutees
        self.live = load_json(LIVE_PATH, None) or {"main": "auto", "pages": []}

    # ---- dashboards personnalises (dossier dashboards/)
    def load_dashes(self):
        self.dashes = {}
        # d'abord les modeles fournis, puis tes versions modifiees (meme id = remplace)
        for folder in (BB_DIR, DASH_DIR):
            if not os.path.isdir(folder):
                continue
            for fn in sorted(os.listdir(folder)):
                if fn.endswith(".json"):
                    dsh = load_json(os.path.join(folder, fn), None)
                    if dsh and dsh.get("id") and not (folder == BB_DIR and dsh["id"] in OLD_BB):
                        self.dashes[dsh["id"]] = dsh

    def save_dash(self, dsh):
        dsh["id"] = re.sub(r"[^a-zA-Z0-9_-]", "_", dsh.get("id") or "dash_%d" % int(time.time()))
        save_json(os.path.join(DASH_DIR, dsh["id"] + ".json"), dsh)
        self.dashes[dsh["id"]] = dsh
        self.dash_rev += 1
        return dsh["id"]

    def delete_dash(self, did):
        path = os.path.join(DASH_DIR, re.sub(r"[^a-zA-Z0-9_-]", "_", did) + ".json")
        if os.path.isfile(path):
            os.remove(path)
        self.load_dashes()          # un modele fourni reapparait (= reinitialiser)
        self.dash_rev += 1

    def all_profiles(self):
        prof = list(self.cars.get("profiles", []))
        for dsh in self.dashes.values():
            prof.append({"id": "custom:" + dsh["id"], "name": ("🎛 " if dsh.get("category") == "Button box" else "▤ " if dsh.get("type") == "multi" else "★ ") + dsh.get("name", dsh["id"]),
                         "family": "custom", "cat": dsh.get("category", "Mes dashboards perso"),
                         "aspect": "16:9" if dsh.get("w") == 1600 else None, "games": [], "match": dsh.get("match", [])})
        return prof

    # ---- dash en direct (pages)
    def name_of(self, ref):
        if ref == "auto":
            return "Dash auto"
        p = next((x for x in self.all_profiles() if x["id"] == ref), None)
        return re.sub(r"^[★🎛▤] ", "", p["name"]) if p else ref

    def expand(self, ref):
        """Un ecran multi-pages ajoute toutes ses pages."""
        if ref and ref[7:] in OLD_BB:
            ref = "custom:" + OLD_BB[ref[7:]]
        if ref and ref.startswith("custom:"):
            dsh = self.dashes.get(ref[7:])
            if dsh and dsh.get("type") == "multi":
                return [{"ref": pg.get("ref") or "auto", "name": pg.get("name") or self.name_of(pg.get("ref") or "auto")} for pg in dsh.get("pages", [])]
        return [{"ref": ref, "name": self.name_of(ref)}]

    def live_dash(self):
        pages = []
        for ref in [self.live.get("main") or "auto"] + list(self.live.get("pages", [])):
            pages += self.expand(ref)
        return {"id": "__live", "name": "Dash en direct", "type": "multi", "w": 1600, "h": 900, "pages": pages,
                "main": self.live.get("main") or "auto", "extra": list(self.live.get("pages", []))}

    def set_live(self, main=None, pages=None):
        if main is not None:
            self.live["main"] = main or "auto"
        if pages is not None:
            self.live["pages"] = [p for p in pages if p and p != "custom:__live"][:20]
        save_json(LIVE_PATH, self.live)
        self.ui["page"] = min(self.ui["page"], len(self.live_dash()["pages"]) - 1)
        self.dash_rev += 1

    def pages_of(self, profile):
        if profile == "custom:__live":
            return max(1, len(self.live_dash()["pages"]))
        if profile and profile.startswith("custom:"):
            dsh = self.dashes.get(profile[7:])
            return max(1, len(dsh.get("pages", []))) if dsh else 1
        return 1

    # ---- actions (boutons du volant / boutons du telephone)
    def action(self, act):
        act = (act or "").strip()
        cur = "custom:__live"
        ids = [x["id"] for x in self.all_profiles()]
        if act == "page_next":
            self.ui["page"] = (self.ui["page"] + 1) % self.pages_of(cur)
        elif act == "page_prev":
            self.ui["page"] = (self.ui["page"] - 1) % self.pages_of(cur)
        elif act in ("dash_next", "dash_prev") and ids:      # change le dash principal (et le bloque)
            m = self.live.get("main")
            if m == "auto":
                m = self.ui.get("lastAuto")
            i = ids.index(m) if m in ids else 0
            self.set_live(main=ids[(i + (1 if act == "dash_next" else -1)) % len(ids)])
            self.ui["page"] = 0
        elif act == "dash_auto":
            self.set_live(main="auto")
            self.ui["page"] = 0
        elif act.startswith("dash:"):                         # dash choisi = page 1 bloquee
            self.set_live(main=act[5:])
            self.ui["page"] = 0
        elif act.startswith("live_add:"):                     # ajoute une page a la suite
            self.set_live(pages=self.live.get("pages", []) + [act[9:]])
            self.ui["page"] = self.pages_of(cur) - 1
        elif act.startswith("page:"):
            self.ui["page"] = max(0, int(act[5:]) - 1) % self.pages_of(cur)
        elif act in ("rec_toggle", "rec_start", "rec_stop", "clip", "buffer_toggle", "snap") and self.cap:
            threading.Thread(target=getattr(self.cap, act), daemon=True).start()   # ne bloque pas le bouton
        elif act.startswith("launch:"):
            threading.Thread(target=launch, args=(act[7:],), daemon=True).start()
        elif act.startswith("openpc:"):
            open_on_pc(act[7:])
        elif act.startswith("media:"):
            inputs.media_key(act[6:])
        elif act.startswith("key:"):
            inputs.send_keys(act[4:])
        elif act.startswith("keydown:"):
            inputs.key_state(act[8:], False)
        elif act.startswith("keyup:"):
            inputs.key_state(act[6:], True)
        else:
            return False
        print("  > action :", act)
        return True

    def apply_hotkeys(self):
        if self.hk and self.cap:
            c = self.cap.cfg
            self.hk.set({"rec_toggle": c.get("hotRec"), "clip": c.get("hotClip"), "buffer_toggle": c.get("hotBuf"), "snap": c.get("hotSnap")})

    def on_button(self, dev, btn):
        for b in self.binds:
            if int(b.get("dev", -1)) == dev and int(b.get("btn", -1)) == btn:
                self.action(b.get("action"))

    # ---- choix du dashboard
    def is_multi(self, pid):
        return bool(pid and pid.startswith("custom:") and (self.dashes.get(pid[7:]) or {}).get("type") == "multi")

    def resolve(self, game, car, cls, no_multi=False):
        key = "%s|%s" % (game, car)
        if key in self.assign and not (no_multi and self.is_multi(self.assign[key])):
            return self.assign[key], "manuel"
        hay = (car + " " + cls).lower()
        for p in self.all_profiles():
            if no_multi and self.is_multi(p["id"]):
                continue
            games = p.get("games") or []
            if games and not any(g.lower() in game.lower() for g in games):
                continue
            if any(m.lower() in hay for m in p.get("match", [])):
                return p["id"], "auto"
        for k, v in self.cars.get("defaults", {}).items():
            if k != "*" and k.lower() in game.lower():
                return v, "défaut jeu"
        return self.cars.get("defaults", {}).get("*", "universal"), "défaut"

    def remember(self, game, car, cls):
        if not car:
            return
        key = "%s|%s" % (game, car)
        new = key not in self.seen
        self.seen[key] = {"game": game, "car": car, "cls": cls, "last": int(time.time())}
        if new:
            print("  > Nouvelle voiture detectee : [%s] %s" % (game, car))
            save_json(SEEN, self.seen)

    def fuel_avg(self, d):
        """Conso / tour calculee si le jeu ne la donne pas."""
        fl = self.fuel_lap
        if d["fuelPerLap"]:
            return d["fuelPerLap"]
        if fl["lap"] is None or d["lap"] < fl["lap"]:
            fl.update(lap=d["lap"], fuel=d["fuel"], avg=0.0)
        elif d["lap"] > fl["lap"]:
            used = fl["fuel"] - d["fuel"]
            if 0 < used < 50:
                fl["avg"] = used if not fl["avg"] else fl["avg"] * 0.6 + used * 0.4
            fl.update(lap=d["lap"], fuel=d["fuel"])
        return fl["avg"]

    def publish(self, d):
        if d is None:   # pas de jeu : on garde le dernier dash affiche (le telephone le montre en attente)
            with self.lock:
                self.frame = {"connected": False, "profile": "custom:__live", "page": self.ui["page"], "liveMain": self.live.get("main"),
                              "dashRev": self.dash_rev, "autoProfile": self.ui.get("lastAuto")}
                if self.cap:
                    r = self.cap.small()
                    self.frame.update(rec=r, recOn=int(r["on"]), bufOn=int(r["buf"]))
            self.laps.idle()
            return
        auto, how_auto = self.resolve(d["game"], d["car"], d["carClass"], no_multi=True)
        d["autoProfile"] = self.ui["lastAuto"] = auto
        main = self.live.get("main") or "auto"
        prof, how = "custom:__live", ("auto · " + how_auto if main == "auto" else "bloqué")
        d["liveMain"] = main
        d["fuelPerLap"] = self.fuel_avg(d)
        d["fuelLaps"] = d["fuel"] / d["fuelPerLap"] if d["fuelPerLap"] > 0 else None
        now = time.time()
        d.update(connected=True, profile=prof, how=how, ts=now, page=self.ui["page"], dashRev=self.dash_rev)
        self.ring.feed(d, now)
        try:
            self.laps.feed(d, now)
        except Exception as e:
            print("  ! Enregistrement tour :", e)
        if self.cap:
            r = self.cap.small()
            d["rec"], d["recOn"], d["bufOn"] = r, int(r["on"]), int(r["buf"])
        fp = self.ffb.match(d["game"], d["car"], d["carClass"])
        d["ffbProfile"] = fp["name"] if fp else None
        with self.lock:
            self.frame = d
        self.remember(d["game"], d["car"], d["carClass"])


def source_loop(st):
    cur = st.demo
    adapters = [cls() for cls in telemetry.ADAPTERS]
    last_scan = 0
    while True:
        try:
            if cur is None:
                if time.time() - last_scan > 1.5:
                    last_scan = time.time()
                    for a in adapters:
                        if a.open():
                            cur = a
                            print("  > Jeu detecte : %s" % type(a).__name__)
                            break
                if cur is None:
                    st.publish(None)
                    time.sleep(0.5)
                    continue
            if not cur.alive():
                print("  > Jeu ferme / plus de donnees")
                cur.close()
                cur = None
                st.publish(None)
                continue
            st.publish(cur.read())
        except Exception as e:
            print("  ! Erreur lecture :", e)
            if cur is not None and cur is not st.demo:
                cur.close()
                cur = None
            time.sleep(1)
        time.sleep(1 / 60)


MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
        ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".webp": "image/webp", ".webmanifest": "application/manifest+json"}


def make_handler(st):
    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def send(self, code, body, ctype="application/json"):
            if isinstance(body, (dict, list)):
                body = json.dumps(body, ensure_ascii=False).encode()
            elif isinstance(body, str):
                body = body.encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.cors()
            self.end_headers()
            self.wfile.write(body)

        def cors(self):
            # l appli Android (APK) appelle l agent depuis une autre origine : on autorise
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Private-Network", "true")

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "86400")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def static(self, rel):
            path = os.path.normpath(os.path.join(WEB, rel))
            if not path.startswith(WEB) or not os.path.isfile(path):
                return self.send(404, {"error": "introuvable"})
            with open(path, "rb") as f:
                self.send(200, f.read(), MIME.get(os.path.splitext(path)[1], "application/octet-stream"))

        def do_GET(self):
            p = urlparse(self.path).path
            if p in ("/", "/index.html"):
                return self.static("index.html")
            if p in ("/admin", "/hub"):
                return self.static("hub.html")
            if p == "/cars.json":
                return self.send(200, dict(st.cars, profiles=st.all_profiles()))
            q = parse_qs(urlparse(self.path).query)
            if p in ("/editor", "/buttons"):
                return self.static("buttons.html")
            if p == "/api/dashboards":
                return self.send(200, [{"id": k, "name": v.get("name", k), "pages": len(v.get("pages", []))} for k, v in st.dashes.items()])
            if p == "/api/live":
                return self.send(200, st.live_dash())
            if p == "/api/dashboard":
                if (q.get("id") or [""])[0] == "__live":
                    return self.send(200, st.live_dash())
                dsh = st.dashes.get((q.get("id") or [""])[0])
                return self.send(200 if dsh else 404, dsh or {"error": "introuvable"})
            if p == "/api/joy":
                lp = st.joy.last_press if st.joy else None
                return self.send(200, {"devices": st.joy.devices if st.joy else [], "last": lp, "now": time.time()})
            if p == "/api/bindings":
                return self.send(200, {"binds": st.binds, "keys": inputs.KEY_NAMES})
            if p == "/api/ping":
                return self.send(200, {"app": "rsim-agent", "version": 1, "phoneUrl": st.phone_url,
                                       "game": st.frame.get("game") if st.frame.get("connected") else None})
            if p == "/live":
                return self.static("live.html")
            if p == "/api/state":
                with st.lock:
                    fr = dict(st.frame)
                return self.send(200, {"frame": fr, "seen": sorted(st.seen.values(), key=lambda x: -x["last"]),
                                       "assign": st.assign, "demo": st.demo is not None, "phoneUrl": st.phone_url})
            if p == "/api/stream":
                return self.stream()
            # ---- telemetrie (tours)
            if p == "/api/tele/sessions":
                return self.send(200, st.laps.sessions())
            if p == "/api/tele/lap":
                lap = st.laps.lap(qv(q, "s"), qv(q, "f"))
                return self.send(200 if lap else 404, lap or {"error": "introuvable"})
            # ---- profils FFB
            if p == "/api/ffb":
                return self.send(200, dict(st.ffb.meta(), profiles=st.ffb.profiles))
            if p == "/api/ffb/current":
                f = st.frame
                m = st.ffb.match(f.get("game"), f.get("car"), f.get("carClass", "")) if f.get("connected") else None
                return self.send(200, {"profile": m, "game": f.get("game"), "car": f.get("car")})
            # ---- videos
            if p == "/api/capture":
                return self.send(200, st.cap.status())
            if p == "/api/capture/audio":
                return self.send(200, st.cap.audio_devices())
            if p == "/api/capture/diag":
                return self.send(200, st.cap.diag())
            if p == "/api/capture/probe":
                return self.send(200, st.cap.probe(force=True))
            if p == "/api/videos":
                return self.send(200, st.cap.list())
            if p == "/api/video":
                path = st.cap.safe(qv(q, "f"))
                j = os.path.splitext(path)[0] + ".json" if path else ""
                return self.send(200, load_json(j, {})) if j and os.path.isfile(j) else self.send(404, {"error": "?"})
            if p.startswith("/media/"):
                return self.media(p[7:], "dl" in q)
            if p.startswith("/photo/"):
                return self.media(p[7:], "dl" in q, photo=True)
            if p == "/api/launchers":
                return self.send(200, [{"id": x["id"], "name": x["name"], "sim": x.get("sim", True)} for x in launchers()])
            if p == "/api/photos":
                return self.send(200, st.cap.photo_list())
            return self.static(p.lstrip("/"))

        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
            u = urlparse(self.path)
            if u.path == "/api/video/upload":          # montage envoye par l'appli (donnees brutes)
                name = (parse_qs(u.query).get("name") or ["montage.webm"])[0]
                return self.send(200, {"ok": True, "file": st.cap.video_save(name, self.rfile.read(n))})
            try:
                data = json.loads(self.rfile.read(n) or b"{}")
            except Exception:
                return self.send(400, {"error": "json"})
            p = urlparse(self.path).path
            if p == "/api/assign":
                key = "%s|%s" % (data.get("game", ""), data.get("car", ""))
                if data.get("profile"):
                    st.assign[key] = data["profile"]
                else:
                    st.assign.pop(key, None)
                save_json(ASSIGN, st.assign)
                return self.send(200, {"ok": True})
            if p == "/api/dashboard":
                return self.send(200, {"ok": True, "id": st.save_dash(data)})
            if p == "/api/live":
                st.set_live(data.get("main"), data.get("pages"))
                return self.send(200, st.live_dash())
            if p == "/api/dashboard/delete":
                st.delete_dash(data.get("id", ""))
                return self.send(200, {"ok": True})
            if p == "/api/action":
                try:
                    ok = st.action(data.get("action"))
                except Exception as e:
                    return self.send(400, {"error": str(e)})
                return self.send(200, {"ok": ok, "page": st.ui["page"], "override": st.ui["override"]})
            if p == "/api/tele/delete":
                return self.send(200, {"ok": st.laps.delete(data.get("s"), data.get("f"))})
            if p == "/api/tele/import":
                return self.send(200, {"ok": True, "s": st.laps.import_lap(data.get("lap"), data.get("owner"))})
            if p == "/api/ffb":
                return self.send(200, {"ok": True, "id": st.ffb.put(data)})
            if p == "/api/ffb/delete":
                st.ffb.delete(data.get("id"))
                return self.send(200, {"ok": True})
            if p == "/api/capture/install":
                return self.send(200, {"ok": st.cap.install_ffmpeg()})
            if p == "/api/capture/config":
                st.cap.save_cfg(data)
                st.apply_hotkeys()
                return self.send(200, st.cap.status())
            if p == "/api/input":          # telecommande : souris / texte
                t = data.get("t")
                try:
                    if t == "move":
                        inputs.mouse_move(data.get("dx", 0), data.get("dy", 0))
                    elif t == "btn":
                        inputs.mouse_button(data.get("b", "left"), bool(data.get("down")))
                    elif t == "click":
                        inputs.mouse_click(data.get("b", "left"), bool(data.get("double")))
                    elif t == "wheel":
                        inputs.mouse_wheel(data.get("d", 0), bool(data.get("h")))
                    elif t == "bs":
                        for _ in range(min(200, int(data.get("n", 1)))):
                            inputs.key_state("BACKSPACE", False); inputs.key_state("BACKSPACE", True)
                    elif t == "text":
                        inputs.type_text(str(data.get("s", ""))[:2000])
                except Exception as e:
                    return self.send(200, {"ok": False, "error": str(e)})
                return self.send(200, {"ok": True})
            if p == "/api/photo/upload":
                return self.send(200, {"ok": True, "file": st.cap.photo_save(data.get("name"), data.get("data"), data.get("meta"))})
            if p == "/api/photo/delete":
                return self.send(200, {"ok": st.cap.photo_delete(data.get("f"))})
            if p == "/api/video/delete":
                return self.send(200, {"ok": st.cap.delete(data.get("f"))})
            if p == "/api/video/offset":
                return self.send(200, {"ok": st.cap.set_offset(data.get("f"), data.get("offset", 0))})
            if p == "/api/bindings":
                st.binds = data.get("binds", [])
                save_json(BINDS, st.binds)
                return self.send(200, {"ok": True})
            if p == "/api/demo" and st.demo:
                prof = next((x for x in st.all_profiles() if x["id"] == data.get("profile")), None)
                if prof:
                    game = "AC Rally" if "Rally" in (prof.get("games") or [""]) else "Le Mans Ultimate"
                    st.demo.set_car(prof["name"], game, data.get("maxRpm") or 8000)
                    st.assign["%s|%s" % (game, prof["name"])] = prof["id"]
                return self.send(200, {"ok": True})
            return self.send(404, {"error": "?"})

        def media(self, name, download=False, photo=False):
            from urllib.parse import unquote
            path = (st.cap.photo_path if photo else st.cap.safe)(unquote(name))
            if not path or not os.path.isfile(path):
                return self.send(404, {"error": "introuvable"})
            size = os.path.getsize(path)
            start, end, code = 0, size - 1, 200
            m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                else:
                    start = max(0, size - int(m.group(2)))
                end = min(end, size - 1)
                code = 206
            self.send_response(code)
            self.send_header("Content-Type", MIME.get(os.path.splitext(path)[1], "application/octet-stream"))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(end - start + 1))
            if code == 206:
                self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            if download:
                self.send_header("Content-Disposition", 'attachment; filename="%s"' % os.path.basename(path))
            self.cors()
            self.end_headers()
            try:
                with open(path, "rb") as f:
                    f.seek(start)
                    left = end - start + 1
                    while left > 0:
                        chunk = f.read(min(262144, left))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass

        def stream(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.cors()
            self.end_headers()
            try:
                while True:
                    with st.lock:
                        fr = st.frame
                    self.wfile.write(b"data: " + json.dumps(fr, separators=(",", ":")).encode() + b"\n\n")
                    self.wfile.flush()
                    time.sleep(1 / 30)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass

    return H


# jeux lancables depuis le stream deck : tous tes jeux Steam installes (detectes) + Content Manager
# + tes applis dans launchers.json : [{"id":"obs","name":"OBS","path":"C:/.../obs64.exe"}]
SIM_WORDS = ("assetto", "mans", "automobilista", "raceroom", "rally", "rfactor", "iracing", "beamng", "f1", "dirt", "wrc", "forza",
             "gran", "project cars", "kart", "race", "racing", "drift")
_LAUNCH_CACHE = {"t": 0, "list": []}


def steam_games():
    """Lit les bibliotheques Steam du PC (appmanifest_*.acf) -> [(appid, nom, dossier)]."""
    if sys.platform != "win32":
        return []
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam")
        steam = winreg.QueryValueEx(k, "SteamPath")[0]
    except Exception:
        steam = r"C:\Program Files (x86)\Steam"
    libs = [steam]
    try:
        with open(os.path.join(steam, "steamapps", "libraryfolders.vdf"), encoding="utf-8", errors="ignore") as f:
            libs += [x.replace("\\\\", "\\") for x in re.findall(r'"path"\s+"([^"]+)"', f.read())]
    except OSError:
        pass
    out, seen = [], set()
    for lib in libs:
        for acf in glob.glob(os.path.join(lib, "steamapps", "appmanifest_*.acf")):
            try:
                with open(acf, encoding="utf-8", errors="ignore") as f:
                    t = f.read()
                aid = re.search(r'"appid"\s+"(\d+)"', t).group(1)
                name = re.search(r'"name"\s+"([^"]+)"', t).group(1)
                idir = re.search(r'"installdir"\s+"([^"]+)"', t)
            except Exception:
                continue
            if aid in seen or aid == "228980" or re.search(r"redistributable|proton|runtime|steamworks", name, re.I):
                continue
            seen.add(aid)
            out.append((aid, name, os.path.join(lib, "steamapps", "common", idir.group(1)) if idir else ""))
    return out


def find_content_manager(ac_dir):
    home = os.path.expanduser("~")
    dirs = [ac_dir, os.path.join(home, "Desktop"), os.path.join(home, "Downloads"), os.path.join(home, "Documents"),
            os.path.join(home, "Documents", "Assetto Corsa"), os.path.join(os.environ.get("LOCALAPPDATA", ""), "AcTools Content Manager")]
    for d in dirs:
        if not d or not os.path.isdir(d):
            continue
        for pat in ("Content Manager*.exe", "*/Content Manager*.exe"):
            hit = glob.glob(os.path.join(d, pat))
            if hit:
                return hit[0]
    return None


def launchers():
    if time.time() - _LAUNCH_CACHE["t"] < 120:
        return _LAUNCH_CACHE["list"]
    out = []
    games = steam_games()
    games.sort(key=lambda g: (not any(w in g[1].lower() for w in SIM_WORDS), g[1].lower()))
    ac = next((g for g in games if g[0] == "244210"), None)
    cm = find_content_manager(ac[2] if ac else "")
    if cm:
        out.append({"id": "cm", "name": "Content Manager (AC)", "path": cm, "sim": True})
    for aid, name, _ in games:
        out.append({"id": "steam" + aid, "name": name, "path": "steam://rungameid/" + aid, "sim": any(w in name.lower() for w in SIM_WORDS)})
    extra = load_json(os.path.join(BASE, "launchers.json"), [])
    if isinstance(extra, list):
        out = [x for x in extra if isinstance(x, dict) and x.get("id") and x.get("path")] + out
    _LAUNCH_CACHE.update(t=time.time(), list=out)
    return out


def open_on_pc(what):
    """Ouvre la galerie Videos / Photos de RSIM sur l'ecran du PC."""
    page = {"videos": "videos.html", "photos": "photos.html", "telemetry": "telemetry.html"}.get(what)
    if page:
        open_app_window("http://localhost:%d/%s" % (PORT[0], page))
        return True
    return False


PORT = [8888]


def launch(lid):
    """Lance uniquement une entree de la liste ci-dessus (jamais une commande envoyee par le telephone)."""
    it = next((x for x in launchers() if x["id"] == lid), None)
    if not it:
        return False
    print("  > Lancement :", it["name"])
    if sys.platform == "win32":
        os.startfile(it["path"])
    return True


# anciennes button box (remplacees par une box par jeu, touches simples)
OLD_BB = {"bb_gt3": "bbg_acc", "bb_rally": "bbg_acr", "bb_proto": "bbg_lmu"}


def qv(q, k):
    return (q.get(k) or [""])[0]


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def open_app_window(url):
    """Ouvre RSIM dans sa propre fenetre (Edge ou Chrome en mode appli, sans barre de navigateur)."""
    if sys.platform == "win32":
        import subprocess
        pf = [os.environ.get(k, "") for k in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
        for exe in [os.path.join(b, r"Microsoft\Edge\Application\msedge.exe") for b in pf] + \
                   [os.path.join(b, r"Google\Chrome\Application\chrome.exe") for b in pf]:
            if exe and os.path.isfile(exe):
                prof = os.path.join(BASE, ".appwindow")      # profil separe = fenetre independante, taille memorisee
                subprocess.Popen([exe, "--app=" + url, "--user-data-dir=" + prof, "--window-size=1280,800"])
                return
    import webbrowser
    webbrowser.open(url)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8888)
    ap.add_argument("--demo", action="store_true", help="donnees simulees (sans jeu)")
    ap.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le panneau RSIM Dash")
    a = ap.parse_args()
    PORT[0] = a.port
    st = State(demo=a.demo)
    threading.Thread(target=source_loop, args=(st,), daemon=True).start()
    st.joy = inputs.JoyWatcher(st.on_button)
    st.joy.start()
    st.cap = capture.Capture(BASE, st.ring, lambda: st.frame)
    st.hk = hotkeys.Hotkeys(st.action)
    st.apply_hotkeys()
    if not st.cap.ffmpeg:
        print(" Video     : ffmpeg.exe absent (capture video desactivee, voir README)")
    srv = ThreadingHTTPServer(("0.0.0.0", a.port), make_handler(st))
    srv.daemon_threads = True
    ip = lan_ip()
    st.phone_url = "http://%s:%d" % (ip, a.port)
    print("=" * 52)
    print(" RSIM Dash %s" % ("(MODE DEMO)" if a.demo else ""))
    print(" Telephone : http://%s:%d" % (ip, a.port))
    print(" Panneau   : http://localhost:%d/hub" % a.port)
    print(" En attente d'un jeu (AC/ACC/AC Rally, LMU, AMS2, RaceRoom)...")
    print("=" * 52)
    if not a.no_browser:
        threading.Timer(1.0, open_app_window, args=("http://localhost:%d/index.html" % a.port,)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        st.cap.shutdown()


if __name__ == "__main__":
    main()
