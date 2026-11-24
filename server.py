"""RSIM Dash - serveur. Lance :  python server.py   (ou  python server.py --demo)

Telephone : http://<IP du PC>:8888        Page admin (sur le PC) : http://localhost:8888/admin
"""
import argparse
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

BASE = os.path.dirname(os.path.abspath(sys.argv[0] if getattr(sys, "frozen", False) else __file__))
WEB = os.path.join(BASE, "web")
CARS = os.path.join(BASE, "cars.json")
ASSIGN = os.path.join(BASE, "assignments.json")
SEEN = os.path.join(BASE, "seen_cars.json")
DASH_DIR = os.path.join(BASE, "dashboards")
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
        self.ui = {"page": 0, "override": None, "lastProfile": None}
        self.binds = load_json(BINDS, [])            # [{dev, btn, action, devName}]
        self.dash_rev = 0
        self.joy = None
        self.phone_url = ""
        os.makedirs(DASH_DIR, exist_ok=True)
        self.dashes = {}
        self.load_dashes()

    # ---- dashboards personnalises (dossier dashboards/)
    def load_dashes(self):
        self.dashes = {}
        for fn in sorted(os.listdir(DASH_DIR)):
            if fn.endswith(".json"):
                dsh = load_json(os.path.join(DASH_DIR, fn), None)
                if dsh and dsh.get("id"):
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
        self.dashes.pop(did, None)
        self.dash_rev += 1

    def all_profiles(self):
        prof = list(self.cars.get("profiles", []))
        for dsh in self.dashes.values():
            prof.append({"id": "custom:" + dsh["id"], "name": "★ " + dsh.get("name", dsh["id"]), "family": "custom", "games": [], "match": dsh.get("match", [])})
        return prof

    def pages_of(self, profile):
        if profile and profile.startswith("custom:"):
            dsh = self.dashes.get(profile[7:])
            return max(1, len(dsh.get("pages", []))) if dsh else 1
        return 1

    # ---- actions (boutons du volant / boutons du telephone)
    def action(self, act):
        act = (act or "").strip()
        cur = self.frame.get("profile") if self.frame.get("connected") else self.ui["lastProfile"]
        ids = [x["id"] for x in self.all_profiles()]
        if act == "page_next":
            self.ui["page"] = (self.ui["page"] + 1) % self.pages_of(cur)
        elif act == "page_prev":
            self.ui["page"] = (self.ui["page"] - 1) % self.pages_of(cur)
        elif act in ("dash_next", "dash_prev") and ids:
            i = ids.index(cur) if cur in ids else 0
            self.ui["override"] = ids[(i + (1 if act == "dash_next" else -1)) % len(ids)]
            self.ui["page"] = 0
        elif act == "dash_auto":
            self.ui["override"], self.ui["page"] = None, 0
        elif act.startswith("dash:"):
            self.ui["override"], self.ui["page"] = act[5:], 0
        elif act.startswith("page:"):
            self.ui["page"] = max(0, int(act[5:]) - 1) % self.pages_of(cur)
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

    def on_button(self, dev, btn):
        for b in self.binds:
            if int(b.get("dev", -1)) == dev and int(b.get("btn", -1)) == btn:
                self.action(b.get("action"))

    # ---- choix du dashboard
    def resolve(self, game, car, cls):
        key = "%s|%s" % (game, car)
        if key in self.assign:
            return self.assign[key], "manuel"
        hay = (car + " " + cls).lower()
        for p in self.all_profiles():
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
        if d is None:
            with self.lock:
                self.frame = {"connected": False}
            return
        prof, how = self.resolve(d["game"], d["car"], d["carClass"])
        if self.ui["override"]:
            prof, how = self.ui["override"], "bouton"
        if prof != self.ui["lastProfile"]:
            self.ui["page"], self.ui["lastProfile"] = 0, prof
        d["fuelPerLap"] = self.fuel_avg(d)
        d["fuelLaps"] = d["fuel"] / d["fuelPerLap"] if d["fuelPerLap"] > 0 else None
        d.update(connected=True, profile=prof, how=how, ts=time.time(), page=self.ui["page"], dashRev=self.dash_rev)
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
        ".woff2": "font/woff2", ".webmanifest": "application/manifest+json"}


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
            # l'appli RSIM peut etre servie ailleurs (Netlify, APK) : on autorise les appels vers l'agent
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
            if p == "/editor":
                return self.static("editor.html")
            if p == "/api/dashboards":
                return self.send(200, [{"id": k, "name": v.get("name", k), "pages": len(v.get("pages", []))} for k, v in st.dashes.items()])
            if p == "/api/dashboard":
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
            return self.static(p.lstrip("/"))

        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
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
            if p == "/api/dashboard/delete":
                st.delete_dash(data.get("id", ""))
                return self.send(200, {"ok": True})
            if p == "/api/action":
                try:
                    ok = st.action(data.get("action"))
                except Exception as e:
                    return self.send(400, {"error": str(e)})
                return self.send(200, {"ok": ok, "page": st.ui["page"], "override": st.ui["override"]})
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


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8888)
    ap.add_argument("--demo", action="store_true", help="donnees simulees (sans jeu)")
    ap.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le panneau RSIM Dash")
    a = ap.parse_args()
    st = State(demo=a.demo)
    threading.Thread(target=source_loop, args=(st,), daemon=True).start()
    st.joy = inputs.JoyWatcher(st.on_button)
    st.joy.start()
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
        import webbrowser
        threading.Timer(1.0, lambda: webbrowser.open("http://localhost:%d/hub" % a.port)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
