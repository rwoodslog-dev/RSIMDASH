"""RSIM Dash - entrees/sorties : boutons du volant (G29 & co via winmm) et envoi de touches clavier au jeu.

- Boutons : tous les peripheriques joystick Windows sont lus (jusqu'a 32 boutons chacun).
- Touches : SendInput en scancode (fonctionne avec la plupart des jeux DirectInput : LMU, AC, ACC, AMS2...).
"""
import ctypes
import sys
import threading
import time

IS_WIN = sys.platform == "win32"

# --------------------------------------------------------------------------- joysticks (winmm)
if IS_WIN:
    from ctypes import wintypes
    _winmm = ctypes.WinDLL("winmm")

    class JOYINFOEX(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("dwFlags", wintypes.DWORD), ("dwXpos", wintypes.DWORD),
                    ("dwYpos", wintypes.DWORD), ("dwZpos", wintypes.DWORD), ("dwRpos", wintypes.DWORD),
                    ("dwUpos", wintypes.DWORD), ("dwVpos", wintypes.DWORD), ("dwButtons", wintypes.DWORD),
                    ("dwButtonNumber", wintypes.DWORD), ("dwPOV", wintypes.DWORD),
                    ("dwReserved1", wintypes.DWORD), ("dwReserved2", wintypes.DWORD)]

    class JOYCAPSW(ctypes.Structure):
        _fields_ = [("wMid", wintypes.WORD), ("wPid", wintypes.WORD), ("szPname", wintypes.WCHAR * 32),
                    ("wXmin", wintypes.UINT), ("wXmax", wintypes.UINT), ("wYmin", wintypes.UINT), ("wYmax", wintypes.UINT),
                    ("wZmin", wintypes.UINT), ("wZmax", wintypes.UINT), ("wNumButtons", wintypes.UINT),
                    ("wPeriodMin", wintypes.UINT), ("wPeriodMax", wintypes.UINT), ("wRmin", wintypes.UINT), ("wRmax", wintypes.UINT),
                    ("wUmin", wintypes.UINT), ("wUmax", wintypes.UINT), ("wVmin", wintypes.UINT), ("wVmax", wintypes.UINT),
                    ("wCaps", wintypes.UINT), ("wMaxAxes", wintypes.UINT), ("wNumAxes", wintypes.UINT), ("wMaxButtons", wintypes.UINT),
                    ("szRegKey", wintypes.WCHAR * 32), ("szOEMVxD", wintypes.WCHAR * 260)]

    JOY_RETURNBUTTONS, JOY_RETURNPOV = 0x80, 0x40


def list_devices():
    """[(index, nom, nb_boutons)] des joysticks branches."""
    out = []
    if not IS_WIN:
        return out
    for i in range(16):
        info = JOYINFOEX(); info.dwSize = ctypes.sizeof(JOYINFOEX); info.dwFlags = JOY_RETURNBUTTONS
        if _winmm.joyGetPosEx(i, ctypes.byref(info)) != 0:
            continue
        caps = JOYCAPSW()
        name = "Joystick %d" % (i + 1)
        if _winmm.joyGetDevCapsW(i, ctypes.byref(caps), ctypes.sizeof(JOYCAPSW)) == 0:
            name = "%s (VID %04X PID %04X)" % (caps.szPname or name, caps.wMid, caps.wPid)
            out.append((i, name, caps.wNumButtons))
        else:
            out.append((i, name, 32))
    return out


