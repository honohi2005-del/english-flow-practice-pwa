import { readdir, readFile, stat } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = await readFile(new URL("./sentences.js", import.meta.url), "utf8");
const tipsSource = await readFile(new URL("./pronunciation-tips.js", import.meta.url), "utf8");
const tipPolishSource = await readFile(new URL("./pronunciation-tips-polish.js", import.meta.url), "utf8");
const swSource = await readFile(new URL("./sw.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
const ttsManifestSource = await readFile(new URL("./audio/tts-manifest.json", import.meta.url), "utf8");
const ttsManifest = JSON.parse(ttsManifestSource);
const tipFragmentNames = (await readdir(new URL("./", import.meta.url)))
  .filter((name) => /^pronunciation-tips-\d{3}\.js$/.test(name))
  .sort();

if (tipFragmentNames.length !== 60) {
  throw new Error("Expected exactly 60 pronunciation-tip fragment files");
}

const tipFragmentSources = await Promise.all(
  tipFragmentNames.map((name) => readFile(new URL("./" + name, import.meta.url), "utf8"))
);

const manifest = JSON.parse(
  await readFile(new URL("./site.webmanifest", import.meta.url), "utf8")
);
const match = source.match(/window\.SENTENCES\s*=\s*(\[[\s\S]*\]);\s*$/);

if (!match) {
  throw new Error("sentences.js format not found");
}

const sentences = Function("return " + match[1])();
if (!Array.isArray(sentences) || sentences.length !== 300) {
  throw new Error("Expected exactly 300 sentences");
}

if (!/window\.PRONUNCIATION_TIPS\s*=\s*window\.PRONUNCIATION_TIPS\s*\|\|\s*\{\s*\};/.test(tipsSource)) {
  throw new Error("pronunciation-tips.js bootstrap format not found");
}

const pronunciationWindow = {};
const pronunciationTips = Function(
  "window",
  tipsSource +
    "\n" +
    tipFragmentSources.join("\n") +
    "\n" +
    tipPolishSource +
    "\nreturn window.PRONUNCIATION_TIPS;"
)(pronunciationWindow);

if (
  !pronunciationTips ||
  typeof pronunciationTips !== "object" ||
  pronunciationWindow.PRONUNCIATION_TIPS_POLISHED !== true
) {
  throw new Error("Pronunciation tips must be an object");
}

const sentenceIds = new Set(sentences.map((sentence) => sentence.id));
const tipIds = Object.keys(pronunciationTips).map(Number);
if (tipIds.length !== 300 || tipIds.some((id) => !sentenceIds.has(id))) {
  throw new Error("Expected pronunciation tips for exactly the 300 sentence IDs");
}

const allTipTexts = [];
const requiredTipLabels = new Set([
  "重点語の口の形",
  "日本語訛りになりやすい音",
  "音のつながり",
  "英語のリズム",
  "段階練習"
]);
const weakFunctionWords = new Set([
  "a", "an", "the", "and", "or", "but", "as", "to", "of", "for", "from",
  "in", "on", "at", "by", "with", "can", "could", "will", "would", "should",
  "may", "might", "must", "do", "does", "did", "is", "am", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "that", "this",
  "these", "those", "it", "he", "she", "we", "they", "you", "i", "my",
  "your", "our", "their", "his", "her", "its", "there", "here", "not",
  "than"
]);

for (const [index, sentence] of sentences.entries()) {
  if (
    !sentence ||
    typeof sentence.text !== "string" ||
    !sentence.text.trim() ||
    !/[.!?]$/.test(sentence.text.trim())
  ) {
    throw new Error("Invalid sentence at " + (index + 1));
  }

  const tips = pronunciationTips[sentence.id];
  if (!Array.isArray(tips) || tips.length !== 5) {
    throw new Error("Expected exactly 5 authored pronunciation tips for sentence " + sentence.id);
  }

  const tipLabels = new Set(tips.map((tip) => tip?.label));
  if (
    tipLabels.size !== requiredTipLabels.size ||
    [...requiredTipLabels].some((label) => !tipLabels.has(label))
  ) {
    throw new Error("Each sentence must have the five pronunciation-tip viewpoints: " + sentence.id);
  }

  const sentenceWords = (sentence.text.match(/[A-Za-z]+(?:[’'][A-Za-z]+)?/g) || []).map((word) =>
    word.toLowerCase().replace(/[’']/g, "")
  );
  const linkingTip = tips.find((tip) => tip?.label === "音のつながり");
  const linkMatch = linkingTip?.text.match(
    /文中では\s+([A-Za-z][A-Za-z’'-]*)\s*／\s*([A-Za-z][A-Za-z’'-]*)/
  );
  if (linkMatch) {
    const left = linkMatch[1].toLowerCase().replace(/[’']/g, "");
    const right = linkMatch[2].toLowerCase().replace(/[’']/g, "");
    const hasAdjacentPair = sentenceWords.some(
      (word, wordIndex) => word === left && sentenceWords[wordIndex + 1] === right
    );
    if (!hasAdjacentPair) {
      throw new Error(
        `Linking pair is not adjacent in sentence ${sentence.id}: ${linkMatch[1]} ／ ${linkMatch[2]}`
      );
    }
  }

  for (const tip of tips) {
    if (
      !tip ||
      typeof tip.label !== "string" ||
      !tip.label.trim() ||
      typeof tip.text !== "string" ||
      tip.text.trim().length < 20
    ) {
      throw new Error("Invalid authored pronunciation tip for sentence " + sentence.id);
    }
    for (const match of tip.text.matchAll(/([A-Za-z][A-Za-z'-]*)\s*は短く弱く発音し、/g)) {
      if (!weakFunctionWords.has(match[1].toLowerCase())) {
        throw new Error(
          `Content word must not be weakened in sentence ${sentence.id}: ${match[1]}`
        );
      }
    }
    allTipTexts.push(tip.text.trim());
  }
}

if (new Set(allTipTexts).size !== allTipTexts.length) {
  throw new Error("Authored pronunciation tips must be individually written");
}

for (const forbidden of [
  "この文では単語を一つずつ同じ強さで読まず、前後の語へそのままつなぎます。",
  "の語尾を「ウ」「オ」「イ」で開かず、最後の子音で音を止める意識を持ってください。"
]) {
  if (allTipTexts.some((text) => text.includes(forbidden))) {
    throw new Error("Generic pronunciation-tip wording remains: " + forbidden);
  }
}

for (const required of [
  "./site.webmanifest",
  "./styles.css",
  "./sentences.js",
  "./speech-voice.js",
  "./pronunciation-tips.js",
  "./pronunciation-tips-polish.js",
  ...tipFragmentNames.map((name) => "./" + name),
  "./recording-store.js",
  "./app.js"
]) {
  if (!html.includes(required)) {
    throw new Error("Missing script or asset reference: " + required);
  }
    if (
      (required.startsWith("./pronunciation-tips") || required === "./recording-store.js") &&
      !swSource.includes(required)
    ) {
    throw new Error("Missing Service Worker cache entry: " + required);
  }
}

if (!appSource.includes("./audio/tts/en-US-RyanPiper")) {
  throw new Error("Missing pre-generated male narration path in app.js");
}

if (!swSource.includes("./audio/tts-manifest.json")) {
  throw new Error("Missing TTS manifest in Service Worker cache list");
}

const appVersionMatch = html.match(/<script\s+src="\.\/app\.js\?v=(\d+)"><\/script>/);
if (!appVersionMatch || appVersionMatch[1] !== "26") {
  throw new Error("index.html must load app.js?v=26");
}

if (
  !swSource.includes("english-flow-practice-v26") ||
  !swSource.includes("./app.js?v=26")
) {
  throw new Error("Service Worker cache version is out of date");
}

for (const required of [
  "function randomSentenceIndex(",
  "english-flow-practice-start-index-v2",
  "getInitialSentenceIndex()"
]) {
  if (!appSource.includes(required)) {
    throw new Error("Random start implementation is missing: " + required);
  }
}

if (
        ttsManifest.voice !== "Piper en_US-ryan-medium (male)" ||
  ttsManifest.language !== "en-US" ||
  !Array.isArray(ttsManifest.sentences) ||
        ttsManifest.sentences.length !== sentences.length
) {
  throw new Error("TTS manifest metadata or sentence count is invalid");
}

      for (let index = 0; index < sentences.length; index += 1) {
        const sourceSentence = sentences[index];
  const audioEntry = ttsManifest.sentences[index];
  if (
    !audioEntry ||
    audioEntry.id !== sourceSentence.id ||
    audioEntry.text !== sourceSentence.text ||
    typeof audioEntry.file !== "string"
  ) {
    throw new Error("TTS manifest does not match sentence " + sourceSentence.id);
  }
  const audioStats = await stat(new URL(audioEntry.file, import.meta.url));
  if (audioStats.size < 1000) {
    throw new Error("TTS audio file is unexpectedly small: " + audioEntry.file);
  }
}

if (
  !html.includes('rel="apple-touch-icon"') ||
  !html.includes('name="apple-mobile-web-app-capable"')
) {
  throw new Error("Missing iOS home-screen metadata");
}

for (const expected of [
  { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" }
]) {
  const icon = manifest.icons?.find(
    (candidate) =>
      candidate.src === expected.src &&
      candidate.sizes === expected.sizes &&
      candidate.type === expected.type
  );
  if (!icon) {
    throw new Error("Missing manifest icon: " + expected.src);
  }
  const iconStats = await stat(new URL(expected.src, import.meta.url));
  if (iconStats.size < 100) {
    throw new Error("Icon file is unexpectedly small: " + expected.src);
  }
}

if (
  !html.includes('id="speak-button"') ||
  !html.includes('id="next-button"') ||
  !html.includes('id="record-button"') ||
  !html.includes('id="recording-audio"') ||
  !html.includes('id="delete-recording-button"')
) {
  throw new Error("Missing practice controls");
}

console.log("check passed: 300 sentences, authored pronunciation tips, embedded pre-recorded narration, PWA shell, speech controls, and per-sentence recording controls are present");
