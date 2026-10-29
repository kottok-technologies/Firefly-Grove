"""Assemble the Play preview from actual, separately captured browser footage.

Requires Pillow, NumPy and FFmpeg. No game state, app files or saves are changed.
Capture files live in ignored artifacts/trailer/raw; see assets/store/TRAILER.md.
"""
import argparse
from functools import lru_cache
import json
from pathlib import Path
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "artifacts/trailer/raw"
OUT = ROOT / "artifacts"
W, H, FPS, LENGTH = 1080, 1920, 30, 25
CREAM, GREEN, MUTED = "#f7f8f2", "#23453c", "#687a65"
FONT_ROOT = Path("C:/Windows/Fonts")


def font(size, bold=False, serif=False):
    name = "georgia.ttf" if serif else "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(FONT_ROOT / name), size)


def centered(draw, y, text, face, fill):
    box = draw.textbbox((0, 0), text, font=face)
    draw.text(((W - box[2]) / 2, y - box[1]), text, font=face, fill=fill)


def smooth(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


capture = json.loads((RAW / "capture.json").read_text())
groups = {}
for index, item in enumerate(capture):
    groups.setdefault(item["scene"], []).append(index)

# Keep the genuine inputs and reveal frames; trim pauses between capture calls.
scenes = [
    (1.2, 3.4, groups["opening-board"][:10], "Find the hidden fireflies", "One per row, column, and color."),
    (3.4, 7.8, groups["cross-notes"][:12] + groups["cross-notes"][25:37] + groups["cross-notes"][50:63], "Tap to cross", "Make a note. Follow the clues."),
    (7.8, 10.8, groups["find-firefly"], "Double-tap to find", "A little glow for every discovery."),
    (10.8, 15.2, groups["hint-explanation"], "A little guidance", "Hints explain the reason behind the move."),
    (15.2, 17.2, groups["next-level"], "Keep your grove glowing", "Continue straight to your next puzzle."),
    (17.2, 23.4, groups["daily-challenge"][:8] + groups["daily-challenge"][14:], "Your daily little race", "A fresh 8 × 8 challenge every day."),
]


@lru_cache(maxsize=12)
def footage(index):
    image = Image.open(RAW / capture[index]["file"]).convert("RGB")
    # Observed app-shell bounds from the 1280 × 720 browser viewport.
    assert image.size == (1280, 720)
    return image.crop((400, 0, 880, 720)).resize((1020, 1530), Image.Resampling.LANCZOS)


icon = Image.open(ROOT / "assets/store/firefly-grove-icon-master.png").convert("RGB")
forest = icon.resize((W, H), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(50))
forest = Image.blend(forest, Image.new("RGB", (W, H), "#0a221c"), .52)
brand = forest.copy()
brand.paste(icon.resize((780, 780), Image.Resampling.LANCZOS), (150, 300))
draw = ImageDraw.Draw(brand)
centered(draw, 1200, "Firefly Grove", font(110, serif=True), "#fff3c9")
centered(draw, 1375, "A little logic. A little light.", font(48), "#e4e9cc")


def scene_frame(scene, time):
    start, end, indices, title, subtitle = scene
    p = max(0, min(1, (time - start) / (end - start)))
    position = p * (len(indices) - 1)
    low = int(position)
    high = min(low + 1, len(indices) - 1)
    # Temporal blending of real captured frames, not reconstructed gameplay.
    shot = Image.blend(footage(indices[low]), footage(indices[high]), position - low)
    image = Image.new("RGB", (W, H), CREAM)
    image.paste(shot, (30, 150))
    draw = ImageDraw.Draw(image)
    centered(draw, 40, "Firefly Grove", font(62, serif=True), GREEN)
    centered(draw, 118, "A LITTLE LOGIC. A LITTLE LIGHT.", font(22), MUTED)
    caption = Image.new("RGBA", (W, H))
    text = ImageDraw.Draw(caption)
    appear = smooth((time - start) / .22)
    y = round(1740 + 12 * (1 - appear))
    centered(text, y, title, font(55, bold=True), GREEN)
    centered(text, y + 85, subtitle, font(32), MUTED)
    if appear < 1:
        caption.putalpha(caption.getchannel("A").point(lambda value: round(value * appear)))
    image.paste(caption, (0, 0), caption)
    return image


def frame(time):
    if time < 1.2 or time >= 23.4:
        image = brand.copy()
        fade = smooth(time / .28) if time < 1.2 else smooth((LENGTH - time) / .45)
        return Image.blend(Image.new("RGB", (W, H), "#10291f"), image, fade)
    current = next(scene for scene in scenes if scene[0] <= time < scene[1])
    image = scene_frame(current, time)
    elapsed = time - current[0]
    if elapsed < .18:
        index = scenes.index(current)
        before = scene_frame(scenes[index - 1], scenes[index - 1][1] - .001) if index else brand
        image = Image.blend(before, image, smooth(elapsed / .18))
    return image


def soundtrack(path):
    """Original quiet ambient chords/chimes, synthesized without sampled music."""
    rate = 48000
    samples = np.arange(rate * LENGTH) / rate
    audio = np.zeros_like(samples)
    chords = [(48, 55, 59, 64), (45, 52, 55, 60), (41, 48, 52, 57), (43, 50, 55, 60)]
    for start, notes in zip((0, 6, 12, 18), chords):
        t = samples - start
        envelope = np.clip(t / 1.8, 0, 1) * np.clip((8 - t) / 2.5, 0, 1)
        envelope *= (t >= 0) & (t <= 8)
        for midi in notes:
            hz = 440 * 2 ** ((midi - 69) / 12)
            audio += .014 * envelope * (np.sin(2 * np.pi * hz * t) + .12 * np.sin(4 * np.pi * hz * t))
    for start, midi in [(1.2, 76), (3.4, 79), (7.8, 83), (10.8, 79), (15.2, 76), (17.2, 81), (20.3, 79), (23.4, 76)]:
        t = np.maximum(samples - start, 0)
        envelope = (samples >= start) * (1 - np.exp(-t * 35)) * np.exp(-t * 1.5)
        hz = 440 * 2 ** ((midi - 69) / 12)
        audio += .025 * envelope * (np.sin(2 * np.pi * hz * t) + .16 * np.sin(2 * np.pi * hz * 2 * t))
    audio *= 3 * np.clip(samples / .6, 0, 1) * np.clip((LENGTH - samples) / 1.3, 0, 1)
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    stereo = np.column_stack((pcm, pcm)).reshape(-1)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(stereo.tobytes())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg")
    args = parser.parse_args()
    if args.ffmpeg:
        ffmpeg = args.ffmpeg
    else:
        sys.path.insert(0, str(OUT / "media-tools"))
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    video = OUT / "FireflyGrove-play-preview.mp4"
    audio = OUT / "trailer/original-ambient.wav"
    soundtrack(audio)
    log = (OUT / "trailer/encode.log").open("w")
    command = [ffmpeg, "-y", "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", str(audio), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-t", str(LENGTH), "-movflags", "+faststart", "-metadata", "title=Firefly Grove — A little logic. A little light.", str(video)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
    stills = []
    try:
        for i in range(FPS * LENGTH):
            image = frame(i / FPS)
            process.stdin.write(image.tobytes())
            if i in (60, 150, 270, 390, 600, 735):
                stills.append(image.resize((270, 480), Image.Resampling.LANCZOS))
            if i % 150 == 0:
                print(f"Encoded {i}/{FPS * LENGTH} frames", flush=True)
    finally:
        process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError("FFmpeg failed; see artifacts/trailer/encode.log")
    sheet = Image.new("RGB", (810, 960), CREAM)
    for i, image in enumerate(stills):
        sheet.paste(image, ((i % 3) * 270, (i // 3) * 480))
    sheet.save(OUT / "FireflyGrove-trailer-contact-sheet.jpg", quality=94)
    brand.resize((540, 960), Image.Resampling.LANCZOS).save(OUT / "FireflyGrove-trailer-poster.jpg", quality=95)
    print(f"Saved {video} ({video.stat().st_size:,} bytes)", flush=True)


if __name__ == "__main__":
    main()
