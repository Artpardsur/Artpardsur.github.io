# -*- coding: utf-8 -*-
"""Сборка аудио для сайта-портфолио:
- mp3-источники копируются как есть, wav/ogg пережимаются в mp3 (V2 ~190kbps)
- для каждого файла считается форма волны (110 столбиков) и длительность
- результат: audio/music/*.mp3, audio/sfx/*.mp3, data/peaks.js
"""
import os, shutil, struct, subprocess, sys, json

# ffmpeg: переменная окружения FFMPEG, иначе D:\ffmpeg (на этой машине его нет в PATH), иначе PATH
FFMPEG = os.environ.get("FFMPEG") or (
    r"D:\ffmpeg\bin\ffmpeg.exe" if os.path.exists(r"D:\ffmpeg\bin\ffmpeg.exe") else "ffmpeg")
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMP = r"D:\Портфолио композитора"
SND = r"D:\Портфолио саунд-дизайнера"

MUSIC = {
    "ch-welcome": r"Чернобыль Зона смерти\Добро пожаловать в Зону!.mp3",
    # исходники не сохранились: вырезаны из записи плейлиста альбома (24.10.2026, +3 дБ)
    "ch-journey": r"Чернобыль Зона смерти\Путешествие в иное время (из записи).mp3",
    "ch-lost": r"Чернобыль Зона смерти\Растерянность (из записи).mp3",
    "ch-back": r"Чернобыль Зона смерти\Обратно в советы (из записи).mp3",
    "gr-trailer": r"Грехопадение\Музыка для трейлера.mp3",
    "gr-memories": r"Грехопадение\Воспоминания.mp3",
    "gr-november": r"Грехопадение\Ноябрьское-утро.mp3",
    "gr-evening": r"Грехопадение\Уютный вечер.mp3",
    "gr-exit": r"Грехопадение\Аварийный выход (финальная версия).mp3",
    "gr-interrogation": r"Грехопадение\Допрос с пристрастием.mp3",
    "gr-shiver": r"Грехопадение\Дрожь.wav",
    "gr-despair": r"Грехопадение\Безысходность\Безысходность.wav",
    "gr-anxiety": r"Грехопадение\Тревога и безысходность\Биение-с-басами.mp3",
    "gr-winds": r"Грехопадение\Ветра перемен\Тестовое задание 1.mp3",
    "hg-frozen": r"Howl Growl\Замёрзшие воспоминания\Замёрзшие воспоминания.mp3",
    "hg-frozen-slowed": r"Howl Growl\Замёрзшие воспоминания\Замёрзшие воспоминания (замедленная).wav",
    "par-lonely": r"Paraselene\i_am_so_lonely.mp3",
    "al-menu": r"Альфа В мире животных\menu theme.ogg",
    "al-dreams": r"Альфа В мире животных\dreams_of_girls.ogg",
    "al-joyful": r"Альфа В мире животных\joyful_sadness.ogg",
    "al-dance": r"Альфа В мире животных\dance_music\dance_music_0%.ogg",
    "al-runner": r"Альфа В мире животных\runnerboy\Runner boy (full).mp3",
    "al-lazy": r"Альфа В мире животных\lazy_fun\lazy_fun.ogg",
    "al-katya": r"Альфа В мире животных\katya\katya.ogg",
    "al-katya-thr": r"Альфа В мире животных\katya\katya_threatening.ogg",
    "al-katya-sad": r"Альфа В мире животных\katya\katya_sad.ogg",
    "al-dita1": r"Альфа В мире животных\dita\dita1.ogg",
    "al-dita": r"Альфа В мире животных\dita\dita2.ogg",
    "al-taisiya1": r"Альфа В мире животных\taisiya\taisiya1.ogg",
    "al-taisiya": r"Альфа В мире животных\taisiya\taisiya2.ogg",
    "va-funny": r"Valonabang\funny_hh_jazz\funny_hh_jazz.mp3",
    "va-hhj1": r"Valonabang\hip_hop_jazz\hip_hop_jazz1.mp3",
    "va-lofi": r"Valonabang\lo-fi\simple_lo-fi.mp3",
    "va-lofihh": r"Valonabang\lo-fi_hip-hop\lo-fi_hip-hop.mp3",
    "va-dubstep": r"Valonabang\dubstep\dubstep3.mp3",
    "zm-fairy": r"Заоблачный мир\Forward to the fairy tale.mp3",
    "zm-first": r"Заоблачный мир\The first one.mp3",
    "he-minor": r"Империя Хэлл\Минорный вой.mp3",
    "he-overdrive": r"Империя Хэлл\С перегрузом.mp3",
    "les-winter": r"Лес помнит имена\The_darkest_winter.mp3",
    "aoh-3": r"Age of Heroes\Age of Heroes 3.mp3",
    "nw-menu": r"Project Z\menu.mp3",
    "nw-theme4": r"Project Z\test4.mp3",
    "kw-requiem": r"Kwork\Requiem for Hope.wav",
    "kw-whisper": r"Kwork\Whisper of fear.wav",
    "kw-haise": r"Kwork\for Haise993.mp3",
    # финальные версии заказов Kwork (30.08), а не черновики из рабочей папки
    "kw-sunny": r"Kwork\Solar Commotion.wav",
    "kw-steel": r"Kwork\Steel will.wav",
    "ln-1": r"like Little Nightmares\1 (full).mp3",
    "ln-1-1": r"like Little Nightmares\1-1 (full).mp3",
    "ln-2": r"like Little Nightmares\2 (full).mp3",
    "ln-3": r"like Little Nightmares\3.mp3",
}

