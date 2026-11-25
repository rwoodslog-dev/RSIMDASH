"""RSIM - profils FFB : un profil = un volant (marque / modele) + un jeu.
- Tous les volants : chaque marque a ses propres reglages (Moza Pit House, Fanatec, Logitech, Thrustmaster,
  Simucube, Simagic, Cammus, Asetek, VRS, PXN...).
- Enregistrement automatique : pendant que tu roules, RSIM relit les fichiers de reglages du jeu (et de Pit House
  pour Moza). Des que tu changes un reglage FFB dans le jeu, le profil "auto" (jeu + volant) est mis a jour.
- Partage : export / import en .json (le volant est indique : un ami avec le meme volant peut l'appliquer tel quel).
Stockage : ffb_profiles.json a cote de server.py."""
import glob
import json
import os
import re
import time

# ------------------------------------------------------------------ volants
def F(key, label, unit, mn, mx, step=1):
    return [key, label, unit, mn, mx, step]

WHEELS = {
    "Moza": {"soft": "MOZA Pit House", "vid": [0x346E], "fields": [
        F("angle", "Angle de rotation", "°", 90, 2700, 10), F("gameFfb", "Intensité FFB du jeu", "%", 0, 100), F("maxTorque", "Couple max (limite)", "%", 0, 100),
        F("roadSens", "Sensibilité route", "", 0, 10), F("damper", "Amortissement naturel", "%", 0, 100), F("friction", "Friction naturelle", "%", 0, 100),
        F("inertia", "Inertie naturelle", "%", 100, 500, 5), F("speedDamp", "Amortissement selon vitesse", "%", 0, 100), F("spring", "Ressort", "%", 0, 100),
        F("maxSpeed", "Vitesse max du volant", "%", 0, 100)], "eq": ["10 Hz", "15 Hz", "25 Hz", "40 Hz", "60 Hz", "100 Hz"]},
    "Fanatec": {"soft": "Menu volant / FanaLab", "vid": [0x0EB7], "fields": [
        F("SEN", "SEN (angle)", "°", 90, 2520, 10), F("FF", "FF (force)", "%", 0, 100), F("NDP", "NDP (amorti naturel)", "", 0, 100),
        F("NFR", "NFR (friction naturelle)", "", 0, 100), F("NIN", "NIN (inertie naturelle)", "", 0, 100), F("INT", "INT (filtre)", "", 0, 20),
        F("FEI", "FEI (intensité effets)", "", 0, 100), F("FOR", "FOR (force)", "%", 0, 120), F("SPR", "SPR (ressort)", "%", 0, 120),
        F("DPR", "DPR (amortisseur)", "%", 0, 120), F("BLI", "BLI (frein)", "", 0, 101), F("SHO", "SHO (vibrations)", "%", 0, 100)]},
    "Logitech": {"soft": "Logitech G HUB", "vid": [0x046D], "fields": [
        F("angle", "Angle de rotation", "°", 40, 1080, 10), F("sens", "Sensibilité", "", 0, 100), F("ffb", "Intensité retour de force", "%", 0, 100),
        F("trueforce", "TRUEFORCE", "%", 0, 100), F("centering", "Ressort de centrage", "%", 0, 100)]},
    "Thrustmaster": {"soft": "Panneau Thrustmaster", "vid": [0x044F], "fields": [
        F("angle", "Rotation", "°", 40, 1080, 10), F("gain", "Gain global", "%", 0, 100), F("constant", "Constant", "%", 0, 100),
        F("periodic", "Periodic", "%", 0, 100), F("spring", "Spring", "%", 0, 100), F("damper", "Damper", "%", 0, 100),
        F("autocenter", "Auto-centrage", "%", 0, 100)]},
    "Simucube": {"soft": "Simucube True Drive / Tuner", "vid": [0x16D0], "fields": [
        F("angle", "Angle", "°", 90, 2700, 10), F("maxNm", "Force max", "Nm", 1, 32), F("strength", "Force globale", "%", 0, 100),
        F("recon", "Filtre de reconstruction", "", 0, 15), F("damping", "Amortissement", "%", 0, 100), F("friction", "Friction", "%", 0, 100),
        F("inertia", "Inertie", "%", 0, 100), F("staticRed", "Réduction force statique", "%", 0, 100), F("slew", "Slew rate", "", 0, 100)]},
    "Simagic": {"soft": "SimPro Manager", "vid": [0x3670, 0x0483], "fields": [
        F("angle", "Angle", "°", 90, 2520, 10), F("maxTorque", "Couple max", "%", 0, 100), F("gameFfb", "Intensité FFB jeu", "%", 0, 100),
        F("damper", "Amortissement", "%", 0, 100), F("friction", "Friction", "%", 0, 100), F("inertia", "Inertie", "%", 0, 100),
        F("filter", "Lissage", "", 0, 100), F("detail", "Détail FFB", "", 0, 100)]},
    "Cammus": {"soft": "Logiciel Cammus", "vid": [0x3416], "fields": []},
    "Asetek": {"soft": "RaceHub", "vid": [0x2433], "fields": []},
    "VRS": {"soft": "VRS DirectForce", "vid": [], "fields": []},
    "PXN": {"soft": "Logiciel PXN", "vid": [0x11FF], "fields": []},
    "Autre": {"soft": "Logiciel du volant", "vid": [], "fields": []},
}
GENERIC = [F("angle", "Angle", "°", 90, 2700, 10), F("gain", "Force / gain", "%", 0, 100), F("damper", "Amortissement", "%", 0, 100),
           F("friction", "Friction", "%", 0, 100), F("inertia", "Inertie", "%", 0, 100), F("filter", "Filtre / lissage", "", 0, 100)]