class JoyWatcher(threading.Thread):
    """Lit les boutons a 60 Hz, memorise le dernier appui (pour la capture dans l'editeur) et appelle on_press(dev, btn)."""

    def __init__(self, on_press):
        super().__init__(daemon=True)
        self.on_press = on_press
        self.last = {}            # dev -> masque precedent
        self.last_press = None    # (dev, btn, horodatage)
        self.devices = []

    def run(self):
        if not IS_WIN:
            return
        rescan = 0
        while True:
            if time.time() - rescan > 5:
                rescan = time.time()
                self.devices = list_devices()
            for dev, _, _ in self.devices:
                info = JOYINFOEX(); info.dwSize = ctypes.sizeof(JOYINFOEX); info.dwFlags = JOY_RETURNBUTTONS | JOY_RETURNPOV
                if _winmm.joyGetPosEx(dev, ctypes.byref(info)) != 0:
                    continue
                mask = info.dwButtons
                # croix directionnelle (POV) -> boutons virtuels 33..36 (haut, droite, bas, gauche)
                pov = info.dwPOV
                if pov != 0xFFFF and pov < 36000:
                    mask |= 1 << (32 + int(((pov + 4500) % 36000) // 9000))
                prev = self.last.get(dev, 0)
                pressed = mask & ~prev
                self.last[dev] = mask
                b = 0
                while pressed:
                    if pressed & 1:
                        self.last_press = (dev, b + 1, time.time())
                        try:
                            self.on_press(dev, b + 1)
                        except Exception as e:
                            print("  ! action bouton :", e)
                    pressed >>= 1
                    b += 1
            time.sleep(1 / 60)


# --------------------------------------------------------------------------- envoi de touches
SCAN = {**{c: v for c, v in zip("1234567890", range(0x02, 0x0C))},
        **dict(zip("QWERTYUIOP", range(0x10, 0x1A))), **dict(zip("ASDFGHJKL", range(0x1E, 0x27))),
        **dict(zip("ZXCVBNM", range(0x2C, 0x33))),
        "ESC": 0x01, "MINUS": 0x0C, "EQUALS": 0x0D, "BACKSPACE": 0x0E, "TAB": 0x0F, "ENTER": 0x1C, "LCTRL": 0x1D,
        "LSHIFT": 0x2A, "RSHIFT": 0x36, "LALT": 0x38, "SPACE": 0x39, "CAPS": 0x3A,
        **{"F%d" % i: 0x3A + i for i in range(1, 11)}, "F11": 0x57, "F12": 0x58,
        "NUM0": 0x52, "NUM1": 0x4F, "NUM2": 0x50, "NUM3": 0x51, "NUM4": 0x4B, "NUM5": 0x4C, "NUM6": 0x4D,
        "NUM7": 0x47, "NUM8": 0x48, "NUM9": 0x49, "NUMPLUS": 0x4E, "NUMMINUS": 0x4A, "NUMSTAR": 0x37,
        "NUMDOT": 0x53, "NUMSLASH": 0xE035, "LBRACKET": 0x1A, "RBRACKET": 0x1B, "SEMICOLON": 0x27, "APOS": 0x28,
        "GRAVE": 0x29, "BACKSLASH": 0x2B, "COMMA": 0x33, "PERIOD": 0x34, "SLASH": 0x35,
        **{"F%d" % i: 0x64 + i - 13 for i in range(13, 16)}, **{"F%d" % i: 0x67 + i - 16 for i in range(16, 24)}, "F24": 0x76,
        # touches etendues (prefixe E0)
        "UP": 0xE048, "DOWN": 0xE050, "LEFT": 0xE04B, "RIGHT": 0xE04D, "INSERT": 0xE052, "DELETE": 0xE053,
        "HOME": 0xE047, "END": 0xE04F, "PGUP": 0xE049, "PGDN": 0xE051, "RCTRL": 0xE01D, "LWIN": 0xE05B, "PRTSC": 0xE037, "OEM102": 0x56, "NUMLOCK": 0x45, "SCROLL": 0x46, "APPS": 0xE05D, "RALT": 0xE038, "NUMENTER": 0xE01C}
KEY_NAMES = sorted(SCAN.keys(), key=lambda k: (len(k) > 1, k))

if IS_WIN:
    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                    ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
                    ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]

    class _U(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT), ("pad", ctypes.c_byte * 32)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", wintypes.DWORD), ("u", _U)]

    _user32 = ctypes.WinDLL("user32", use_last_error=True)
    KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, KEYEVENTF_EXTENDED = 0x2, 0x8, 0x1


def _key(code, up):
    flags = KEYEVENTF_SCANCODE | (KEYEVENTF_KEYUP if up else 0)
    if code > 0xFF:
        flags |= KEYEVENTF_EXTENDED
        code &= 0xFF
    inp = INPUT(type=1)
    inp.u.ki = KEYBDINPUT(0, code, flags, 0, 0)
    _user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def key_state(combo, up):
    """Appui maintenu : keydown au contact, keyup au relachement (boutons 'maintien')."""
    keys = [k.strip().upper() for k in combo.split("+") if k.strip()]
    codes = [SCAN[k] for k in keys if k in SCAN]
    if not codes:
        raise ValueError("touche inconnue : %s" % combo)
    if not IS_WIN:
        print("  (simulation) touche %s : %s" % ("relachee" if up else "enfoncee", combo))
        return
    for c in (reversed(codes) if up else codes):
        _key(c, up)


def send_keys(combo, hold=0.08):
    """combo : 'S', 'LCTRL+F1', 'NUM5'... Les jeux ont besoin d'un appui de quelques dizaines de ms."""
    keys = [k.strip().upper() for k in combo.split("+") if k.strip()]
    codes = [SCAN[k] for k in keys if k in SCAN]
    if not codes:
        raise ValueError("touche inconnue : %s" % combo)
    if not IS_WIN:
        print("  (simulation) touche :", combo)
        return

    def run():
        for c in codes:
            _key(c, False)
        time.sleep(hold)
        for c in reversed(codes):
            _key(c, True)
    threading.Thread(target=run, daemon=True).start()


# --------------------------------------------------------------------------- souris / texte / touches media (telecommande)
MOUSE_BTN = {"left": (0x2, 0x4), "right": (0x8, 0x10), "middle": (0x20, 0x40)}
VK_MEDIA = {"play": 0xB3, "next": 0xB0, "prev": 0xB1, "stop": 0xB2, "mute": 0xAD, "voldown": 0xAE, "volup": 0xAF}


def _mouse(flags, dx=0, dy=0, data=0):
    if not IS_WIN:
        return
    inp = INPUT(type=0)
    inp.u.mi = MOUSEINPUT(int(dx), int(dy), ctypes.c_ulong(data & 0xFFFFFFFF).value, flags, 0, 0)
    _user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def mouse_move(dx, dy):
    _mouse(0x1, dx, dy)


def mouse_button(btn, down):
    f = MOUSE_BTN.get(btn)
    if f:
        _mouse(f[0] if down else f[1])


def mouse_click(btn, double=False):
    for _ in range(2 if double else 1):
        mouse_button(btn, True)
        time.sleep(0.02)
        mouse_button(btn, False)
        time.sleep(0.04)


def mouse_wheel(delta, horizontal=False):
    _mouse(0x1000 if horizontal else 0x800, data=int(delta))


def type_text(text):
    """Ecrit du texte (accents compris) comme si on le tapait au clavier."""
    if not IS_WIN:
        print("  (simulation) texte :", text)
        return
    for ch in text:
        if ch == "\n":
            send_keys("ENTER")
            time.sleep(0.03)
            continue
        for up in (False, True):
            inp = INPUT(type=1)
            inp.u.ki = KEYBDINPUT(0, ord(ch), 0x4 | (KEYEVENTF_KEYUP if up else 0), 0, 0)   # KEYEVENTF_UNICODE
            _user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def media_key(name):
    vk = VK_MEDIA.get(name)
    if not vk or not IS_WIN:
        return
    for up in (False, True):
        inp = INPUT(type=1)
        inp.u.ki = KEYBDINPUT(vk, 0, 0x1 | (KEYEVENTF_KEYUP if up else 0), 0, 0)
        _user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