SFX = {
    "god-backstreet": r"Визуальна новелла -С нами G.O.D.-\ambience\a_backstreet.mp3",
    "god-crowd": r"Визуальна новелла -С нами G.O.D.-\ambience\crowd1.mp3",
    "god-stroika": r"Визуальна новелла -С нами G.O.D.-\ambience\stroika.mp3",
    "god-gunshot": r"Визуальна новелла -С нами G.O.D.-\sfx\gun_shot.mp3",
    "god-door": r"Визуальна новелла -С нами G.O.D.-\sfx\closedoor.mp3",
    "god-bottle": r"Визуальна новелла -С нами G.O.D.-\sfx\bottle.mp3",
    "god-pc": r"Визуальна новелла -С нами G.O.D.-\sfx\pc_on.wav",
    "god-knives": r"Визуальна новелла -С нами G.O.D.-\sfx\knives.mp3",
    "par-water": r"Визуальная новелла Paraselene\sound\001 Dripping water.wav",
    "par-door": r"Визуальная новелла Paraselene\sound\002 Open the door.wav",
    "par-prison": r"Визуальная новелла Paraselene\sound\005 Prison closure.wav",
    "par-knock": r"Визуальная новелла Paraselene\sound\008 Кnock knock.wav",
    "par-wind": r"Визуальная новелла Paraselene\sound\010 WindHowl.wav",
    "par-thunder": r"Визуальная новелла Paraselene\thunder1.ogg",
    "par-steps": r"Визуальная новелла Paraselene\sound\steps\001 Guard step.wav",
    "par-whisper": r"Визуальная новелла Paraselene\sound\voice\001 Whisper chatter.wav",
    "grs-book": r"Визуальная новелла -Грехопадение-\book.mp3",
    "grs-print": r"Визуальная новелла -Грехопадение-\printing.mp3",
    "grs-door": r"Визуальная новелла -Грехопадение-\opendoor.mp3",
    "grs-crane": r"Визуальная новелла -Грехопадение-\crane1.mp3",
    "grs-alcohol": r"Визуальная новелла -Грехопадение-\Звуки Грехопадение\alcohol.mp3",
    "grs-bandage": r"Визуальная новелла -Грехопадение-\Звуки Грехопадение\bandage.mp3",
    "grs-bush": r"Визуальная новелла -Грехопадение-\Звуки Грехопадение\bush1.mp3",
    "chs-alarm": r"Визуальная новелла -Сталкер- Зона смерти-\Звуки новеллы Сталкера\alarm1.mp3",
    "chs-bird": r"Визуальная новелла -Сталкер- Зона смерти-\Звуки новеллы Сталкера\bird3.mp3",
    "chs-breath": r"Визуальная новелла -Сталкер- Зона смерти-\Звуки новеллы Сталкера\breathing1.mp3",
    "chs-click": r"Визуальная новелла -Сталкер- Зона смерти-\Звуки меню Сталкера\menu-button-click-1.wav",
    "chs-select": r"Визуальная новелла -Сталкер- Зона смерти-\Звуки меню Сталкера\menu-button-select-1.wav",
    "ap-park": r"Визуальная новелла at 11 p.m\Заказ 1\park.wav",
    "ap-cinema": r"Визуальная новелла at 11 p.m\Заказ 1\cinema.wav",
    "ap-house": r"Визуальная новелла at 11 p.m\Заказ 1\at_the_house.wav",
    "ap-accident": r"Визуальная новелла at 11 p.m\Заказ 2\accident.wav",
    "ap-cardoor": r"Визуальная новелла at 11 p.m\Заказ 2\звуки машины отдельно\car_door.wav",
    "ap-steps": r"Визуальная новелла at 11 p.m\Заказ 2\steps.wav",
    "hgs-breath": r"Визуальная новелла -Howl Growl-\HowlGrowlmaster\game\audio\breath.mp3",
    "hgs-blanket": r"Визуальная новелла -Howl Growl-\HowlGrowlmaster\game\audio\blanket.mp3",
    "hgs-noise": r"Визуальная новелла -Howl Growl-\HowlGrowlmaster\game\audio\noise.mp3",
    "hgs-shine": r"Визуальная новелла -Howl Growl-\HowlGrowlmaster\game\audio\shine.mp3",
    "als-jump": r"Визуальная новелла Альфа_ В мире животных\sounds\1_jump\jump (1).wav",
    "als-slide": r"Визуальная новелла Альфа_ В мире животных\sounds\2_slide\slide (1).wav",
    "als-fall": r"Визуальная новелла Альфа_ В мире животных\sounds\5_fall\fall1.wav",
    "als-collision": r"Визуальная новелла Альфа_ В мире животных\sounds\7_collision\collision.wav",
    "als-gameover": r"Визуальная новелла Альфа_ В мире животных\sounds\8_game_over\game_over1.wav",
}