for w in WHEELS.values():
    if not w["fields"]:
        w["fields"] = GENERIC


def detect_wheel(devices):
    """devices = [(index, 'Nom (VID xxxx PID yyyy)', boutons)] -> (marque, modele). Une base FFB passe avant un G29 utilise en box."""
    found = []
    for _, name, _ in devices or []:
        m = re.search(r"VID ([0-9A-F]{4})", name)
        vid = int(m.group(1), 16) if m else None
        nm = re.sub(r"\s*\(VID.*\)", "", name).strip()
        for brand, w in WHEELS.items():
            if brand.lower() in nm.lower() or (vid and vid in w["vid"]):
                found.append((brand, re.sub(re.escape(brand), "", nm, flags=re.I).strip(" -_") or nm))
                break
    found.sort(key=lambda b: b[0] == "Logitech")
    return found[0] if found else (None, None)


# ------------------------------------------------------------------ jeux : reglages par defaut + fichiers de config
GAME_FIELDS = {
    "Le Mans Ultimate": [["Force FFB", "55 %"], ["Lissage FFB", "0"], ["Couple minimum", "0 %"], ["Rotation volant", "Auto"]],
    "ACC": [["Gain", "65 %"], ["Force min.", "0 %"], ["Amortissement dynamique", "100 %"], ["Effets de route", "5 %"], ["Fréquence", "333 Hz"]],
    "AC Rally": [["Force FFB", "70 %"], ["Amortissement", "20 %"], ["Effets de route", "40 %"]],
    "Assetto Corsa": [["Gain", "80 %"], ["Filtre", "0 %"], ["Force min.", "0 %"], ["Vibreurs", "20 %"]],
    "Automobilista 2": [["Profil FFB", "Custom"], ["Gain", "60"], ["Volume", "60"], ["Tone", "50"], ["FX", "40"]],
    "RaceRoom": [["Multiplicateur FFB", "80 %"], ["Force min.", "0 %"]],
}
FFB_KEY = re.compile(r"ffb|force|feedback|gain|damp|torque|filter|smooth|spring|effect|road|kerb|curb|slip|rumble|vibra|"
                     r"min.?force|frequency|gamma|linear|steer.?(lock|ratio|rot)|rotation|angle|inertia|friction|intensity|soft.?lock|centering|tone|volume|fx", re.I)


