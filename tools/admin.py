# -*- coding: utf-8 -*-
"""Локальный редактор сайта.

Запуск:  python tools/admin.py     →  редактор:  http://localhost:8138/admin/
                                      сам сайт:  http://localhost:8138/

Что умеет:
  • править названия, описания, теги, картинки и ссылки у проектов,
    композиций и звуков — и сохранять их прямо в data/content.js;
  • загружать новые картинки в media/ и аудио в audio/music, audio/sfx;
  • пересчитывать форму волны (её считает браузер) в data/peaks.js;
  • показывать статус git и делать commit/push одной кнопкой.

Ничего не устанавливается: только стандартная библиотека Python.
"""
import base64
import io
import json
import os
import re
import subprocess
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from serve import RangeHandler  # тот же обработчик Range, что и у tools/serve.py

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADMIN_DIR = os.path.join(ROOT, "tools", "admin")
CONTENT_JS = os.path.join(ROOT, "data", "content.js")
PEAKS_JS = os.path.join(ROOT, "data", "peaks.js")

UPLOAD_DIRS = {"media": "media", "music": "audio/music", "sfx": "audio/sfx"}
MEDIA_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm"}
AUDIO_EXT = {".mp3", ".ogg", ".wav", ".m4a"}

CONTENT_HEADER = """/* ============================================================
   ДАННЫЕ САЙТА. Файл можно править руками или через локальный
   редактор:  python tools/admin.py  →  http://localhost:8138/admin/
   — треки: title (названия), genres (жанры), moods (настроения)
   — проекты: desc (описания), links (ссылки), media (картинка/видео)
   Жанры: orchestral, ambient, dark, electronic, lofi, jazz, rock
   Настроения: calm, sad, happy, tense, epic, cozy
   ============================================================ */
"""

# ---------------------------------------------------------------- сериализация


def js_str(s):
    """Строка в кавычках: по возможности одинарных, как в остальном файле."""
    s = "" if s is None else str(s)
    s = s.replace("\\", "\\\\").replace("\r", "").replace("\n", "\\n")
    if "'" in s and '"' not in s:
        return '"' + s + '"'
    return "'" + s.replace("'", "\\'") + "'"


def js_val(v):
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        return js_str(v)
    if isinstance(v, list):
        return "[" + ", ".join(js_val(x) for x in v) + "]"
    if isinstance(v, dict):
        if not v:
            return "{}"
        return "{ " + ", ".join("%s: %s" % (js_key(k), js_val(x)) for k, x in v.items()) + " }"
    raise TypeError("нельзя записать значение: %r" % (v,))


def js_key(k):
    return k if re.match(r"^[A-Za-z_$][A-Za-z0-9_$]*$", k) else js_str(k)


def obj_line(d, order):
    """Объект в одну строку с заданным порядком ключей."""
    keys = [k for k in order if k in d] + [k for k in d if k not in order]
    return "{ " + ", ".join("%s: %s" % (js_key(k), js_val(d[k])) for k in keys) + " }"


PROJECT_ORDER = ["id", "media", "mediaContain", "cover", "featureMedia", "videoSoon", "name", "type", "roles",
                 "status", "started", "updated", "desc", "links"]

# Разделы content.js после таймлайна: пишутся как есть, со своими пояснениями
EXTRA_BLOCKS = [
    ("announce", "АНОНС: отсчёт на главной. date — момент анонса с часовым поясом,\n"
                 "     latest — последняя публикация на itch.io (null — не показывать)"),
    ("now", "СТАТУС: строка «чем занят сейчас» (пусто — блок скрыт)"),
    ("updates", "ОБНОВЛЕНИЯ САЙТА: последние сверху, показываются первые 4"),
    ("code", "КОД И МОДЫ: featured — id проектов для большой карточки, mods — моды"),
]
TRACK_ORDER = ["id", "project", "file", "title", "genres", "moods", "year"]
SFX_ITEM_ORDER = ["id", "file", "icon", "name"]
CONTACT_ORDER = ["id", "icon", "value", "url", "copy"]


def block_val(v, indent):
    """Списки и объекты верхнего уровня — по элементу на строку, вложенное — в строку."""
    inner = indent + "  "
    if isinstance(v, list) and any(isinstance(x, (list, dict)) for x in v):
        return "[\n" + "".join(inner + block_val(x, inner) + ",\n" for x in v) + indent + "]"
    if isinstance(v, dict) and v and any(isinstance(x, (list, dict)) for x in v.values()):
        return "{\n" + "".join("%s%s: %s,\n" % (inner, js_key(k), block_val(x, inner))
                               for k, x in v.items()) + indent + "}"
    return js_val(v)


