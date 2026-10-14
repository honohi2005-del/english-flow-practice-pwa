import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sentencesPath = join(repoRoot, "sentences.js");
const outputRoot = join(repoRoot, "audio", "tts", "en-US-RyanPiper");
const modelPath = process.env.PIPER_MODEL_PATH;
const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg.exe";

if (!modelPath) {
  throw new Error("PIPER_MODEL_PATH is required");
}

const sentencesSource = await readFile(sentencesPath, "utf8");
const sentencesMatch = sentencesSource.match(/window\.SENTENCES\s*=\s*(\[[\s\S]*?\]);/);
if (!sentencesMatch) {
  throw new Error("Could not parse window.SENTENCES from sentences.js");
}

const sentences = Function(`"use strict"; return (${sentencesMatch[1]});`)();
if (!Array.isArray(sentences) || sentences.length !== 300) {
  throw new Error(`Expected 300 sentences, found ${sentences.length}`);
}

const tempRoot = await mkdtemp(join(process.env.TEMP || process.cwd(), "english-flow-piper-"));
const sentencesJsonPath = join(tempRoot, "sentences.json");
await writeFile(sentencesJsonPath, JSON.stringify(sentences), "utf8");

const runPythonGenerator = () =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.platform === "win32" ? "py.exe" : "python3",
      [
        join(repoRoot, "tools", "generate-piper-audio.py"),
        "--model",
        modelPath,
        "--sentences-json",
        sentencesJsonPath,
        "--output-root",
        outputRoot,
        "--ffmpeg",
        ffmpegPath,
      ],
      { cwd: repoRoot, stdio: "inherit" },
    );

    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Piper audio generation failed (code=${code}, signal=${signal ?? "none"})`));
      }
    });
  });

try {
  await runPythonGenerator();

  const manifest = {
    version: 3,
    voice: "Piper en_US-ryan-medium (male)",
    language: "en-US",
    rate: "0%",
    pitch: "0Hz",
    generatedAt: new Date().toISOString(),
    sentences: sentences.map(({ id, text }) => ({
      id,
      text,
      file: `./audio/tts/en-US-RyanPiper/${String(id).padStart(3, "0")}.mp3`,
      source: "Piper en_US-ryan-medium (male)",
    })),
  };

  await writeFile(
    join(repoRoot, "audio", "tts-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