def game_key(game):
    g = (game or "").lower()
    if "rally" in g:
        return "AC Rally"
    if "acc" in g or "competizione" in g:
        return "ACC"
    if "mans" in g:
        return "Le Mans Ultimate"
    if "automobilista" in g:
        return "Automobilista 2"
    if "raceroom" in g or "r3e" in g:
        return "RaceRoom"
    if "assetto" in g:
        return "Assetto Corsa"
    return game or ""


def _docs():
    h = os.path.expanduser("~")
    return [d for d in (os.path.join(h, "Documents"), os.path.join(h, "OneDrive", "Documents"), os.path.join(h, "OneDrive", "Documenti")) if os.path.isdir(d)]


def config_files(game, steam_dirs):
    """Fichiers ou le jeu range ses reglages de volant / FFB."""
    g, pats = game_key(game), []
    for d in _docs():
        if g == "Assetto Corsa":
            pats += [os.path.join(d, "Assetto Corsa", "cfg", "controls.ini"), os.path.join(d, "Assetto Corsa", "cfg", "ff_post_process.ini")]
        elif g == "ACC":
            pats += [os.path.join(d, "Assetto Corsa Competizione", "Config", "controls.json")]
        elif g == "Automobilista 2":
            pats += [os.path.join(d, "Automobilista 2", "*.xml"), os.path.join(d, "Automobilista 2", "*", "*.xml")]
        elif g == "RaceRoom":
            pats += [os.path.join(d, "My Games", "SimBin", "RaceRoom Racing Experience", "UserData", "*.xml"),
                     os.path.join(d, "My Games", "SimBin", "RaceRoom Racing Experience", "UserData", "*", "*.xml")]
        elif g == "AC Rally":
            pats += [os.path.join(d, "Assetto Corsa Rally", "**", "*.ini"), os.path.join(d, "Assetto Corsa Rally", "**", "*.json")]
    la = os.environ.get("LOCALAPPDATA", "")
    if g == "AC Rally" and la:
        pats += [os.path.join(la, "acr", "Saved", "Config", "*", "*.ini"), os.path.join(la, "AssettoCorsaRally", "Saved", "Config", "*", "*.ini")]
    for sd in steam_dirs.get(g, []):
        if g == "Le Mans Ultimate":
            pats += [os.path.join(sd, "UserData", "player", "*.JSON"), os.path.join(sd, "UserData", "Controller", "*.json")]
        elif g == "AC Rally":
            pats += [os.path.join(sd, "**", "Saved", "Config", "*", "*.ini")]
    out = []
    for p in pats:
        out += [f for f in glob.glob(p, recursive=True) if os.path.isfile(f) and os.path.getsize(f) < 600000]
    return list(dict.fromkeys(out))[:25]


def extract(path):
    """Releve les reglages FFB d'un fichier .json / .ini / .xml -> [(cle, valeur)]."""
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            txt = f.read()
    except OSError:
        return []
    out = []
    if path.lower().endswith(".json"):
        try:
            def walk(o, pre=""):
                if isinstance(o, dict):
                    for k, v in o.items():
                        walk(v, pre + "." + k if pre else k)
                elif isinstance(o, (int, float, bool)) and FFB_KEY.search(pre):
                    out.append((pre, o))
            walk(json.loads(txt))
        except Exception:
            pass
    else:
        sec = ""
        for line in txt.splitlines():
            s = line.strip()
            m = re.match(r"^\[(.+)\]$", s)
            if m:
                sec = m.group(1) + "."
                continue
            m = re.match(r"^([\w .\-/]+?)\s*=\s*([-\d.]+|true|false)\s*$", s, re.I)
            if m and FFB_KEY.search(sec + m.group(1)):
                out.append((sec + m.group(1), m.group(2)))
        for m in re.finditer(r'<(\w+)[^>]*?\b(?:name|id)="([^"]+)"[^>]*?\bvalue="([-\d.]+|true|false)"', txt, re.I):
            if FFB_KEY.search(m.group(2)):
                out.append((m.group(2), m.group(3)))
    return out[:60]


