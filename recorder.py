"""RSIM - enregistrement de la telemetrie.
- LapRecorder : decoupe automatiquement chaque tour (20 Hz) et le range par session
  (jeu + voiture + piste) dans le dossier telemetry/. Sert a comparer les tours.
- Ring : garde les 5 dernieres minutes de telemetrie (30 Hz) pour les videos / replays.
"""
import json
import os
import re
import threading
import time
from collections import deque

LAP_HZ = 20
RING_HZ = 30
OVERLAY_KEYS = ("gear", "rpm", "maxRpm", "speed", "throttle", "brake", "clutch", "steer", "lap", "pos", "cur", "last",
                "best", "delta", "fuel", "fuelLaps", "tc", "abs", "bb", "tyreT", "lapPct", "limiter", "absActive", "tcActive")
CH = ("t", "x", "d", "spd", "thr", "brk", "clu", "str", "gear", "rpm")


def slug(s):
    s = re.sub(r"[^A-Za-z0-9]+", "-", s or "").strip("-")
    return s[:40] or "x"


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def r(v, n=2):
    return None if v is None else round(float(v), n)


class Ring:
    def __init__(self, seconds=300):
        self.buf = deque(maxlen=RING_HZ * seconds)
        self.last = 0.0
        self.lock = threading.Lock()

    def feed(self, d, now):
        if now - self.last < 1.0 / RING_HZ - 0.002:
            return
        self.last = now
        f = {k: d.get(k) for k in OVERLAY_KEYS}
        with self.lock:
            self.buf.append((now, f))

    def window(self, t0, t1):
        """Echantillons entre t0 et t1 (heure murale) -> [[t relatif, frame], ...]"""
        with self.lock:
            return [[round(w - t0, 3), f] for w, f in self.buf if t0 <= w <= t1]