def project_block(p):
    out = ["    {"]
    keys = [k for k in PROJECT_ORDER if k in p] + [k for k in p if k not in PROJECT_ORDER]
    for k in keys:
        v = p[k]
        if k == "desc" and isinstance(v, dict):
            out.append("      desc: {")
            for lang, text in v.items():
                if str(text).strip():
                    out.append("        %s: %s," % (js_key(lang), js_str(text)))
            out.append("      },")
        elif k == "links" and isinstance(v, list):
            if not v:
                out.append("      links: [],")
                continue
            out.append("      links: [")
            for l in v:
                out.append("        { label: %s, url: %s }," % (js_str(l.get("label", "")), js_str(l.get("url", ""))))
            out.append("      ],")
        elif k == "name" and isinstance(v, dict):
            clean = {lang: t for lang, t in v.items() if str(t).strip()}
            out.append("      name: %s," % js_val(clean))
        else:
            out.append("      %s: %s," % (js_key(k), js_val(v)))
    out.append("    },")
    return "\n".join(out)


def clean_lang_map(d):
    return {k: v for k, v in (d or {}).items() if str(v).strip()}


def serialize_content(c):
    L = [CONTENT_HEADER, "window.CONTENT = {", ""]
    L.append("  genres: %s," % js_val(c.get("genres", [])))
    L.append("  moods: %s," % js_val(c.get("moods", [])))
    if c.get("stats") is not None:
        st = {k: int(c["stats"].get(k) or 0) for k in ("projects", "tracks", "sounds")}
        L.append("")
        L.append("  /* Цифры для блока статистики. 0 — посчитать по спискам ниже,")
        L.append("     иначе показывается это число (звуков сделано больше, чем выложено). */")
        L.append("  stats: %s," % js_val(st))
    L.append("")

    L.append("  /* ---------------- ПРОЕКТЫ ---------------- */")
    L.append("  projects: [")
    for p in c.get("projects", []):
        p = dict(p)
        p["name"] = clean_lang_map(p.get("name"))
        p["desc"] = clean_lang_map(p.get("desc"))
        for k in ("media", "cover", "featureMedia"):
            if not p.get(k):
                p.pop(k, None)
        for k in ("mediaContain", "videoSoon"):
            if not p.get(k):
                p.pop(k, None)
        L.append(project_block(p))
    L.append("  ],")
    L.append("")

    L.append("  /* ---------------- ТРЕКИ ---------------- */")
    L.append("  tracks: [")
    for t in c.get("tracks", []):
        t = dict(t)
        t["title"] = clean_lang_map(t.get("title"))
        if not t.get("project"):
            t["project"] = None
        if not t.get("year"):
            t.pop("year", None)
        L.append("    %s," % obj_line(t, TRACK_ORDER))
    L.append("  ],")
    L.append("")

    L.append("  /* ---------------- ЗВУКИ ---------------- */")
    L.append("  sfx: [")
    for g in c.get("sfx", []):
        L.append("    {")
        L.append("      project: %s," % js_str(g.get("project", "")))
        L.append("      items: [")
        for it in g.get("items", []):
            it = dict(it)
            it["name"] = clean_lang_map(it.get("name"))
            L.append("        %s," % obj_line(it, SFX_ITEM_ORDER))
        L.append("      ],")
        L.append("    },")
    L.append("  ],")
    L.append("")

    L.append("  /* ---------------- КОНТАКТЫ ---------------- */")
    L.append("  contacts: [")
    for ct in c.get("contacts", []):
        L.append("    %s," % obj_line(ct, CONTACT_ORDER))
    L.append("  ],")
    L.append("")

    L.append("  /* ---------------- ТАЙМЛАЙН ---------------- */")
    L.append("  timeline: [")
    for tl in c.get("timeline", []):
        L.append("    %s," % obj_line(tl, ["year", "key"]))
    L.append("  ],")

    for key, comment in EXTRA_BLOCKS:
        if key not in c:
            continue
        L.append("")
        L.append("  /* ---------------- %s ---------------- */" % comment)
        L.append("  %s: %s," % (key, block_val(c[key], "  ")))
    L.append("};")
    L.append("")
    return "\n".join(L)


def serialize_peaks(peaks, durs):
    def compact(d):
        return json.dumps(d, separators=(",", ":"), ensure_ascii=False)
    return ("/* Автосгенерировано build_audio.py / tools/admin.py: "
            "формы волн и длительности треков. */\n"
            "window.PEAKS = " + compact(peaks) + ";\n"
            "window.DURS = " + compact(durs) + ";\n")


def write_atomic(path, text):
    tmp = path + ".tmp"
    with io.open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, path)


def git(args, timeout=90):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    try:
        r = subprocess.run(["git"] + args, cwd=ROOT, capture_output=True,
                           text=True, encoding="utf-8", errors="replace",
                           timeout=timeout, env=env)
        return {"code": r.returncode, "out": (r.stdout or "") + (r.stderr or "")}
    except subprocess.TimeoutExpired:
        return {"code": -1, "out": "git не ответил за %d с — возможно, ждёт логин/пароль.\n"
                                   "Сделай push вручную в VS Code." % timeout}
    except FileNotFoundError:
        return {"code": -1, "out": "git не найден в PATH"}


# ---------------------------------------------------------------- HTTP


