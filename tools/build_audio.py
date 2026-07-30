# -*- coding: utf-8 -*-
"""Сборка аудио для сайта-портфолио:
- mp3-источники копируются как есть, wav/ogg пережимаются в mp3 (V2 ~190kbps)
- для каждого файла считается форма волны (110 столбиков) и длительность
- результат: audio/music/*.mp3, audio/sfx/*.mp3, data/peaks.js
"""
import os, shutil, struct, subprocess, sys, json

# ffmpeg берётся из PATH; свой путь можно задать переменной окружения FFMPEG
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMP = r"D:\Портфолио композитора"
SND = r"D:\Портфолио саунд-дизайнера"

MUSIC = {
    "ch-welcome": r"Чернобыль Зона смерти\Добро пожаловать в Зону!.mp3",
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
    "al-dita": r"Альфа В мире животных\dita\dita2.ogg",
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

N_BUCKETS = 110


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

    jobs = [(tid, os.path.join(COMP, rel), os.path.join(music_dir, tid + ".mp3")) for tid, rel in MUSIC.items()]
    jobs += [(sid, os.path.join(SND, rel), os.path.join(sfx_dir, sid + ".mp3")) for sid, rel in SFX.items()]
    # трек для «Лабиринта грёз» лежит отдельно
    jobs.append(("lab-glade", r"C:\Users\home\Desktop\The Glade of Reflections.mp3",
                 os.path.join(music_dir, "lab-glade.mp3")))

    for tid, src, dst in jobs:
        if not os.path.exists(src):
            errors.append("MISSING: " + src)
            continue
        try:
            convert(src, dst)
            p, d = peaks_and_dur(dst)
            all_peaks[tid] = p
            all_durs[tid] = d
            print("OK %-18s %5.1fs" % (tid, d))
        except Exception as e:
            errors.append("FAIL %s: %s" % (tid, e))

    out = os.path.join(SITE, "data", "peaks.js")
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
