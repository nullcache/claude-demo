"""Beat-track the song -> media/audio/beats.json (used by timeline.py)."""
import json
import os

import librosa

ROOT = os.path.dirname(os.path.abspath(__file__))
wav = os.path.join(ROOT, "media", "audio", "pachka_sigaret_lizer.wav")
y, sr = librosa.load(wav, sr=22050, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
out = os.path.join(ROOT, "media", "audio", "beats.json")
json.dump({"tempo": float(tempo if not hasattr(tempo, "__len__") else tempo[0]),
           "beats": [float(b) for b in beats]}, open(out, "w"))
print(f"tempo {tempo}, {len(beats)} beats -> {out}")