class Handler(RangeHandler):
    """Раздаёт сайт (с поддержкой перемотки аудио) + API редактора."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ---- ответы

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n).decode("utf-8")) if n else {}

    # ---- маршруты

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/admin", "/admin/"):
            return self.send_file(os.path.join(ADMIN_DIR, "index.html"), "text/html; charset=utf-8")
        if path.startswith("/admin/"):
            name = os.path.basename(path)
            full = os.path.join(ADMIN_DIR, name)
            if os.path.isfile(full):
                ctype = "text/css; charset=utf-8" if name.endswith(".css") else "application/javascript; charset=utf-8"
                return self.send_file(full, ctype)
            self.send_error(404)
            return None
        if path == "/api/files":
            return self.api_files()
        if path == "/api/git":
            return self.api_git_status()
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            if path == "/api/content":
                return self.api_save_content()
            if path == "/api/peaks":
                return self.api_save_peaks()
            if path == "/api/upload":
                return self.api_upload()
            if path == "/api/git/commit":
                return self.api_git_commit()
            if path == "/api/git/push":
                return self.api_git_push()
        except Exception as e:  # чтобы редактор показал причину, а не «сломалось»
            return self.send_json({"ok": False, "error": "%s: %s" % (type(e).__name__, e)}, 500)
        self.send_error(404)

    def send_file(self, full, ctype):
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ---- API

    def api_files(self):
        from urllib.parse import parse_qs, urlparse
        q = parse_qs(urlparse(self.path).query)
        key = (q.get("dir") or ["media"])[0]
        rel = UPLOAD_DIRS.get(key)
        if not rel:
            return self.send_json({"ok": False, "error": "неизвестная папка"}, 400)
        full = os.path.join(ROOT, rel.replace("/", os.sep))
        names = sorted(os.listdir(full)) if os.path.isdir(full) else []
        return self.send_json({"ok": True, "dir": rel, "files": [rel + "/" + n for n in names]})

    def api_save_content(self):
        data = self.read_json()
        content = data.get("content")
        if not isinstance(content, dict) or "tracks" not in content:
            return self.send_json({"ok": False, "error": "пустые или неполные данные"}, 400)
        text = serialize_content(content)
        write_atomic(CONTENT_JS, text)
        return self.send_json({"ok": True, "bytes": len(text.encode("utf-8"))})

    def api_save_peaks(self):
        data = self.read_json()
        peaks = data.get("peaks") or {}
        durs = data.get("durs") or {}
        if not peaks:
            return self.send_json({"ok": False, "error": "нет данных о форме волны"}, 400)
        write_atomic(PEAKS_JS, serialize_peaks(peaks, durs))
        return self.send_json({"ok": True, "count": len(peaks)})

    def api_upload(self):
        data = self.read_json()
        key = data.get("dir")
        rel = UPLOAD_DIRS.get(key)
        if not rel:
            return self.send_json({"ok": False, "error": "неизвестная папка"}, 400)
        name = os.path.basename(data.get("name") or "")
        name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-")
        ext = os.path.splitext(name)[1].lower()
        allowed = MEDIA_EXT if key == "media" else AUDIO_EXT
        if not name or ext not in allowed:
            return self.send_json({"ok": False, "error": "недопустимое имя файла: " + (name or "пусто")}, 400)
        raw = base64.b64decode((data.get("data") or "").split(",")[-1])
        folder = os.path.join(ROOT, rel.replace("/", os.sep))
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, name), "wb") as f:
            f.write(raw)
        return self.send_json({"ok": True, "path": rel + "/" + name, "bytes": len(raw)})

    def api_git_status(self):
        branch = git(["rev-parse", "--abbrev-ref", "HEAD"])
        status = git(["status", "--porcelain"])
        remote = git(["remote", "get-url", "origin"])
        return self.send_json({
            "ok": True,
            "branch": branch["out"].strip(),
            "remote": remote["out"].strip(),
            "changes": [l for l in status["out"].splitlines() if l.strip()],
        })

    def api_git_commit(self):
        data = self.read_json()
        msg = (data.get("message") or "").strip() or "Обновление контента через локальный редактор"
        add = git(["add", "-A"])
        if add["code"] != 0:
            return self.send_json({"ok": False, "out": add["out"]})
        com = git(["commit", "-m", msg])
        return self.send_json({"ok": com["code"] == 0, "out": add["out"] + com["out"]})

    def api_git_push(self):
        r = git(["push"])
        return self.send_json({"ok": r["code"] == 0, "out": r["out"]})


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    port = int(args[0]) if args else 8138
    url = "http://localhost:%d/admin/" % port
    print("Редактор: %s" % url)
    print("Сайт:     http://localhost:%d/" % port)
    print("Закрыть это окно = остановить редактор.")
    if "--no-browser" not in sys.argv:
        # браузер открываем чуть позже, чтобы сервер успел подняться
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("Остановлено.")
    except OSError as e:
        print("Не удалось занять порт %d: %s" % (port, e))
        print("Похоже, редактор уже запущен — открой %s" % url)
        input("Нажми Enter, чтобы закрыть...")
