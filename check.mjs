import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = await readFile(new URL("./sentences.js", import.meta.url), "utf8");
const match = source.match(/window\.SENTENCES\s*=\s*(\[[\s\S]*\]);\s*$/);

if (!match) {
  throw new Error("sentences.js format not found");
}

const sentences = Function("return " + match[1])();
if (!Array.isArray(sentences) || sentences.length !== 300) {
  throw new Error("Expected exactly 300 sentences");
}

for (const [index, sentence] of sentences.entries()) {
  if (
    !sentence ||
    typeof sentence.text !== "string" ||
    !sentence.text.trim() ||
    !/[.!?]$/.test(sentence.text.trim())
  ) {
    throw new Error("Invalid sentence at " + (index + 1));
  }
}

for (const required of [
  "./site.webmanifest",
  "./styles.css",
  "./sentences.js",
  "./speech-voice.js",
  "./app.js"
]) {
  if (!html.includes(required)) {
    throw new Error("Missing script or asset reference: " + required);
  }
}

if (!html.includes('id="speak-button"') || !html.includes('id="next-button"')) {
  throw new Error("Missing practice controls");
}

console.log("check passed: 300 sentences, PWA shell, and speech controls are present");
