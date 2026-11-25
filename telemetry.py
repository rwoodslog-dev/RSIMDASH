"""RSIM Dash - lecture de la telemetrie (memoire partagee Windows).

Jeux : Assetto Corsa / ACC / AC Rally (meme format), Le Mans Ultimate (plugin rF2),
Automobilista 2 (format Project CARS 2), RaceRoom ($R3E v3.x) + source DEMO.
Les offsets ont ete calcules a partir des headers officiels (voir README).
Ne cree JAMAIS de mapping : OpenFileMappingW uniquement (sinon on peut casser le jeu).
"""
import ctypes
import math
import struct
import subprocess
import sys
import time

IS_WIN = sys.platform == "win32"

# ---------------------------------------------------------------- memoire partagee
if IS_WIN:
    from ctypes import wintypes
    _k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _k32.OpenFileMappingW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
    _k32.OpenFileMappingW.restype = wintypes.HANDLE
    _k32.MapViewOfFile.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_size_t]
    _k32.MapViewOfFile.restype = ctypes.c_void_p
    _k32.UnmapViewOfFile.argtypes = [ctypes.c_void_p]
    _k32.CloseHandle.argtypes = [wintypes.HANDLE]
    FILE_MAP_READ = 0x0004


class SharedMem:
    """Vue en lecture seule sur un mapping existant."""

    def __init__(self, name, size):
        self.name, self.size, self.h, self.ptr = name, size, None, None

    def open(self):
        if not IS_WIN:
            return False
        h = _k32.OpenFileMappingW(FILE_MAP_READ, False, self.name)
        if not h:
            return False
        p = _k32.MapViewOfFile(h, FILE_MAP_READ, 0, 0, self.size)
        if not p:
            _k32.CloseHandle(h)
            return False
        self.h, self.ptr = h, p
        return True

    def read(self):
        return ctypes.string_at(self.ptr, self.size)

    def close(self):
        if self.ptr:
            _k32.UnmapViewOfFile(self.ptr)
        if self.h:
            _k32.CloseHandle(self.h)
        self.h = self.ptr = None


def f32(b, o): return struct.unpack_from("<f", b, o)[0]
def f64(b, o): return struct.unpack_from("<d", b, o)[0]
def i32(b, o): return struct.unpack_from("<i", b, o)[0]
def u32(b, o): return struct.unpack_from("<I", b, o)[0]
def u8(b, o): return b[o]
def f32n(b, o, n): return list(struct.unpack_from("<%df" % n, b, o))
def f64n(b, o, n): return list(struct.unpack_from("<%dd" % n, b, o))


def cstr(b, o, n):
    return b[o:o + n].split(b"\0", 1)[0].decode("utf-8", "replace").strip()


def wstr(b, o, n):
    return b[o:o + 2 * n].decode("utf-16-le", "replace").split("\0", 1)[0].strip()


def running_processes():
    """Noms des exe en cours (minuscules). Windows uniquement."""
    if not IS_WIN:
        return set()
    try:
        out = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True,
                             creationflags=0x08000000, timeout=5).stdout
        return {line.split('","')[0].strip('"').lower() for line in out.splitlines() if line}
    except Exception:
        return set()


def blank():
    """Format normalise envoye au telephone."""
    return dict(game="", car="", carClass="", gear=0, rpm=0.0, maxRpm=0.0, shiftRpm=0.0, speed=0.0,
                throttle=0.0, brake=0.0, clutch=0.0, fuel=0.0, fuelCap=0.0, fuelPerLap=0.0,
                tc=None, abs=None, map=None, bb=None, limiter=False, lights=False, absActive=False,
                tcActive=False, water=None, oil=None, turbo=None, tyreT=[None] * 4, tyreP=[None] * 4,
                brakeT=[None] * 4, tyreWear=[None] * 4, lap=0, pos=0, cur=None, last=None, best=None,
                delta=None, sessionLeft=None, inPit=False, paused=False,
                track="", steer=None, lapPct=None, trackLen=None)


