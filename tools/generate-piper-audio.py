import argparse
import json
import subprocess
import wave
from pathlib import Path

from piper import PiperVoice


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--sentences-json", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--ffmpeg", required=True)
    args = parser.parse_args()

    sentences = json.loads(Path(args.sentences_json).read_text(encoding="utf-8"))
    output_root = Path(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    voice = PiperVoice.load(args.model)
    total = len(sentences)
    for index, sentence in enumerate(sentences, start=1):
        sentence_id = int(sentence["id"])
        wav_path = output_root / f"{sentence_id:03d}.wav"
        mp3_path = output_root / f"{sentence_id:03d}.mp3"

        with wave.open(str(wav_path), "wb") as wav_file:
            voice.synthesize_wav(sentence["text"], wav_file)

        subprocess.run(
            [
                args.ffmpeg,
                "-y",
                "-loglevel",
                "error",
                "-i",
                str(wav_path),
                "-codec:a",
                "libmp3lame",
                "-q:a",
                "3",
                str(mp3_path),
            ],
            check=True,
        )
        wav_path.unlink()

        if not mp3_path.exists() or mp3_path.stat().st_size <= 1000:
            raise RuntimeError(f"Generated audio is missing or too small: {mp3_path}")

        print(f"[{index}/{total}] {sentence_id:03d}.mp3", flush=True)


if __name__ == "__main__":
    main()
