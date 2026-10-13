import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const VOICE = "Google Translate English (en-US)";
const LANGUAGE = "en-US";
const RATE = "default";
const PITCH = "default";
const RETRIES = 3;
const THROTTLE_MS = 250;
const TTS_ENDPOINT = "https://translate.google.com/translate_tts";

const sentencesUrl = new URL("../sentences.js", import.meta.url);
const outputRootUrl = new URL("../audio/tts/google-en-US/", import.meta.url);
const manifestUrl = new URL("../audio/tts-manifest.json", import.meta.url);
const outputRootPath = fileURLToPath(outputRootUrl);

function parseSentences(source) {
  const match = source.match(/window\.SENTENCES\s*=\s*(\[[\s\S]*\]);\s*$/);
  if (!match) {
    throw new Error("Could not find window.SENTENCES in sentences.js");
  }

  const sentences = Function("return " + match[1])();
  if (!Array.isArray(sentences) || sentences.length === 0) {
    throw new Error("sentences.js did not contain a non-empty sentence list");
  }
  return sentences;
}

async function readExistingManifest() {
  try {
    const source = await readFile(manifestUrl, "utf8");
    const manifest = JSON.parse(source);
    return new Map((manifest.sentences || []).map((entry) => [entry.id, entry]));
  } catch {
    return new Map();
  }
}

async function isUsableFile(path) {
  try {
    const details = await stat(path);
    return details.isFile() && details.size > 1000;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateSentence(sentence, outputPath) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const url = new URL(TTS_ENDPOINT);
      url.searchParams.set("ie", "UTF-8");
      url.searchParams.set("client", "tw-ob");
      url.searchParams.set("tl", LANGUAGE);
      url.searchParams.set("q", sentence.text);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
          Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8"
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const audio = new Uint8Array(await response.arrayBuffer());
      if (audio.byteLength < 1000) {
        throw new Error(`audio response is unexpectedly small (${audio.byteLength} bytes)`);
      }
      await writeFile(outputPath, audio);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) {
        await wait(1000 * attempt);
      }
    }
  }
  throw new Error(`Failed to generate sentence ${sentence.id}: ${lastError?.message || lastError}`);
}

const sentencesSource = await readFile(sentencesUrl, "utf8");
const sentences = parseSentences(sentencesSource);
const existingManifest = await readExistingManifest();
await mkdir(outputRootPath, { recursive: true });

const entries = [];
for (let index = 0; index < sentences.length; index += 1) {
  const sentence = sentences[index];
  const fileName = String(sentence.id).padStart(3, "0") + ".mp3";
  const filePath = new URL(fileName, outputRootUrl);
    const relativeFile = "./audio/tts/google-en-US/" + fileName;
  const previous = existingManifest.get(sentence.id);
  const reusable = previous?.text === sentence.text && (await isUsableFile(filePath));

  if (!reusable) {
    process.stdout.write(`[${index + 1}/${sentences.length}] generating ${fileName}\n`);
    await generateSentence(sentence, fileURLToPath(filePath));
  } else {
    process.stdout.write(`[${index + 1}/${sentences.length}] keeping ${fileName}\n`);
  }

  if (!(await isUsableFile(filePath))) {
    throw new Error(`Generated audio is missing or too small: ${fileName}`);
  }

  entries.push({
    id: sentence.id,
    text: sentence.text,
        file: relativeFile,
        source: VOICE
  });

      if (index < sentences.length - 1) {
        await wait(THROTTLE_MS);
      }
}

const manifest = {
  version: 1,
  voice: VOICE,
  language: LANGUAGE,
  rate: RATE,
  pitch: PITCH,
  generatedAt: new Date().toISOString(),
  sentences: entries
};

await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Generated ${entries.length} pre-recorded English narration files with ${VOICE}.`);