# ---------------------------------------------------------------- Assetto Corsa / ACC / AC Rally
class AcFamily:
    """acpmf_* : AC (acs.exe), ACC, AC Rally (memes champs que ACC pour physics/static)."""
    PH_FULL, PH_BASE = 800, 368       # ACC complet / AC1 minimal (jusqu'a clutch)
    GR_FULL, GR_BASE = 1416, 252
    ST = 420

    def __init__(self):
        self.ph = self.gr = self.st = None
        self.full = False
        self.last_id, self.last_change = None, 0
        self.label = "Assetto Corsa"

    def open(self):
        for full in (True, False):
            ph = SharedMem("Local\\acpmf_physics", self.PH_FULL if full else self.PH_BASE)
            gr = SharedMem("Local\\acpmf_graphics", self.GR_FULL if full else self.GR_BASE)
            st = SharedMem("Local\\acpmf_static", self.ST)
            if ph.open() and gr.open() and st.open():
                self.ph, self.gr, self.st, self.full = ph, gr, st, full
                procs = running_processes()
                if "acs.exe" in procs:
                    self.label, self.full = "Assetto Corsa", False
                elif "ac2-win64-shipping.exe" in procs:
                    self.label = "ACC"
                elif any("rally" in p or p.startswith("acr") for p in procs):
                    self.label = "AC Rally"
                else:
                    self.label = "ACC / AC Rally"
                self.last_change = time.time()
                return True
            for m in (ph, gr, st):
                m.close()
        return False

    def close(self):
        for m in (self.ph, self.gr, self.st):
            if m:
                m.close()
        self.ph = self.gr = self.st = None

    def read(self):
        p, g, s = self.ph.read(), self.gr.read(), self.st.read()
        pid = i32(p, 0)
        if pid != self.last_id:
            self.last_id, self.last_change = pid, time.time()
        d = blank()
        d["game"] = self.label
        d["car"] = wstr(s, 68, 33)
        d["track"] = wstr(s, 134, 33)
        d["steer"] = f32(p, 24)
        lp = f32(g, 248)
        d["lapPct"] = lp if 0 <= lp <= 1 else None
        gear = i32(p, 16)
        d["gear"] = gear - 1                       # AC : 0=R 1=N 2=1ere
        d["rpm"] = float(i32(p, 20))
        d["maxRpm"] = float(i32(s, 412))
        d["speed"] = f32(p, 28)
        d["throttle"], d["brake"] = f32(p, 4), f32(p, 8)
        d["clutch"] = 1.0 - f32(p, 364)            # AC : 1 = embraye
        d["fuel"], d["fuelCap"] = f32(p, 12), f32(s, 416)
        d["tyreP"] = f32n(p, 88, 4)
        d["tyreT"] = f32n(p, 152, 4)
        d["tyreWear"] = f32n(p, 120, 4)
        d["brakeT"] = f32n(p, 348, 4)
        d["limiter"] = i32(p, 248) > 0
        tb = f32(p, 276)
        d["turbo"] = tb if tb > 0 else None
        d["paused"] = i32(g, 4) in (0, 3)          # off / pause
        d["lap"], d["pos"] = i32(g, 132), i32(g, 136)
        d["cur"], d["last"], d["best"] = (ms(i32(g, 140)), ms(i32(g, 144)), ms(i32(g, 148)))
        stl = f32(g, 152)
        d["sessionLeft"] = stl / 1000.0 if stl > 0 else None
        d["inPit"] = i32(g, 160) > 0
        if self.full:
            bb = f32(p, 564)
            d["bb"] = bb * 100 if 0 < bb < 1 else None
            cm = i32(p, 588)
            if cm > 0:
                d["maxRpm"] = float(cm)
            w = f32(p, 712)
            d["water"] = w if w > 0 else None
            d["tc"], d["map"], d["abs"] = i32(g, 1268), i32(g, 1276), i32(g, 1280)
            fx = f32(g, 1284)
            d["fuelPerLap"] = fx if fx > 0 else 0.0
            d["lights"] = i32(g, 1296) > 0
            dl = i32(g, 1360)
            d["delta"] = dl / 1000.0 if abs(dl) < 600000 else None
            d["tcActive"] = f32(p, 204) > 0
            d["absActive"] = f32(p, 252) > 0
        return d

    def alive(self):
        return time.time() - self.last_change < 4


def ms(v):
    return v / 1000.0 if 0 < v < 2147483000 else None


