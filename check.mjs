import { readdir, readFile, stat } from "node:fs/promises";

const TOTAL_SENTENCE_COUNT = 600;
const AUTHORED_PRONUNCIATION_TIP_LIMIT = 300;
const PREGENERATED_AUDIO_LIMIT = 600;

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = await readFile(new URL("./sentences.js", import.meta.url), "utf8");
const tipsSource = await readFile(new URL("./pronunciation-tips.js", import.meta.url), "utf8");
const tipPolishSource = await readFile(new URL("./pronunciation-tips-polish.js", import.meta.url), "utf8");
const swSource = await readFile(new URL("./sw.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("./styles.css", import.meta.url), "utf8");
const startupSource = await readFile(new URL("./startup.js", import.meta.url), "utf8");
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
if (!Array.isArray(sentences) || sentences.length !== TOTAL_SENTENCE_COUNT) {
  throw new Error(`Expected exactly ${TOTAL_SENTENCE_COUNT} sentences`);
}
if (sentences.some((sentence, index) => sentence?.id !== index + 1)) {
  throw new Error("Sentence IDs must be sequential from 1");
}

const additionalSentences = sentences.filter(
  (sentence) => sentence.id > AUTHORED_PRONUNCIATION_TIP_LIMIT
);
if (
  additionalSentences.length !== TOTAL_SENTENCE_COUNT - AUTHORED_PRONUNCIATION_TIP_LIMIT ||
  additionalSentences.some((sentence) => sentence.id > TOTAL_SENTENCE_COUNT)
) {
    throw new Error("The 300 learner-pattern sentences are not registered correctly");
}

const learnerDiscoursePattern =
  /\b(?:I think|In my experience|For example|That's why|I'm not sure|One thing I've noticed|What I mean is|If I have a chance|Compared with|The reason is|It's difficult to explain|At the same time|In the end|I used to think|Now I think|For me|That is why|When I|Although|Because|My experience|From my experience)\b/i;
const patternedAdditionalSentenceCount = additionalSentences.filter((sentence) =>
  learnerDiscoursePattern.test(sentence.text)
).length;
  if (patternedAdditionalSentenceCount < 250) {
  throw new Error(
    "Additional sentences must be based on recurring learner discourse patterns"
  );
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
if (
  tipIds.length !== AUTHORED_PRONUNCIATION_TIP_LIMIT ||
  tipIds.some(
    (id) =>
      id < 1 ||
      id > AUTHORED_PRONUNCIATION_TIP_LIMIT ||
      !sentenceIds.has(id)
  )
) {
  throw new Error(
    `Expected pronunciation tips for exactly the first ${AUTHORED_PRONUNCIATION_TIP_LIMIT} sentence IDs`
  );
}

const allTipTexts = [];
const advice1Texts = [];
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

  if (sentence.id > AUTHORED_PRONUNCIATION_TIP_LIMIT) {
    continue;
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
  const advice1 = tips.find((tip) => tip?.label === "重点語の口の形");
  if (!advice1) {
    throw new Error("Advice 1 is missing: " + sentence.id);
  }
  const advice1Text = advice1.text.trim();
  if (!/^この文では「[^」]+」を、単語ごとの口の形と音の止め方に合わせて読みます。/.test(advice1Text)) {
    throw new Error("Advice 1 must start with the word-specific intro: " + sentence.id);
  }
  advice1Texts.push(advice1Text);
}

if (new Set(allTipTexts).size !== allTipTexts.length) {
  throw new Error("Authored pronunciation tips must be individually written");
}

for (const forbidden of [
    "アクセントのある音を少し長く、ほかは軽く流します。",
    "強い音は少し長く、弱い音は軽くつなぎます。",
    "この文では単語を一つずつ同じ強さで読まず、前後の語へそのままつなぎます。"
  ]) {
    if (advice1Texts.some((text) => text.includes(forbidden))) {
      throw new Error("Generic Advice 1 wording remains: " + forbidden);
    }
  }
for (const forbidden of [
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
    "./vowel-advice.js",
  "./speech-voice.js",
  "./pronunciation-tips.js",
  "./pronunciation-tips-polish.js",
  ...tipFragmentNames.map((name) => "./" + name),
  "./recording-store.js",
  "./startup.js",
  "./app.js"
]) {
  if (!html.includes(required)) {
    throw new Error("Missing script or asset reference: " + required);
  }
    if (
        (required.startsWith("./pronunciation-tips") || required === "./recording-store.js" || required === "./vowel-advice.js") &&
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
    if (!appVersionMatch || appVersionMatch[1] !== "35") {
    throw new Error("index.html must load app.js?v=35");
}

if (
        !swSource.includes("english-flow-practice-v36") ||
        !swSource.includes("./startup.js?v=30") ||
        !swSource.includes("./app.js?v=35")
) {
  throw new Error("Service Worker cache version is out of date");
}

if (
      !html.includes('./styles.css?v=24') ||
      !appSource.includes("function extractContentWords(") ||
      appSource.includes("function extractStressWords(") ||
  !appSource.includes('class="stress-word"') ||
      !stylesSource.includes("#sentence-heading .stress-word")
) {
  throw new Error("Stress-word highlighting is not wired up");
}

  if (!html.includes('id="vowel-advice-list"') || !appSource.includes("buildVowelAdvice")) {
    throw new Error("Vowel advice is not wired up");
  }

  if (
    !startupSource.includes("window.__INITIAL_SENTENCE_INDEX__") ||
    !startupSource.includes("1 + Math.floor")
  ) {
    throw new Error("Startup random selection must exclude sentence 1");
  }

  if (
    html.includes("1 / 300") ||
    html.includes("No. 001") ||
    html.includes("I teach Japanese.")
  ) {
    throw new Error("index.html must not contain a fixed first sentence");
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
    ttsManifest.sentences.length !== PREGENERATED_AUDIO_LIMIT
) {
  throw new Error("TTS manifest metadata or sentence count is invalid");
}

      for (let index = 0; index < PREGENERATED_AUDIO_LIMIT; index += 1) {
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

  if (
    html.includes("収録した英語音声") ||
    html.includes("収録済み英語音声") ||
    html.includes('class="narration-panel"')
  ) {
    throw new Error("Visible embedded narration panel must be removed");
  }
  if (
    !html.includes('id="narration-audio"') ||
    !html.includes('hidden') ||
    !html.includes('aria-hidden="true"')
  ) {
    throw new Error("Hidden narration compatibility audio is missing");
  }

  console.log("check passed: 600 sentences (300 authored tips + 300 learner-pattern examples), 600 pre-generated narration files, hidden narration compatibility audio, PWA shell, speech controls, and per-sentence recording controls are present");
