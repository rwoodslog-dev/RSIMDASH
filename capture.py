"""RSIM - capture video (FFmpeg) avec telemetrie synchronisee.
Deux modes :
  - Enregistrement : demarrer / arreter (raccourci, bouton du volant ou du telephone).
  - Replay (comme ShadowPlay) : enregistre en continu les N dernieres secondes ; "Clip" sauvegarde ce passage.
Chaque video = videos/<date>_<voiture>.mp4 + .json (telemetrie 30 Hz alignee sur la video) + .jpg (miniature).
Capture d'ecran Windows : ddagrab (Desktop Duplication, GPU) + encodeur materiel AMD AMF / NVIDIA NVENC,
repli sur gdigrab + x264. Il faut ffmpeg.exe (voir README)."""
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time

WIN = sys.platform == "win32"
NOWIN = 0x08000000 if WIN else 0        # CREATE_NO_WINDOW

DEFAULT = {"hotSnap": "CTRL+ALT+P", "fps": 144, "vfr": True, "bitrate": 40, "pipeline": "auto", "monitor": 0, "audio": "", "bufferSec": 60,
           "autoBuffer": False, "hotRec": "CTRL+ALT+R", "hotClip": "CTRL+ALT+C", "hotBuf": "CTRL+ALT+B"}

PIPES = [  # id, libelle, source, encodeur
    ("dda_amf", "Écran (GPU) → AMD AMF, zéro copie", "dda", "amf"),
    ("dda_nvenc", "Écran (GPU) → NVIDIA NVENC, zéro copie", "dda", "nvenc"),
    ("ddadl_amf", "Écran (GPU) → AMD AMF", "ddadl", "amf"),
    ("ddadl_qsv", "Écran (GPU) → Intel QuickSync", "ddadl", "qsv"),
    ("gdi_amf", "Écran (GDI) → AMD AMF", "gdi", "amf"),
    ("ddadl_x264", "Écran (GPU) → processeur x264", "ddadl", "x264"),
    ("gdi_x264", "Écran (GDI) → processeur x264 (lent)", "gdi", "x264"),
    ("test_x264", "Mire de test (sans écran)", "test", "x264"),
]


def slug(s):
    return (re.sub(r"[^A-Za-z0-9]+", "-", s or "").strip("-") or "video")[:40]