# Треки заказов 2026 года: исходники лежат в рабочей папке Music на рабочем столе.
# Всегда пережимаются (а не копируются) и без тегов: в тегах исходников бывают
# имена заказчиков и рабочие названия.
WORK = r"C:\Users\home\Desktop\Music"
MUSIC_2026 = {
    # Фриланс: заказ в духе souls-like
    "sl-box": r"Заказ_ЭдКот\финал\Maria — 1. Шкатулка.mp3",
    "sl-waltz": r"Заказ_ЭдКот\финал\Maria — 2. Вальс.mp3",
    "sl-boss": r"Заказ_ЭдКот\финал\Maria — 3. Босс.mp3",
    # Фриланс: марш для NWGS (в тегах исходника служебные пометки — поэтому пережимаем)
    "fr-cyber-march": r"D:\Портфолио композитора\Generation Z - Егор - NWGS\Cybersteel Battalion March.mp3",
    # ВГИК-Дебют
    "vg-forest-rain": r"Минкультура\Наброски\Тема леса — вариант 1 «Дождь» — как в аниматике.mp3",
    "vg-forest-russian": r"Минкультура\Наброски\Тема леса — вариант 2 «Русская» — светлая попевка.mp3",
    "vg-forest-song": r"Минкультура\Наброски\Тема леса — вариант 3 «Песня» — напевная.mp3",
    "vg-forest-mystery": r"Минкультура\Наброски\Тема леса — вариант 4 «Тайна» — таинственный лес.mp3",
    "vg-forest-waltz": r"Минкультура\Наброски\Тема леса — вариант 5 «Вальс под дождём».mp3",
    "vg-oak-piano": r"Минкультура\Наброски\Архив — первые наброски 13.09\01 Дуб — вариант 1, фортепиано.mp3",
    "vg-oak-strings": r"Минкультура\Наброски\Архив — первые наброски 13.09\02 Дуб — вариант 2, струнные.mp3",
    "vg-oak-krylov": r"Минкультура\Наброски\Архив — первые наброски 13.09\03 Дуб — вариант 3, эпоха Крылова.mp3",
    "vg-suite": r"Минкультура\Наброски\Архив — набросок 2 (02.10)\Русская литература — набросок 2, музыка ко всему аниматику.mp3",
    # Проклятый удачей (папка «Заказ_брейккор»)
    "cl-lull": r"D:\Портфолио композитора\Проклятый Удачей\Затишье.mp3",
    "cl-day": r"D:\Портфолио композитора\Проклятый Удачей\Город_день.mp3",
    "cl-evening": r"D:\Портфолио композитора\Проклятый Удачей\Город_вечер.mp3",
    "cl-rain": r"D:\Портфолио композитора\Проклятый Удачей\Город_дождь.mp3",
    "cl-god": r"Заказ_брейккор\Пространство_Бога\Пространство Бога.mp3",
    "cl-god-bad": r"Заказ_брейккор\Пространство_Бога\Пространство Бога (плохая концовка).mp3",
    "cl-hero-anti": r"Заказ_брейккор\Тема_героя\Герой — антипрайм.mp3",
    "cl-hero-flex": r"Заказ_брейккор\Тема_героя\Герой — флекс.mp3",
    "cl-hero-dice": r"Заказ_брейккор\Тема_героя\Герой — бросок кубика.mp3",
    # Иди через лес (папка «Заказ_Тайга»)
    "st-snowdrop": r"Заказ_Тайга\Тайга — станция Подснежник.mp3",
    "st-blueberry": r"Заказ_Тайга\Черничная поляна\Черничная поляна.mp3",
    "st-night-tracks": r"Заказ_Тайга\Ночной лес\Ночной лес — вариант 1 «Следы».mp3",
    "st-night-someone": r"Заказ_Тайга\Ночной лес\Ночной лес — вариант 2 «Кто-то ходит».mp3",
    # Скрытая плоть (папка «Заказ_Пёс»)
    "sf-caves": r"Заказ_Пёс\Редакция 2\1А_Оркестр_на_дне_пещер.mp3",
    "sf-ode": r"Заказ_Пёс\Редакция 2\1Б_Древняя_ода.mp3",
    "sf-town": r"Заказ_Пёс\Редакция 2\1В_Городок.mp3",
    "sf-march": r"Заказ_Пёс\Редакция 2\2А_Трупохранилище_марш.mp3",
    "sf-parliament": r"Заказ_Пёс\Редакция 2\3А_Парламент.mp3",
    "sf-fenrir-hall": r"Заказ_Пёс\Редакция 4\3Б_Зал_Фенрира.mp3",
    "sf-shelter": r"Заказ_Пёс\Редакция 4\4А_Приют_коридоры.mp3",
    "sf-office": r"Заказ_Пёс\Редакция 4\4Б_Кабинет_психолога.mp3",
    "sf-aniko": r"Заказ_Пёс\Редакция 4\4В_Комната_Анико.mp3",
    "sf-fenrir": r"Заказ_Пёс\Редакция 5\Фенрир_тема.mp3",
    "sf-overture": r"Заказ_Пёс\Фанфары и увертюра\4_Увертюра.mp3",
}

