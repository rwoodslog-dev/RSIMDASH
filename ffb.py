"""RSIM - profils FFB (base Moza R12 + reglages en jeu + courbes de pedales).
Stockage : ffb_profiles.json (a cote de server.py). Les valeurs fournies sont des points de depart a ajuster.
Moza Pit House n'a pas d'API publique : RSIM affiche le bon profil, tu recopies les valeurs (ou tu les gardes
en preset Pit House du meme nom)."""
import json
import os
import re
import time

BASE_FIELDS = [  # cle, libelle, unite, min, max, pas
    ["angle", "Angle de rotation", "°", 180, 2700, 10],
    ["gameFfb", "Intensité FFB du jeu", "%", 0, 100, 1],
    ["maxTorque", "Couple max (limite)", "%", 0, 100, 1],
    ["roadSens", "Sensibilité route", "", 0, 10, 1],
    ["damper", "Amortissement naturel", "%", 0, 100, 1],
    ["friction", "Friction naturelle", "%", 0, 100, 1],
    ["inertia", "Inertie naturelle", "%", 100, 500, 5],
    ["speedDamp", "Amortissement selon vitesse", "%", 0, 100, 1],
    ["spring", "Ressort (centrage)", "%", 0, 100, 1],
    ["maxSpeed", "Vitesse max du volant", "%", 0, 100, 1],
]
EQ_BANDS = ["10 Hz", "15 Hz", "25 Hz", "40 Hz", "60 Hz", "100 Hz"]

GAME_FIELDS = {
    "Le Mans Ultimate": [["Force FFB (Force Feedback strength)", "55 %"], ["Lissage FFB (smoothing)", "0"],
                         ["Couple minimum (minimum torque)", "0 %"], ["Rotation volant", "Auto (selon la voiture)"],
                         ["Effets bordures / vibreurs", "50 %"]],
    "ACC": [["Gain", "65 %"], ["Force min.", "0 %"], ["Amortissement dynamique", "100 %"], ["Effets de route", "5 %"],
            ["Fréquence", "333 Hz"], ["Rotation", "Auto (jeu) - Pit House 900°"], ["Linéarité direction", "1.0"],
            ["Gamma frein", "2.4"]],
    "AC Rally": [["Force FFB", "70 %"], ["Amortissement", "20 %"], ["Effets de route", "40 %"],
                 ["Filtre / lissage", "0"], ["Rotation", "Auto (jeu)"]],
    "Assetto Corsa": [["Gain", "80 %"], ["Filtre", "0 %"], ["Force min.", "0 %"], ["Vibreurs", "20 %"],
                      ["Effets de route", "0 %"], ["Glisse", "0 %"], ["Amortissement", "0 %"]],
    "Automobilista 2": [["Profil FFB", "Custom"], ["Gain", "60"], ["Volume", "60"], ["Tone", "50"], ["FX", "40"],
                        ["Ressort", "0"], ["Zone morte (deadzone removal)", "0"]],
    "RaceRoom": [["Multiplicateur FFB", "80 %"], ["Force min.", "0 %"], ["Vibration", "0 %"],
                 ["Rotation", "Auto (Pit House 1080°)"]],
}
LINEAR = [0, 25, 50, 75, 100]


def profile(pid, name, game, match, base, eq=None, pedals=None, notes=""):
    b = {"angle": 900, "gameFfb": 100, "maxTorque": 85, "roadSens": 7, "damper": 10, "friction": 5, "inertia": 120,
         "speedDamp": 0, "spring": 0, "maxSpeed": 100}
    b.update(base)
    return {"id": pid, "name": name, "game": game, "match": match, "base": b, "eq": eq or [100] * 6,
            "game_settings": [list(x) for x in GAME_FIELDS.get(game, [])],
            "pedals": pedals or {"throttle": list(LINEAR), "brake": [0, 20, 44, 70, 100], "clutch": list(LINEAR)},
            "notes": notes, "updated": int(time.time())}


DEFAULTS = [
    profile("lmu_gt3", "LMU · GT3", "Le Mans Ultimate", ["gt3", "lmgt3"], {"angle": 1080, "maxTorque": 80, "roadSens": 6},
            notes="Rotation : laisse le jeu régler l'angle de la voiture (soft lock). Baisse la force FFB si le volant clippe dans les grandes courbes."),
    profile("lmu_hyper", "LMU · Hypercar / LMP2", "Le Mans Ultimate", ["hypercar", "lmh", "lmdh", "lmp2", "lmp"],
            {"angle": 1080, "maxTorque": 85, "roadSens": 6, "damper": 12}, notes="Direction plus lourde : 5-10 % de force en moins qu'en GT3."),
    profile("acc_gt3", "ACC · GT3 / GT4", "ACC", ["gt3", "gt4", "acc"], {"angle": 900, "maxTorque": 80, "roadSens": 5},
            notes="ACC règle l'angle tout seul. Pit House : 900° minimum."),
    profile("acr_rally", "AC Rally · Rallye", "AC Rally", ["rally", "i20", "wrc", "rally2", "r5"],
            {"angle": 540, "maxTorque": 90, "roadSens": 9, "damper": 8, "friction": 3, "inertia": 110, "maxSpeed": 100},
            eq=[100, 100, 110, 120, 110, 100], pedals={"throttle": list(LINEAR), "brake": [0, 22, 46, 72, 100], "clutch": list(LINEAR)},
            notes="Rallye : volant vif et détaillé (route à 9). Angle 540° pour réagir vite dans les épingles."),
    profile("ac_road", "Assetto Corsa · route / GT", "Assetto Corsa", [], {"angle": 900, "maxTorque": 75}),
    profile("ams2_gt", "AMS2 · GT / proto", "Automobilista 2", [], {"angle": 1080, "maxTorque": 80, "roadSens": 6}),
    profile("r3e_gt", "RaceRoom · GT", "RaceRoom", [], {"angle": 1080, "maxTorque": 80, "roadSens": 6}),
]


class FFBStore:
    def __init__(self, path):
        self.path = path
        try:
            with open(path, encoding="utf-8") as f:
                self.profiles = json.load(f)
        except Exception:
            self.profiles = [dict(p) for p in DEFAULTS]
            self.save()

    def save(self):
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.profiles, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.path)

    def put(self, p):
        if not isinstance(p, dict) or not p.get("name"):
            return None
        p["id"] = re.sub(r"[^a-zA-Z0-9_-]", "_", p.get("id") or "ffb_%d" % int(time.time() * 1000))
        p["updated"] = int(time.time())
        self.profiles = [x for x in self.profiles if x["id"] != p["id"]] + [p]
        self.save()
        return p["id"]

    def delete(self, pid):
        self.profiles = [x for x in self.profiles if x["id"] != pid]
        self.save()

    def match(self, game, car, cls=""):
        """Profil a utiliser pour la voiture en cours (meme jeu + mot-cle dans le nom ou la classe)."""
        if not game:
            return None
        g = game.lower()
        same = [p for p in self.profiles if p.get("game") and (p["game"].lower() in g or g in p["game"].lower())]
        hay = ("%s %s" % (car, cls)).lower()
        for p in same:
            if any(m and m.lower() in hay for m in p.get("match", [])):
                return p
        return same[0] if same else None

    def meta(self):
        return {"baseFields": BASE_FIELDS, "eqBands": EQ_BANDS, "gameFields": GAME_FIELDS, "games": list(GAME_FIELDS)}