class Capture:
    def __init__(self, base, ring, get_frame, on_event=None):
        self.base = base
        self.ring = ring
        self.get_frame = get_frame
        self.on_event = on_event or (lambda kind, info: None)
        self.folder = os.path.join(base, "videos")
        self.tmp = os.path.join(self.folder, ".buffer")
        self.photos = os.path.join(base, "photos")
        os.makedirs(self.photos, exist_ok=True)
        self.last_snap_at = 0
        os.makedirs(self.tmp, exist_ok=True)
        self.cfg_path = os.path.join(base, "capture.json")
        self.cfg = dict(DEFAULT)
        try:
            with open(self.cfg_path, encoding="utf-8") as f:
                self.cfg.update(json.load(f))
        except Exception:
            pass
        self.lock = threading.Lock()
        self.rec = None            # {"proc", "path", "t0", "start", "meta"}
        self.buf = None            # {"proc", "segs": {nom: debut}, ...}
        self.log = []
        self.error = ""
        self.last_file = ""
        self.last_clip_at = 0
        self.probe_cache = None
        self.ffmpeg = self.find_ffmpeg()
        self.probe_err = {}
        self.plock = threading.Lock()
        if self.ffmpeg:   # teste les methodes de capture en arriere-plan (le 1er enregistrement demarre tout de suite)
            threading.Thread(target=self._boot, daemon=True).start()

    def _boot(self):
        try:
            self.probe()
        except Exception as e:
            self.error = "Test capture : %s" % e
        if self.cfg.get("autoBuffer"):
            self.buffer_start()

    # ------------------------------------------------------------ outils
    def find_ffmpeg(self):
        exe = "ffmpeg.exe" if WIN else "ffmpeg"
        for p in (os.path.join(self.base, exe), os.path.join(self.base, "ffmpeg", "bin", exe), os.path.join(self.base, "ffmpeg", exe)):
            if os.path.isfile(p):
                return p
        return shutil.which("ffmpeg")

    # ------------------------------------------------------------ installation automatique de ffmpeg (Windows)
    FF_URLS = ["https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
               "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"]

    def install_ffmpeg(self):
        if getattr(self, "installing", None) or self.ffmpeg:
            return False
        self.installing = {"pct": 0, "msg": "Téléchargement…"}
        threading.Thread(target=self._install, daemon=True).start()
        return True

    def _install(self):
        import urllib.request
        import zipfile
        tmp = os.path.join(self.base, "ffmpeg_download.zip")
        try:
            last = None
            for url in self.FF_URLS:
                try:
                    self.installing["msg"] = "Téléchargement de ffmpeg (~100 Mo)…"
                    req = urllib.request.Request(url, headers={"User-Agent": "RSIM"})
                    with urllib.request.urlopen(req, timeout=30) as r, open(tmp, "wb") as f:
                        total = int(r.headers.get("Content-Length") or 0)
                        done = 0
                        while True:
                            chunk = r.read(1 << 20)
                            if not chunk:
                                break
                            f.write(chunk)
                            done += len(chunk)
                            self.installing["pct"] = round(done * 100.0 / total) if total else 0
                    last = None
                    break
                except Exception as e:
                    last = e
            if last:
                raise last
            self.installing["msg"] = "Extraction…"
            with zipfile.ZipFile(tmp) as z:
                name = next(n for n in z.namelist() if n.lower().endswith("/bin/ffmpeg.exe"))
                with z.open(name) as src, open(os.path.join(self.base, "ffmpeg.exe"), "wb") as dst:
                    shutil.copyfileobj(src, dst)
            self.ffmpeg = self.find_ffmpeg()
            self.error = ""
            self.installing = None
            print("  > ffmpeg installe :", self.ffmpeg)
            self._boot()
        except Exception as e:
            self.installing = None
            self.error = "Installation de ffmpeg impossible (%s). Fais-le à la main : gyan.dev → ffmpeg-release-essentials.zip → bin\\ffmpeg.exe à côté de server.py." % e
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass

    def save_cfg(self, new):
        for k, v in (new or {}).items():
            if k in DEFAULT:
                self.cfg[k] = type(DEFAULT[k])(v) if not isinstance(DEFAULT[k], str) else str(v)
        with open(self.cfg_path, "w", encoding="utf-8") as f:
            json.dump(self.cfg, f, ensure_ascii=False, indent=1)

    def run(self, args, timeout=20):
        try:
            p = subprocess.run([self.ffmpeg, "-hide_banner"] + args, capture_output=True, timeout=timeout, creationflags=NOWIN)
            return p.returncode, (p.stderr or b"").decode("utf-8", "replace")
        except Exception as e:
            return -1, str(e)

    def audio_devices(self):
        if not (WIN and self.ffmpeg):
            return []
        _, err = self.run(["-list_devices", "true", "-f", "dshow", "-i", "dummy"], 10)
        return re.findall(r'"([^"]+)"\s*\(audio\)', err)

    def probe(self, force=False):
        """Teste chaque chaine de capture (1 s) et garde celles qui marchent."""
        with self.plock:
            if self.probe_cache is not None and not force:
                return self.probe_cache
            return self._probe()

    def _probe(self):
        ok, self.probe_err = [], {}
        for pid, label, src, enc in PIPES:
            if (src == "test") == WIN:
                continue
            args = self.video_in(src, 30)
            if src == "ddadl" and enc in ("amf", "qsv"):
                args += ["-pix_fmt", "nv12"]
            args += self.encoder(enc, 30, 8) + ["-t", "1", "-f", "null", "-"]
            code, err = self.run(args, 25)
            if code == 0:
                ok.append(pid)
            else:
                self.probe_err[pid] = " | ".join([l for l in err.strip().splitlines() if l.strip()][-3:])[:400]
        self.probe_cache = ok
        return ok

    def diag(self):
        """Rapport complet pour comprendre pourquoi la capture ne marche pas."""
        r = {"ffmpeg": self.ffmpeg, "windows": WIN, "dossier": self.folder, "erreur": self.error, "journal": self.log[-15:]}
        if not self.ffmpeg:
            r["conseil"] = "ffmpeg.exe introuvable : copie bin\\ffmpeg.exe (gyan.dev, ffmpeg-release-essentials) a cote de server.py puis relance RSIM."
            return r
        _, out = self.run(["-version"], 10)
        r["version"] = (out.splitlines() or [""])[0]
        try:
            p = subprocess.run([self.ffmpeg, "-hide_banner", "-version"], capture_output=True, timeout=10, creationflags=NOWIN)
            r["version"] = (p.stdout or b"").decode("utf-8", "replace").splitlines()[0]
            e = subprocess.run([self.ffmpeg, "-hide_banner", "-encoders"], capture_output=True, timeout=10, creationflags=NOWIN)
            enc = (e.stdout or b"").decode("utf-8", "replace")
            r["encodeurs"] = [x for x in ("h264_amf", "hevc_amf", "h264_nvenc", "h264_qsv", "libx264") if x in enc]
            f = subprocess.run([self.ffmpeg, "-hide_banner", "-filters"], capture_output=True, timeout=10, creationflags=NOWIN)
            r["ddagrab"] = "ddagrab" in (f.stdout or b"").decode("utf-8", "replace")
        except Exception as ex:
            r["exception"] = str(ex)
        r["methodes_ok"] = self.probe(force=True)
        r["methodes_erreurs"] = getattr(self, "probe_err", {})
        r["methode_choisie"] = self.pipeline()
        r["dossier_ecrivable"] = os.access(self.folder, os.W_OK)
        return r

    def pipeline(self):
        p = self.cfg.get("pipeline", "auto")
        if p != "auto":
            return p
        ok = self.probe()
        return ok[0] if ok else ("gdi_x264" if WIN else "test_x264")

    # ------------------------------------------------------------ construction de la commande
    def video_in(self, src, fps, vfr=False):
        mon = int(self.cfg.get("monitor", 0))
        # vfr : une image seulement quand l'ecran change -> la video suit les FPS du jeu (plafond = fps)
        dup = ":dup_frames=0" if vfr else ""
        if src == "dda":
            return ["-f", "lavfi", "-i", "ddagrab=output_idx=%d:framerate=%d:draw_mouse=0%s" % (mon, fps, dup)]
        if src == "ddadl":
            return ["-f", "lavfi", "-i", "ddagrab=output_idx=%d:framerate=%d:draw_mouse=0%s,hwdownload,format=bgra" % (mon, fps, dup)]
        if src == "gdi":
            return ["-f", "gdigrab", "-framerate", str(fps), "-draw_mouse", "0", "-i", "desktop"]
        return ["-re", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=%d" % fps]

    def encoder(self, enc, fps, mbps):
        br, buf = "%dM" % mbps, "%dM" % (mbps * 2)
        g = ["-g", str(fps * 2), "-force_key_frames", "expr:gte(t,n_forced*2)"]
        if enc == "amf":   # "balanced" : la qualite "quality" est trop lente a 60+ i/s et fait saccader
            return ["-c:v", "h264_amf", "-usage", "transcoding", "-quality", "balanced", "-rc", "vbr_peak",
                    "-b:v", br, "-maxrate", "%dM" % int(mbps * 1.5), "-bufsize", buf, "-bf", "0"] + g
        if enc == "nvenc":
            return ["-c:v", "h264_nvenc", "-preset", "p3", "-rc", "cbr", "-b:v", br, "-maxrate", br, "-bufsize", buf] + g
        if enc == "qsv":
            return ["-c:v", "h264_qsv", "-preset", "faster", "-b:v", br, "-maxrate", br] + g
        return ["-c:v", "libx264", "-preset", "veryfast", "-b:v", br, "-maxrate", br, "-bufsize", buf, "-pix_fmt", "yuv420p"] + g

    def build(self, out_args):
        pid = self.pipeline()
        _, _, src, enc = next(p for p in PIPES if p[0] == pid)
        fps, mbps = int(self.cfg["fps"]), int(self.cfg["bitrate"])
        vfr = bool(self.cfg.get("vfr")) and src in ("dda", "ddadl")
        args = ["-y", "-loglevel", "error", "-stats", "-stats_period", "0.5", "-thread_queue_size", "1024"] + self.video_in(src, fps, vfr)
        audio = self.cfg.get("audio") if WIN else ""
        if audio:
            args += ["-f", "dshow", "-audio_buffer_size", "50", "-i", "audio=" + audio, "-map", "0:v", "-map", "1:a",
                     "-c:a", "aac", "-b:a", "192k"]
        if src == "ddadl" and enc in ("amf", "qsv"):
            args += ["-pix_fmt", "nv12"]
        if vfr:
            args += ["-fps_mode", "passthrough"]
        return [self.ffmpeg] + args + self.encoder(enc, fps, mbps) + out_args, pid

    def spawn(self, cmd, state):
        self.log, self.error = [], ""
        print("  > ffmpeg :", " ".join('"%s"' % a if " " in a else a for a in cmd))
        prio = 0x00000080 if WIN else 0     # HIGH_PRIORITY_CLASS : la capture ne doit pas manquer d'images
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, creationflags=NOWIN | prio)
        state.update(proc=proc, spawned=time.time(), t0=None)
        threading.Thread(target=self.read_err, args=(proc, state), daemon=True).start()
        return proc

    def read_err(self, proc, state):
        """Lit la progression de ffmpeg : sert a dater la 1re image (synchro telemetrie) et a afficher les erreurs."""
        fps = int(self.cfg["fps"])
        acc = b""
        while True:
            ch = proc.stderr.read(1)
            if not ch:
                break
            if ch in b"\r\n":
                line = acc.decode("utf-8", "replace").strip()
                acc = b""
                if not line:
                    continue
                m = re.search(r"frame=\s*(\d+)", line)
                if m:
                    n = int(m.group(1))
                    tm = re.search(r"time=\s*(\d+):(\d+):([\d.]+)", line)
                    if n > 0 and state.get("t0") is None:
                        el = int(tm.group(1)) * 3600 + int(tm.group(2)) * 60 + float(tm.group(3)) if tm else n / float(fps)
                        state["t0"] = time.time() - el
                    fm = re.search(r"fps=\s*([\d.]+)", line)
                    if fm:
                        state["fpsNow"] = float(fm.group(1))
                else:
                    self.log = (self.log + [line])[-30:]
            else:
                acc += ch

    def stop_proc(self, proc):
        try:
            proc.stdin.write(b"q")
            proc.stdin.flush()
        except Exception:
            pass
        try:
            proc.wait(15)
        except Exception:
            proc.kill()

    def meta(self):
        f = self.get_frame() or {}
        return {"game": f.get("game", ""), "car": f.get("car", ""), "track": f.get("track", "")}

    # ------------------------------------------------------------ enregistrement
    def rec_start(self):
        if not self.ffmpeg:
            self.error = "ffmpeg introuvable : mets ffmpeg.exe dans le dossier RSIM (voir README)."
            return False
        with self.lock:
            if self.rec:
                return True
            resume = bool(self.buf)
            if resume:
                self.buffer_stop()
            m = self.meta()
            name = time.strftime("%Y-%m-%d_%H-%M-%S") + "_" + slug(m["car"] or m["game"])
            path = os.path.join(self.folder, name + ".mp4")
            state = {"path": path, "meta": m, "resume": resume, "kind": "record"}
            cmd, pid = self.build(["-movflags", "+faststart", path])
            self.spawn(cmd, state)
            self.rec = state
        print("  > Enregistrement video : %s (%s)" % (os.path.basename(path), pid))
        threading.Timer(3, self._check_alive, args=(state,)).start()
        self.on_event("rec_start", {})
        return True

    def rec_stop(self):
        with self.lock:
            st = self.rec
            self.rec = None
        if not st:
            return False
        end = time.time()
        self.stop_proc(st["proc"])
        t0 = st.get("t0") or st["spawned"] + 0.5
        if os.path.isfile(st["path"]) and os.path.getsize(st["path"]) > 1000:
            self.finish(st["path"], t0, end, st["meta"], "record")
        else:
            self.error = "La capture a échoué : " + (" / ".join(self.log[-3:]) or "aucune image")
        if st.get("resume"):
            self.buffer_start()
        self.on_event("rec_stop", {"file": os.path.basename(st["path"])})
        return True

    def _check_alive(self, state):
        """ffmpeg s'est arrete tout seul juste apres le demarrage = echec : on le dit clairement."""
        p = state.get("proc")
        if p and p.poll() is not None and (self.rec is state or self.buf is state):
            self.error = "ffmpeg s'est arrêté (code %s) : %s" % (p.returncode, " / ".join(self.log[-3:]) or "?")
            print("  ! Capture :", self.error)
            if self.rec is state:
                self.rec = None
            if self.buf is state:
                self.buf = None

    def rec_toggle(self):
        return self.rec_stop() if self.rec else self.rec_start()

    # ------------------------------------------------------------ replay (tampon circulaire)
    def buffer_start(self):
        if not self.ffmpeg or self.buf or self.rec:
            return False
        for f in glob.glob(os.path.join(self.tmp, "seg_*.ts")):
            try:
                os.remove(f)
            except OSError:
                pass
        seg = 4
        n = int(self.cfg["bufferSec"]) // seg + 3
        state = {"segs": {}, "seg": seg, "kind": "buffer"}
        cmd, pid = self.build(["-f", "segment", "-segment_time", str(seg), "-segment_wrap", str(n), "-reset_timestamps", "1",
                               "-segment_format", "mpegts", os.path.join(self.tmp, "seg_%03d.ts")])
        self.spawn(cmd, state)
        self.buf = state
        threading.Thread(target=self.watch_segs, args=(state,), daemon=True).start()
        threading.Timer(3, self._check_alive, args=(state,)).start()
        print("  > Replay actif (%d s)" % int(self.cfg["bufferSec"]))
        self.on_event("buf_start", {})
        return True

    def watch_segs(self, state):
        """Date le debut de chaque segment (pour retrouver la telemetrie correspondante)."""
        sizes = {}
        while self.buf is state and state["proc"].poll() is None:
            for f in glob.glob(os.path.join(self.tmp, "seg_*.ts")):
                try:
                    sz = os.path.getsize(f)
                except OSError:
                    continue
                nm = os.path.basename(f)
                if nm not in sizes or sz < sizes[nm]:
                    t = time.time() - 0.1
                    if not state["segs"] and state.get("t0"):
                        t = state["t0"]
                    state["segs"][nm] = t
                sizes[nm] = sz
            time.sleep(0.2)

    def buffer_stop(self):
        st, self.buf = self.buf, None
        if st:
            self.stop_proc(st["proc"])
            self.on_event("buf_stop", {})
        return True

    def buffer_toggle(self):
        return self.buffer_stop() if self.buf else self.buffer_start()

    def clip(self, seconds=None):
        """Sauvegarde les dernieres secondes du replay."""
        st = self.buf
        if not st:
            if self.rec:
                return False
            self.error = "Active d'abord le replay."
            return False
        sec = float(seconds or self.cfg["bufferSec"])
        now = time.time()
        segs = sorted(((t, nm) for nm, t in st["segs"].items() if t >= now - sec - st["seg"]), key=lambda x: x[0])
        segs = [(t, nm) for t, nm in segs if os.path.isfile(os.path.join(self.tmp, nm))]
        if not segs:
            self.error = "Replay vide (attends quelques secondes)."
            return False
        m = self.meta()
        name = time.strftime("%Y-%m-%d_%H-%M-%S") + "_clip_" + slug(m["car"] or m["game"])
        out = os.path.join(self.folder, name + ".mp4")
        lst = os.path.join(self.tmp, "list.txt")
        tmpdir = os.path.join(self.tmp, "c%d" % int(now))
        os.makedirs(tmpdir, exist_ok=True)
        with open(lst, "w", encoding="utf-8") as f:   # copie : ffmpeg continue d'ecrire dans le tampon
            for i, (_, nm) in enumerate(segs):
                dst = os.path.join(tmpdir, "%03d.ts" % i)
                shutil.copyfile(os.path.join(self.tmp, nm), dst)
                f.write("file '%s'\n" % dst.replace("\\", "/").replace("'", "'\\''"))
        args = ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart"]
        if self.cfg.get("audio") and WIN:
            args += ["-bsf:a", "aac_adtstoasc"]
        code, err = self.run(args + [out], 120)
        shutil.rmtree(tmpdir, ignore_errors=True)
        if code != 0:
            self.error = "Clip : " + err.strip()[-300:]
            return False
        self.last_clip_at = now
        self.finish(out, segs[0][0], now, m, "clip")
        self.on_event("clip", {"file": os.path.basename(out)})
        return True

    # ------------------------------------------------------------ fin : telemetrie + miniature
    def finish(self, path, t0, t1, meta, kind):
        tele = self.ring.window(t0, t1)
        base = os.path.splitext(path)[0]
        info = dict(meta, kind=kind, start=int(t0), duration=round(t1 - t0, 2), fps=int(self.cfg["fps"]), offset=0.0,
                    tele=tele, file=os.path.basename(path))
        with open(base + ".json", "w", encoding="utf-8") as f:
            json.dump(info, f, ensure_ascii=False, separators=(",", ":"))
        self.run(["-y", "-loglevel", "error", "-ss", "1", "-i", path, "-frames:v", "1", "-vf", "scale=480:-2", base + ".jpg"], 30)
        self.last_file = os.path.basename(path)
        print("  > Video enregistree : %s (%d s, %d points de telemetrie)" % (self.last_file, t1 - t0, len(tele)))

    # ------------------------------------------------------------ photos (capture d'ecran)
    def snap(self):
        """Photo de l'ecran (pleine resolution) + telemetrie du moment."""
        if not self.ffmpeg:
            self.error = "ffmpeg introuvable : impossible de prendre une photo."
            return False
        pid = self.pipeline()
        src = next(p for p in PIPES if p[0] == pid)[2]
        mon = int(self.cfg.get("monitor", 0))
        if src in ("dda", "ddadl"):
            vin = ["-f", "lavfi", "-i", "ddagrab=output_idx=%d:framerate=30:draw_mouse=0,hwdownload,format=bgra" % mon]
        elif src == "gdi":
            vin = ["-f", "gdigrab", "-draw_mouse", "0", "-i", "desktop"]
        else:
            vin = ["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=1"]
        m = self.meta()
        name = time.strftime("%Y-%m-%d_%H-%M-%S") + "_" + slug(m["car"] or m["game"] or "photo")
        out = os.path.join(self.photos, name + ".png")
        code, err = self.run(["-y", "-loglevel", "error"] + vin + ["-frames:v", "1", out], 20)
        if code != 0 or not os.path.isfile(out):
            self.error = "Photo : " + err.strip()[-200:]
            return False
        f = self.get_frame() or {}
        self.photo_meta(out, dict(m, kind="screen", tele={k: f.get(k) for k in ("speed", "gear", "rpm", "lap", "pos", "cur", "best", "delta")}))
        self.last_snap_at = time.time()
        print("  > Photo :", os.path.basename(out))
        self.on_event("snap", {"file": os.path.basename(out)})
        return True

    def photo_meta(self, path, meta):
        meta = dict(meta, file=os.path.basename(path), at=int(time.time()))
        with open(os.path.splitext(path)[0] + ".json", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False)
        # miniature
        self.run(["-y", "-loglevel", "error", "-i", path, "-vf", "scale=480:-2", os.path.splitext(path)[0] + ".thumb.jpg"], 20)

    def photo_save(self, name, data_url, meta):
        """Photo envoyee par l'appli (image tiree d'une video, photo retouchee, import)."""
        import base64
        m = re.match(r"^data:image/(png|jpeg|webp);base64,(.+)$", data_url or "", re.S)
        if not m:
            return None
        ext = {"png": ".png", "jpeg": ".jpg", "webp": ".webp"}[m.group(1)]
        base = slug(os.path.splitext(name or "photo")[0])
        out = os.path.join(self.photos, time.strftime("%Y-%m-%d_%H-%M-%S") + "_" + base + ext)
        with open(out, "wb") as f:
            f.write(base64.b64decode(m.group(2)))
        self.photo_meta(out, meta or {})
        return os.path.basename(out)

    def photo_list(self):
        out = []
        for p in sorted(glob.glob(os.path.join(self.photos, "*.*")), reverse=True):
            if p.endswith((".json", ".thumb.jpg")):
                continue
            base = os.path.splitext(p)[0]
            info = {}
            try:
                with open(base + ".json", encoding="utf-8") as f:
                    info = json.load(f)
            except Exception:
                pass
            info.update(file=os.path.basename(p), size=os.path.getsize(p), mtime=int(os.path.getmtime(p)),
                        thumb=os.path.basename(base + ".thumb.jpg") if os.path.isfile(base + ".thumb.jpg") else None)
            out.append(info)
        return out

    def photo_path(self, name):
        name = os.path.basename(name or "")
        return os.path.join(self.photos, name) if re.match(r"^[\w.\-]+$", name) else None

    def photo_delete(self, name):
        p = self.photo_path(name)
        if not p:
            return False
        base = os.path.splitext(p)[0]
        for f in (p, base + ".json", base + ".thumb.jpg"):
            try:
                os.remove(f)
            except OSError:
                pass
        return True

    def video_save(self, name, data):
        """Montage ou export envoye par l'appli."""
        nm = slug(os.path.splitext(name or "montage")[0])
        ext = ".mp4" if (name or "").lower().endswith(".mp4") else ".webm"
        out = os.path.join(self.folder, time.strftime("%Y-%m-%d_%H-%M-%S") + "_" + nm + ext)
        with open(out, "wb") as f:
            f.write(data)
        with open(os.path.splitext(out)[0] + ".json", "w", encoding="utf-8") as f:
            json.dump({"kind": "montage", "start": int(time.time()), "car": nm, "tele": []}, f)
        if ext == ".mp4":
            self.run(["-y", "-loglevel", "error", "-ss", "1", "-i", out, "-frames:v", "1", "-vf", "scale=480:-2", os.path.splitext(out)[0] + ".jpg"], 30)
        return os.path.basename(out)

    # ------------------------------------------------------------ bibliotheque
    def list(self):
        out = []
        for p in sorted(glob.glob(os.path.join(self.folder, "*.mp4")) + glob.glob(os.path.join(self.folder, "*.webm")), key=os.path.getmtime, reverse=True):
            base = os.path.splitext(p)[0]
            info = {}
            try:
                with open(base + ".json", encoding="utf-8") as f:
                    info = json.load(f)
            except Exception:
                pass
            info.pop("tele", None)
            info.update(file=os.path.basename(p), size=os.path.getsize(p), thumb=os.path.isfile(base + ".jpg"),
                        mtime=int(os.path.getmtime(p)))
            if self.rec and self.rec["path"] == p:
                info["recording"] = True
            out.append(info)
        return out

    def safe(self, name):
        name = os.path.basename(name or "")
        return os.path.join(self.folder, name) if re.match(r"^[\w.\-]+$", name) else None

    def delete(self, name):
        p = self.safe(name)
        if not p or (self.rec and self.rec["path"] == p):
            return False
        for ext in (".mp4", ".webm", ".json", ".jpg"):
            try:
                os.remove(os.path.splitext(p)[0] + ext)
            except OSError:
                pass
        return True

    def set_offset(self, name, offset):
        p = self.safe(name)
        if not p:
            return False
        j = os.path.splitext(p)[0] + ".json"
        try:
            with open(j, encoding="utf-8") as f:
                info = json.load(f)
            info["offset"] = float(offset)
            with open(j, "w", encoding="utf-8") as f:
                json.dump(info, f, ensure_ascii=False, separators=(",", ":"))
            return True
        except Exception:
            return False

    def status(self):
        rec, buf = self.rec, self.buf
        cur = rec or buf or {}
        return {"fpsNow": cur.get("fpsNow"), "ffmpeg": self.ffmpeg, "installing": getattr(self, "installing", None), "recording": bool(rec), "recFor": round(time.time() - rec["spawned"], 1) if rec else 0,
                "buffering": bool(buf), "bufferSec": self.cfg["bufferSec"], "lastFile": self.last_file, "error": self.error,
                "lastClipAt": self.last_clip_at, "cfg": self.cfg, "log": self.log[-8:],
                "pipes": [{"id": p[0], "label": p[1]} for p in PIPES if (p[2] == "test") != WIN], "probe": self.probe_cache}

    def small(self):
        st = self.rec or self.buf or {}
        return {"snapAt": self.last_snap_at, "on": bool(self.rec), "buf": bool(self.buf), "fps": st.get("fpsNow"), "clipAt": self.last_clip_at,
                "t": round(time.time() - self.rec["spawned"]) if self.rec else 0}

    def shutdown(self):
        if self.rec:
            self.rec_stop()
        self.buffer_stop()