class LapRecorder:
    def __init__(self, folder):
        self.folder = folder
        os.makedirs(folder, exist_ok=True)
        self.lock = threading.Lock()
        self.sess = None            # dict session en cours
        self.key = None
        self.last_seen = 0
        self.reset_lap()

    # ------------------------------------------------------------ enregistrement
    def reset_lap(self):
        self.buf = {k: [] for k in CH}
        self.lap_no = None
        self.prev_cur = None
        self.dist = 0.0
        self.t_wall = None
        self.last_sample = 0
        self.pit = False
        self.start_ok = False

    def feed(self, d, now):
        if d.get("paused"):
            return
        key = (d.get("game"), d.get("car"), d.get("track"))
        with self.lock:
            if key != self.key or now - self.last_seen > 900:
                self.new_session(key, now)
            self.last_seen = now
            cur, lap = d.get("cur"), d.get("lap")
            wrapped = self.lap_no is not None and lap != self.lap_no
            if self.prev_cur is not None and cur is not None and self.prev_cur - cur > 5:
                wrapped = True
            if wrapped:
                self.finish_lap(d)
                self.reset_lap()
            if self.lap_no is None:
                self.lap_no = lap
                self.start_ok = (cur is not None and cur < 1.5) or (d.get("lapPct") is not None and d["lapPct"] < 0.02)
            # distance parcourue (integration de la vitesse)
            if self.t_wall is not None:
                self.dist += max(0.0, d.get("speed") or 0) / 3.6 * min(0.2, now - self.t_wall)
            self.t_wall = now
            if d.get("inPit"):
                self.pit = True
            if cur is not None:
                self.prev_cur = cur
            if now - self.last_sample >= 1.0 / LAP_HZ - 0.002:
                self.last_sample = now
                b = self.buf
                b["t"].append(r(cur if cur is not None else (b["t"][-1] + 1.0 / LAP_HZ if b["t"] else 0), 3))
                b["x"].append(r(d.get("lapPct"), 5))
                b["d"].append(r(self.dist, 1))
                b["spd"].append(r(d.get("speed"), 1))
                b["thr"].append(r(d.get("throttle"), 3))
                b["brk"].append(r(d.get("brake"), 3))
                b["clu"].append(r(d.get("clutch"), 3))
                b["str"].append(r(d.get("steer"), 3))
                b["gear"].append(d.get("gear"))
                b["rpm"].append(int(d.get("rpm") or 0))

    def finish_lap(self, d):
        b = self.buf
        if not self.start_ok or len(b["t"]) < 40 or not self.sess:
            return
        lap_time = self.prev_cur
        last = d.get("last")
        if last and (lap_time is None or abs(last - lap_time) < 1.0):
            lap_time = last
        if not lap_time or lap_time < 10:
            return
        # abscisse : % du tour donne par le jeu, sinon distance / distance totale
        if any(v is None for v in b["x"]):
            tot = b["d"][-1] or 1
            b["x"] = [r(v / tot, 5) for v in b["d"]]
        n = len(self.sess["laps"]) + 1
        fn = "lap_%03d.json" % n
        lap = {"n": n, "gameLap": self.lap_no, "time": round(lap_time, 3), "pit": self.pit, "valid": not self.pit,
               "len": round(b["d"][-1]), "file": fn, "at": int(time.time())}
        save_json(os.path.join(self.folder, self.sess["id"], fn), dict(lap, game=self.sess["game"], car=self.sess["car"],
                                                                       track=self.sess["track"], ch=b))
        self.sess["laps"].append(lap)
        valid = [l["time"] for l in self.sess["laps"] if l["valid"]]
        self.sess["best"] = min(valid) if valid else None
        save_json(os.path.join(self.folder, self.sess["id"], "session.json"), self.sess)
        print("  > Tour enregistre : %s  %s" % (fmt(lap_time), self.sess["car"]))

    def new_session(self, key, now):
        self.reset_lap()
        self.key = key
        game, car, track = key
        sid = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + "_" + slug(car)
        self.sess = {"id": sid, "game": game, "car": car, "track": track or "", "start": int(now), "laps": [], "best": None}
        os.makedirs(os.path.join(self.folder, sid), exist_ok=True)

    def idle(self):
        with self.lock:
            self.reset_lap()

    # ------------------------------------------------------------ lecture
    def sessions(self):
        out = []
        for sid in sorted(os.listdir(self.folder), reverse=True):
            s = load_json(os.path.join(self.folder, sid, "session.json"))
            if s and s.get("laps"):
                out.append(s)
        return out

    def lap(self, sid, fn):
        if "/" in sid or "\\" in sid or ".." in sid or not re.match(r"^lap_\d+\.json$", fn or ""):
            return None
        return load_json(os.path.join(self.folder, sid, fn))

    def delete(self, sid, fn=None):
        if not sid or "/" in sid or "\\" in sid or ".." in sid:
            return False
        path = os.path.join(self.folder, sid)
        s = load_json(os.path.join(path, "session.json"))
        if not s:
            return False
        if fn:
            s["laps"] = [l for l in s["laps"] if l["file"] != fn]
            try:
                os.remove(os.path.join(path, fn))
            except OSError:
                pass
            if s["laps"]:
                valid = [l["time"] for l in s["laps"] if l["valid"]]
                s["best"] = min(valid) if valid else None
                save_json(os.path.join(path, "session.json"), s)
                return True
        for f in os.listdir(path):
            os.remove(os.path.join(path, f))
        os.rmdir(path)
        with self.lock:
            if self.sess and self.sess["id"] == sid:
                self.sess, self.key = None, None
        return True

    def import_lap(self, lap, owner):
        """Tour partage par quelqu'un d'autre (fichier .json exporte depuis RSIM)."""
        if not isinstance(lap, dict) or "ch" not in lap or "time" not in lap:
            return None
        sid = "import_" + slug(owner or "ami") + "_" + slug(lap.get("car"))
        path = os.path.join(self.folder, sid)
        os.makedirs(path, exist_ok=True)
        s = load_json(os.path.join(path, "session.json")) or {"id": sid, "game": lap.get("game", ""), "car": lap.get("car", ""),
                                                             "track": lap.get("track", ""), "start": int(time.time()), "laps": [],
                                                             "best": None, "owner": owner or "importé"}
        n = len(s["laps"]) + 1
        fn = "lap_%03d.json" % n
        meta = {"n": n, "time": lap["time"], "pit": False, "valid": True, "len": lap.get("len"), "file": fn,
                "at": int(time.time()), "track": lap.get("track", "")}
        save_json(os.path.join(path, fn), dict(lap, **{k: meta[k] for k in ("n", "file")}))
        s["laps"].append(meta)
        s["best"] = min(l["time"] for l in s["laps"])
        save_json(os.path.join(path, "session.json"), s)
        return sid


def fmt(t):
    m = int(t // 60)
    return "%d:%06.3f" % (m, t - m * 60)