# ---------------------------------------------------------------- Le Mans Ultimate (plugin rF2)
class LMU:
    """$rFactor2SMMP_Telemetry$ / $rFactor2SMMP_Scoring$ (+8 octets de bloc version)."""
    VEH_T, WHEEL, VEH_S = 1888, 260, 584
    TEL = 8 + 241672
    SCO = 8 + 4 + 540 + 128 * 584

    def __init__(self):
        self.t = self.s = None
        self.last_v, self.last_change = None, 0

    def open(self):
        t = SharedMem("$rFactor2SMMP_Telemetry$", self.TEL)
        s = SharedMem("$rFactor2SMMP_Scoring$", self.SCO)
        if t.open() and s.open():
            self.t, self.s, self.last_change = t, s, time.time()
            return True
        t.close(); s.close()
        return False

    def close(self):
        for m in (self.t, self.s):
            if m:
                m.close()
        self.t = self.s = None

    def read(self):
        t, s = self.t.read(), self.s.read()
        ver = u32(t, 0)
        if ver != self.last_v:
            self.last_v, self.last_change = ver, time.time()
        # joueur via le scoring
        nsc = i32(s, 8 + 4 + 100)
        pid, ps = None, None
        for i in range(max(0, min(nsc, 128))):
            o = 8 + 544 + i * self.VEH_S
            if u8(s, o + 196):          # mIsPlayer
                pid, ps = i32(s, o), o
                break
        ntel = i32(t, 12)
        vo = None
        for i in range(max(0, min(ntel, 128))):
            o = 16 + i * self.VEH_T
            if pid is None or i32(t, o) == pid:
                vo = o
                break
        d = blank()
        d["game"] = "Le Mans Ultimate"
        d["track"] = cstr(s, 12, 64)
        tl = f64(s, 12 + 88)
        d["trackLen"] = tl if 100 < tl < 100000 else None
        if vo is None:
            d["paused"] = True
            return d
        d["car"] = cstr(t, vo + 32, 64)
        if ps is not None:
            d["carClass"] = cstr(s, ps + 200, 32)
            d["pos"] = u8(s, ps + 199)
            d["best"] = pos_or_none(f64(s, ps + 144))
            d["last"] = pos_or_none(f64(s, ps + 168))
            d["cur"] = pos_or_none(f64(s, ps + 464))
            ld = f64(s, ps + 104)
            if d["trackLen"] and 0 <= ld <= d["trackLen"] * 1.01:
                d["lapPct"] = min(1.0, ld / d["trackLen"])
        d["steer"] = f64(t, vo + 404)
        d["gear"] = i32(t, vo + 352)
        d["rpm"] = f64(t, vo + 356)
        d["maxRpm"] = f64(t, vo + 532)
        d["water"], d["oil"] = f64(t, vo + 364), f64(t, vo + 372)
        d["throttle"], d["brake"], d["clutch"] = f64(t, vo + 388), f64(t, vo + 396), f64(t, vo + 412)
        lv = f64n(t, vo + 184, 3)
        d["speed"] = math.sqrt(sum(x * x for x in lv)) * 3.6
        d["fuel"], d["fuelCap"] = f64(t, vo + 524), f64(t, vo + 608)
        d["lights"] = bool(u8(t, vo + 543))
        d["limiter"] = bool(u8(t, vo + 604))
        rb = f64(t, vo + 664)
        d["bb"] = (1 - rb) * 100 if 0 < rb < 1 else None
        tb = f64(t, vo + 672)
        d["turbo"] = tb / 100000.0 if tb > 1000 else None     # Pa -> bar
        d["lap"] = i32(t, vo + 20)
        tt, tp, bt, tw = [], [], [], []
        for w in range(4):
            wo = vo + 848 + w * self.WHEEL
            temps = f64n(t, wo + 128, 3)
            tt.append(sum(temps) / 3 - 273.15)
            tp.append(f64(t, wo + 120) / 100.0)                 # kPa -> bar
            bt.append(f64(t, wo + 24))                          # deja en Celsius
            tw.append(f64(t, wo + 152))
        d["tyreT"], d["tyreP"], d["brakeT"], d["tyreWear"] = tt, tp, bt, tw
        return d

    def alive(self):
        return time.time() - self.last_change < 4


def pos_or_none(v):
    return v if v and v > 0 else None


