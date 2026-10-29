# Google Play preview video

Curated deliverables:

- `assets/store/firefly-grove-play-preview.mp4`: 25-second portrait preview, 1080 × 1920, 30 fps, H.264/yuv420p video and AAC stereo audio, with MP4 fast-start metadata.
- `assets/store/firefly-grove-trailer-poster.jpg`: portrait poster.
- `artifacts/FireflyGrove-trailer-contact-sheet.jpg`: six representative frames for visual review.

The trailer uses actual browser captures of the current game at an isolated localhost origin. It demonstrates a training board, crossing notes, a found-firefly animation, the descriptive hint overlay, the completed-board Next level action, and the 8 × 8 daily practice challenge. No production profile, leaderboard submission, cloud account or existing saved game is used. It does not demonstrate or promise live reward ads or verified Google cloud linking.

The opening and closing cards reuse the approved game icon. Gameplay occupies 22.2 of 25 seconds (88.8%). Captions are outside the captured UI and remain understandable when muted. Pauses between capture calls are trimmed; adjacent captured images are temporally blended for smooth editing. The UI, boards, marks, hearts and scores are not reconstructed or altered. The quiet ambient track is synthesized by the assembly script using original additive chords/chimes; it contains no sampled or third-party music. The soundtrack is promotional background audio, not a claim about in-game audio.

## Recreate the export

The authorized browser UI capture saved PNG frames and `capture.json` in the ignored `artifacts/trailer/raw/` folder. Each entry contains `scene`, `file` and capture timestamp `at`. Source screenshots are 1280 × 720 with the actual app-shell bounds x=400, y=0, width=480, height=720. The assembly script crops only those observed bounds and scales without changing aspect ratio.

Scene groups in this capture: `opening-board` (65 frames), `cross-notes` (95), `find-firefly` (18), `hint-explanation` (18), `level-complete` (12), `next-level` (10), and `daily-challenge` (46). The edit excludes the completion modal's upload status and uses the clean completed-board overlay instead. Re-record captures and update the edit selection if the UI or features change; source frames are tied to this version of the game.

With Python, Pillow, NumPy and FFmpeg installed:

```powershell
python scripts/make-store-trailer.py --ffmpeg /path/to/ffmpeg.exe
```

The local convenience fallback uses the `imageio-ffmpeg` package under `artifacts/media-tools/`. It is not a runtime dependency of the game. Encoding was verified by decoding all 750 output video frames and the audio stream, checking dimensions, duration, codecs and representative stills. Font files are the workstation's Georgia and Segoe UI; provide equivalent licensed fonts when recreating on another platform.

## Add to Google Play

1. Review the MP4 and upload it to your YouTube channel.
2. Set visibility to **Public** or **Unlisted**. Enable embedding, disable monetization/ads and ensure the video is not age-restricted. Set the audience designation truthfully for the game.
3. Copy the individual video's normal YouTube URL (not a playlist or a link with a start-time parameter).
4. Paste that URL into Play Console's Video field. Play Console accepts the YouTube URL, not a directly uploaded MP4 or a local file path.

Suggested title: **Firefly Grove — A little logic. A little light.**

Google's guidance: https://support.google.com/googleplay/android-developer/answer/9866151

No app version bump, Android release build or YouTube upload accompanies the local export.
