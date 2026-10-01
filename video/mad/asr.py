"""Transcribe the first N minutes of each skill voice file -> cache/asr/<name>.json (word timestamps)."""
import json, subprocess, sys, pathlib
from faster_whisper import WhisperModel
MIN = float(sys.argv[1]) if len(sys.argv) > 1 else 25
m = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)
for f in sorted(pathlib.Path("cache/skills").glob("*.m4a")):
    out = pathlib.Path("cache/asr") / (f.stem + ".json")
    if out.exists(): continue
    wav = f.with_suffix(".16k.wav")
    subprocess.run(["ffmpeg","-v","error","-y","-i",str(f),"-t",str(MIN*60),"-ac","1","-ar","16000",str(wav)],check=True)
    segs, _ = m.transcribe(str(wav), word_timestamps=True, vad_filter=True)
    data = [{"start":s.start,"end":s.end,"text":s.text.strip(),
             "words":[{"w":w.word,"s":w.start,"e":w.end,"p":w.probability} for w in s.words]} for s in segs]
    out.write_text(json.dumps(data, ensure_ascii=False, indent=0)); print("done", f, len(data), flush=True)