def moza_snapshot():
    """Reglages actuels de Pit House (fichiers les plus recents)."""
    roots = [os.path.join(d, "MOZA Pit House") for d in _docs()] + \
            [os.path.join(os.environ.get(k, ""), "MOZA Pit House") for k in ("LOCALAPPDATA", "APPDATA")]
    files = []
    for r in roots:
        if os.path.isdir(r):
            files += [f for f in glob.glob(os.path.join(r, "**", "*.json"), recursive=True) if os.path.getsize(f) < 600000]
    files.sort(key=os.path.getmtime, reverse=True)
    vals = []
    for f in files[:3]:
        vals += [(k, v) for k, v in extract(f)]
    base = {}
    MAP = [("angle", r"angle|rotation"), ("maxTorque", r"max\w*torque|torque.?limit|output.?torque"),
           ("gameFfb", r"game.?(force|ffb)|ffb.?(strength|intensity)|game.?intensity"), ("roadSens", r"road"),
           ("speedDamp", r"speed.?damp"), ("damper", r"damp"), ("friction", r"friction"), ("inertia", r"inertia"),
           ("spring", r"spring"), ("maxSpeed", r"max.?(wheel)?.?speed")]
    for k, v in vals:
        for key, rx in MAP:
            if key not in base and re.search(rx, k, re.I):
                try:
                    n = float(v)
                except (TypeError, ValueError):
                    continue
                if key not in ("angle", "inertia", "roadSens") and 0 < n <= 1:
                    n *= 100
                base[key] = round(n)
                break
    return base, [[k, v] for k, v in vals][:40], files[:3]


# ------------------------------------------------------------------ stockage
LINEAR = [0, 25, 50, 75, 100]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")[:40]


def new_profile(pid, name, game, brand, model="", base=None, match=None, notes=""):
    b = {f[0]: f[3] for f in WHEELS.get(brand, WHEELS["Autre"])["fields"]}
    b.update(base or {})
    return {"id": pid, "name": name, "game": game, "wheel": {"brand": brand, "model": model}, "match": match or [], "base": b,
            "eq": [100] * 6, "game_settings": [list(x) for x in GAME_FIELDS.get(game, [])],
            "pedals": {"throttle": list(LINEAR), "brake": [0, 20, 44, 70, 100], "clutch": list(LINEAR)},
            "notes": notes, "auto": False, "updated": int(time.time())}


DEFAULTS = [
    new_profile("lmu_gt3", "LMU · GT3", "Le Mans Ultimate", "Moza", "R12", {"angle": 1080, "gameFfb": 100, "maxTorque": 80, "roadSens": 6,
                "damper": 10, "friction": 5, "inertia": 120, "maxSpeed": 100}, ["gt3", "lmgt3"]),
    new_profile("acc_gt3", "ACC · GT3", "ACC", "Moza", "R12", {"angle": 900, "gameFfb": 100, "maxTorque": 80, "roadSens": 5,
                "damper": 10, "friction": 5, "inertia": 120, "maxSpeed": 100}, ["gt3", "gt4"]),
    new_profile("acr_rally", "AC Rally · Rallye", "AC Rally", "Moza", "R12", {"angle": 540, "gameFfb": 100, "maxTorque": 90, "roadSens": 9,
                "damper": 8, "friction": 3, "inertia": 110, "maxSpeed": 100}),
]


