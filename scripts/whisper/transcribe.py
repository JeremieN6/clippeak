"""Transcription d'une fenetre audio avec faster-whisper (CPU, int8, francais).

Usage : python transcribe.py <audio.wav> <modele>   (ex : small)
Entree : WAV 16 kHz mono 16 bits (produit par ffmpeg, voir audioWindow.ts).
Sortie : une ligne JSON sur stdout {load_s, transcribe_s, audio_s, segments:[{start,end,text,words:[{start,end,text}]}]}.
WHISPER_THREADS (defaut 2) limite les threads CPU : le VPS partage ses 2 coeurs avec le site.

Le WAV est lu ici et passe en tableau numpy : on evite ainsi le decodeur PyAV de faster-whisper,
dont l'appel `av.open(metadata_errors=...)` a echoue avec la version installee sous Windows.

Installation (venv recommande) : pip install faster-whisper
"""
import json
import os
import sys
import time
import wave

import numpy as np
from faster_whisper import WhisperModel


def main() -> None:
    audio_path, model_name = sys.argv[1], sys.argv[2]
    with wave.open(audio_path, "rb") as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            sys.exit("WAV 16 kHz mono 16 bits attendu")
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

    t0 = time.time()
    threads = int(os.environ.get("WHISPER_THREADS", "2"))
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads, num_workers=1)
    t1 = time.time()
    segments, _info = model.transcribe(audio, language="fr", vad_filter=True, beam_size=1, word_timestamps=True)
    out = [
        {
            "start": round(s.start, 2),
            "end": round(s.end, 2),
            "text": s.text.strip(),
            "words": [{"start": round(w.start, 2), "end": round(w.end, 2), "text": w.word.strip()} for w in (s.words or [])],
        }
        for s in segments
    ]
    t2 = time.time()
    print(json.dumps({
        "load_s": round(t1 - t0, 1),
        "transcribe_s": round(t2 - t1, 1),
        "audio_s": round(len(audio) / 16000, 1),
        "segments": out,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