# ---------------------------------------------------------------- Automobilista 2 (format PC2)
class AMS2:
    SIZE = 19400

    def __init__(self):
        self.m = None
        self.last_seq, self.last_change = None, 0

    def open(self):
        m = SharedMem("$pcars2$", self.SIZE)
        if m.open():
            self.m, self.last_change = m, time.time()
            return True
        return False

    def close(self):
        if self.m:
            self.m.close()
        self.m = None

    def read(self):
        b = self.m.read()
        seq = u32(b, 7320)
        if seq != self.last_seq:
            self.last_seq, self.last_change = seq, time.time()
        d = blank()
        d["game"] = "Automobilista 2"
        d["car"] = cstr(b, 6444, 64)
        d["carClass"] = cstr(b, 6508, 64)
        d["track"] = (cstr(b, 6576, 64) + " " + cstr(b, 6640, 64)).strip()
        tl = f32(b, 6704)
        d["trackLen"] = tl if 100 < tl < 100000 else None
        vi = i32(b, 20)
        if 0 <= vi < 64:
            po = 28 + vi * 100          # ParticipantInfo (100 o) : lapDist 80, position 84, tours faits 88, tour en cours 92
            d["pos"], d["lap"] = u32(b, po + 84), u32(b, po + 92)
            ld = f32(b, po + 80)
            if d["trackLen"] and 0 <= ld <= d["trackLen"] * 1.01:
                d["lapPct"] = min(1.0, ld / d["trackLen"])
        d["best"], d["last"], d["cur"] = (pos_or_none(f32(b, 6716)), pos_or_none(f32(b, 6720)),
                                          pos_or_none(f32(b, 6724)))
        flags = u32(b, 6816)
        d["lights"] = bool(flags & 1)
        d["limiter"] = bool(flags & 8)
        d["oil"], d["water"] = f32(b, 6820), f32(b, 6828)
        cap = f32(b, 6844)
        d["fuelCap"], d["fuel"] = cap, f32(b, 6840) * cap
        d["speed"] = f32(b, 6848) * 3.6
        d["rpm"], d["maxRpm"] = f32(b, 6852), f32(b, 6856)
        d["brake"], d["throttle"], d["clutch"] = f32(b, 6860), f32(b, 6864), f32(b, 6868)
        d["steer"] = f32(b, 6872)
        d["gear"] = i32(b, 6876)
        d["absActive"] = bool(u8(b, 6888))
        d["tyreT"] = f32n(b, 7072, 4)
        d["tyreWear"] = f32n(b, 7136, 4)
        d["brakeT"] = f32n(b, 7184, 4)
        d["tyreP"] = [x / 100.0 for x in f32n(b, 7372, 4)]    # kPa -> bar
        bb = f32(b, 19380)
        d["bb"] = (1 - bb) * 100 if 0 < bb < 1 else None
        d["paused"] = u32(b, 8) != 2                             # GAME_INGAME_PLAYING
        return d

    def alive(self):
        return time.time() - self.last_change < 4


# ---------------------------------------------------------------- RaceRoom ($R3E v3.6)
class R3E:
    SIZE = 44024

    def __init__(self):
        self.m = None
        self.last_t, self.last_change = None, 0

    def open(self):
        m = SharedMem("$R3E", self.SIZE)
        if m.open():
            self.m, self.last_change = m, time.time()
            return True
        return False

    def close(self):
        if self.m:
            self.m.close()
        self.m = None

    def read(self):
        b = self.m.read()
        ticks = f64(b, 44)
        if ticks != self.last_t:
            self.last_t, self.last_change = ticks, time.time()
        d = blank()
        d["game"] = "RaceRoom"
        d["car"] = "model_%d" % i32(b, 1268)              # R3E ne donne que l'ID du modele
        d["carClass"] = "class_%d" % i32(b, 1264)
        d["paused"] = bool(i32(b, 20) or i32(b, 24))
        d["pos"], d["lap"] = i32(b, 988), i32(b, 1028)
        d["best"], d["last"], d["cur"] = (pos_or_none(f32(b, 1068)), pos_or_none(f32(b, 1084)),
                                          pos_or_none(f32(b, 1100)))
        dl = f32(b, 1132)
        d["delta"] = dl if -1000 < dl < 1000 and dl != -1 else None
        stl = f32(b, 820)
        d["sessionLeft"] = stl if stl > 0 else None
        d["speed"] = f32(b, 1392) * 3.6
        k = 60 / (2 * math.pi)
        d["rpm"], d["maxRpm"], d["shiftRpm"] = f32(b, 1396) * k, f32(b, 1400) * k, f32(b, 1404) * k
        d["gear"] = i32(b, 1408)
        d["fuel"], d["fuelCap"] = f32(b, 1456), f32(b, 1460)
        fpl = f32(b, 1464)
        d["fuelPerLap"] = fpl if fpl > 0 else 0.0
        d["water"], d["oil"] = f32(b, 1480), f32(b, 1484)
        tb = f32(b, 1496)
        d["turbo"] = tb if tb > 0 else None
        d["throttle"], d["brake"], d["clutch"] = f32(b, 1500), f32(b, 1508), f32(b, 1516)
        d["absActive"], d["tcActive"] = i32(b, 1536) == 5, i32(b, 1540) == 5
        d["limiter"] = i32(b, 1572) == 1
        bb = f32(b, 1596)
        d["bb"] = (1 - bb) * 100 if 0 < bb < 1 else None
        d["abs"] = i32(b, 1616) if i32(b, 1616) >= 0 else None
        d["lights"] = i32(b, 1620) > 0
        d["tyreWear"] = f32n(b, 1680, 4)
        d["tyreP"] = [x / 100.0 for x in f32n(b, 1712, 4)]
        d["tyreT"] = [f32(b, 1744 + w * 24 + 4) for w in range(4)]       # centre
        d["brakeT"] = [f32(b, 1856 + w * 16) for w in range(4)]
        tc, mp = i32(b, 1936), i32(b, 1940)
        d["tc"] = tc if tc >= 0 else None
        d["map"] = mp if mp >= 0 else None
        return d

    def alive(self):
        return time.time() - self.last_change < 4