N_BUCKETS = 110


def transcode(src, dst):
    """Пережать в mp3 V2 без тегов и обложек."""
    r = subprocess.run(
        [FFMPEG, "-y", "-v", "error", "-i", src, "-map", "0:a", "-map_metadata", "-1",
         "-codec:a", "libmp3lame", "-q:a", "2", dst],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg failed for %s: %s" % (src, r.stderr[-500:]))


def convert(src, dst):
    """mp3 копируем как есть, остальное жмём в mp3 V2."""
    if src.lower().endswith(".mp3"):
        shutil.copy2(src, dst)
    else:
        r = subprocess.run(
            [FFMPEG, "-y", "-v", "error", "-i", src, "-codec:a", "libmp3lame", "-q:a", "2", dst],
            capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError("ffmpeg failed for %s: %s" % (src, r.stderr[-500:]))


def peaks_and_dur(path):
    """Декодируем в моно 8кГц s16 и считаем пики по N_BUCKETS корзинам."""
    r = subprocess.run(
        [FFMPEG, "-v", "error", "-i", path, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
        capture_output=True)
    if r.returncode != 0:
        raise RuntimeError("decode failed for %s" % path)
    data = r.stdout
    n = len(data) // 2
    if n == 0:
        return [0.0] * N_BUCKETS, 0.0
    samples = struct.unpack("<%dh" % n, data[: n * 2])
    dur = n / 8000.0
    bucket = max(1, n // N_BUCKETS)
    peaks = []
    for i in range(N_BUCKETS):
        chunk = samples[i * bucket: (i + 1) * bucket]
        peaks.append(max(abs(s) for s in chunk) if chunk else 0)
    mx = max(peaks) or 1
    return [round(p / mx, 3) for p in peaks], round(dur, 1)


def main():
    music_dir = os.path.join(SITE, "audio", "music")
    sfx_dir = os.path.join(SITE, "audio", "sfx")
    os.makedirs(music_dir, exist_ok=True)
    os.makedirs(sfx_dir, exist_ok=True)

    all_peaks, all_durs, errors = {}, {}, []
    out = os.path.join(SITE, "data", "peaks.js")

    jobs = [(tid, os.path.join(COMP, rel), os.path.join(music_dir, tid + ".mp3")) for tid, rel in MUSIC.items()]
    jobs += [(sid, os.path.join(SND, rel), os.path.join(sfx_dir, sid + ".mp3")) for sid, rel in SFX.items()]
    # трек для «Лабиринта грёз» лежит отдельно
    jobs.append(("lab-glade", r"C:\Users\home\Desktop\The Glade of Reflections.mp3",
                 os.path.join(music_dir, "lab-glade.mp3")))
    fresh = set(MUSIC_2026)
    jobs += [(tid, os.path.join(WORK, rel), os.path.join(music_dir, tid + ".mp3")) for tid, rel in MUSIC_2026.items()]

    # --only id1,id2 (или --only 2026 — все треки MUSIC_2026): собрать только эти,
    # остальные формы волн взять из готового peaks.js
    if "--only" in sys.argv:
        arg = sys.argv[sys.argv.index("--only") + 1]
        want = fresh if arg == "2026" else set(arg.split(","))
        jobs = [j for j in jobs if j[0] in want]
        with open(out, encoding="utf-8") as f:
            text = f.read()
        all_peaks = json.loads(text.split("window.PEAKS = ", 1)[1].split(";\n", 1)[0])
        all_durs = json.loads(text.split("window.DURS = ", 1)[1].split(";\n", 1)[0])

    for tid, src, dst in jobs:
        if not os.path.exists(src):
            errors.append("MISSING: " + src)
            continue
        try:
            if tid in fresh:
                transcode(src, dst)
            else:
                convert(src, dst)
            p, d = peaks_and_dur(dst)
            all_peaks[tid] = p
            all_durs[tid] = d
            print("OK %-18s %5.1fs" % (tid, d))
        except Exception as e:
            errors.append("FAIL %s: %s" % (tid, e))

    with open(out, "w", encoding="utf-8") as f:
        f.write("/* Автосгенерировано build_audio.py: формы волн и длительности треков. */\n")
        f.write("window.PEAKS = " + json.dumps(all_peaks, separators=(",", ":")) + ";\n")
        f.write("window.DURS = " + json.dumps(all_durs, separators=(",", ":")) + ";\n")

    total_mb = 0
    for root, _, files in os.walk(os.path.join(SITE, "audio")):
        for fn in files:
            total_mb += os.path.getsize(os.path.join(root, fn))
    print("\nTOTAL audio: %.1f MB, tracks: %d" % (total_mb / 1e6, len(all_peaks)))
    if errors:
        print("\nERRORS:")
        for e in errors:
            print(" ", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