class FFBStore:
    def __init__(self, path, steam_dirs=lambda: {}):
        self.path = path
        self.steam_dirs = steam_dirs
        self.wheel_override = None
        self.last_scan = 0
        self.status = {}
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):          # ancien format
                data = {"profiles": data}
            self.profiles = data.get("profiles", [])
            self.wheel_override = data.get("wheel")
        except Exception:
            self.profiles = [dict(p) for p in DEFAULTS]
        for p in self.profiles:                 # anciens profils : volant Moza R12
            p.setdefault("wheel", {"brand": "Moza", "model": "R12"})
            p["game"] = game_key(p.get("game")) or p.get("game", "")
        self.save()

    def save(self):
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"wheel": self.wheel_override, "profiles": self.profiles}, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.path)

    def put(self, p):
        if not isinstance(p, dict) or not p.get("name"):
            return None
        p["id"] = re.sub(r"[^a-zA-Z0-9_-]", "_", p.get("id") or "ffb_%d" % int(time.time() * 1000))
        p["updated"] = int(time.time())
        p.setdefault("wheel", {"brand": "Autre", "model": ""})
        self.profiles = [x for x in self.profiles if x["id"] != p["id"]] + [p]
        self.save()
        return p["id"]

    def delete(self, pid):
        self.profiles = [x for x in self.profiles if x["id"] != pid]
        self.save()

    def wheel(self, devices):
        if self.wheel_override and self.wheel_override.get("brand"):
            return self.wheel_override.get("brand"), self.wheel_override.get("model", "")
        return detect_wheel(devices)

    def match(self, game, car, cls="", brand=None):
        g = game_key(game)
        if not g:
            return None
        same = [p for p in self.profiles if p.get("game") == g and (not brand or p["wheel"].get("brand") == brand)] or \
               [p for p in self.profiles if p.get("game") == g]
        hay = ("%s %s" % (car, cls)).lower()
        for p in same:
            if any(m and m.lower() in hay for m in p.get("match", [])):
                return p
        auto = [p for p in same if p.get("auto")]
        return (auto or same or [None])[0]

    # ---------------- enregistrement automatique (appele toutes les ~10 s pendant que tu roules)
    def autocapture(self, game, devices, force=False):
        if not game or (not force and time.time() - self.last_scan < 10):
            return None
        self.last_scan = time.time()
        g = game_key(game)
        brand, model = self.wheel(devices)
        brand = brand or "Autre"
        files = config_files(g, self.steam_dirs())
        gs = []
        for f in files:
            short = os.path.basename(f)
            gs += [[("%s · %s" % (short, k)) if len(files) > 1 else k, str(v)] for k, v in extract(f)]
        base, raw, wfiles = (moza_snapshot() if brand == "Moza" else ({}, [], []))
        self.status = {"game": g, "brand": brand, "model": model, "files": files, "wheelFiles": wfiles, "found": len(gs), "at": int(time.time())}
        if not gs and not base:
            return None
        pid = "auto_%s_%s" % (slug(g), slug(brand))
        cur = next((p for p in self.profiles if p["id"] == pid), None)
        if cur is None:
            cur = new_profile(pid, "%s · %s (auto)" % (g, (brand + " " + (model or "")).strip()), g, brand, model)
            cur["auto"] = True
            cur["notes"] = "Profil enregistré automatiquement par RSIM pendant que tu roules : il suit tes réglages FFB du jeu."
            self.profiles.append(cur)
        changed = False
        if gs and gs != cur.get("game_settings"):
            cur["game_settings"] = gs
            changed = True
        if base:
            nb = dict(cur.get("base", {}), **base)
            if nb != cur.get("base"):
                cur["base"] = nb
                changed = True
        if raw and raw != cur.get("wheel_raw"):
            cur["wheel_raw"] = raw
            changed = True
        cur["wheel"] = {"brand": brand, "model": model or cur["wheel"].get("model", "")}
        cur["sources"] = files + wfiles
        if changed:
            cur["updated"] = cur["captured"] = int(time.time())
            print("  > Profil FFB mis a jour automatiquement :", cur["name"])
        self.save()
        return cur

    def meta(self, devices):
        b, m = self.wheel(devices)
        det = detect_wheel(devices)
        return {"wheels": {k: {"soft": v["soft"], "fields": v["fields"], "eq": v.get("eq")} for k, v in WHEELS.items()},
                "gameFields": GAME_FIELDS, "games": list(GAME_FIELDS), "wheel": {"brand": b, "model": m},
                "detected": {"brand": det[0], "model": det[1]}, "override": self.wheel_override, "status": self.status,
                "devices": [d[1] for d in devices or []]}