# ---------------------------------------------------------------- DEMO (test sans jeu)
class Demo:
    """Simule un tour pour regler les dashs sans jeu. Voiture forcee via set_car()."""

    def __init__(self, car="Ferrari 296 LMGT3", game="Le Mans Ultimate", max_rpm=7800):
        self.car, self.game, self.max_rpm = car, game, max_rpm
        self.t0 = time.time()
        self.best = None

    def set_car(self, car, game, max_rpm):
        self.car, self.game, self.max_rpm = car, game, max_rpm

    def open(self):
        return True

    def close(self):
        pass

    def alive(self):
        return True

    def read(self):
        t = time.time() - self.t0
        lap_t = t % 90.0
        d = blank()
        d["game"], d["car"] = self.game, self.car
        d["track"] = "Circuit démo"
        d["lapPct"] = lap_t / 90.0
        d["steer"] = 0.6 * math.sin(lap_t / 4.0) * (1 - min(1.0, (t % 24.0) / 20.0) * 0.5)
        cyc = (t % 6.0) / 6.0
        gear = 1 + int((t % 24.0) / 4.0)
        frac = min(1.0, cyc * 1.15)
        d["gear"] = gear if (t % 24.0) < 22 else 2
        d["maxRpm"] = self.max_rpm
        d["rpm"] = self.max_rpm * (0.55 + 0.45 * frac)
        d["speed"] = (60 + gear * 30 * (0.6 + 0.4 * frac)) * (1 + 0.03 * math.sin(int(t // 90) * 1.7 + lap_t / 13))
        d["throttle"] = 1.0 if (t % 24.0) < 20 else 0.0
        d["brake"] = 0.0 if (t % 24.0) < 20 else 0.9
        d["fuel"], d["fuelCap"], d["fuelPerLap"] = max(5, 80 - t * 0.04), 100, 3.1
        d["tc"], d["abs"], d["map"], d["bb"] = 3, 2, 1, 52.4
        d["water"], d["oil"], d["turbo"] = 88 + 4 * math.sin(t / 9), 105, 1.4
        d["tyreT"] = [82 + 6 * math.sin(t / 5 + i) for i in range(4)]
        d["tyreP"] = [1.72 + 0.05 * math.sin(t / 7 + i) for i in range(4)]
        d["brakeT"] = [420 + 150 * math.sin(t / 3 + i) for i in range(4)]
        d["tyreWear"] = [0.95 - i * 0.01 for i in range(4)]
        d["lap"], d["pos"] = int(t // 90) + 1, 4
        d["cur"], d["last"], d["best"] = lap_t, 89.412, 88.903
        d["delta"] = 0.6 * math.sin(t / 11)
        d["sessionLeft"] = max(0, 3600 - t)
        d["limiter"] = False
        d["tcActive"] = frac > 0.9 and gear < 3
        d["lights"] = True
        return d


ADAPTERS = [AcFamily, LMU, AMS2, R3E]
