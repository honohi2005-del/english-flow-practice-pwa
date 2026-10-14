import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const tipFiles = fs
  .readdirSync(root)
  .filter(
    (name) =>
      name.startsWith("pronunciation-tips-") &&
      name.endsWith(".js") &&
      name.length === 25
  )
  .sort();

if (tipFiles.length !== 60) {
  throw new Error(
    "Expected 60 authored tip files, found " + tipFiles.length + "."
  );
}

const context = { window: { PRONUNCIATION_TIPS: {} } };
vm.createContext(context);
for (const file of tipFiles) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, {
    filename: file
  });
}

const records = Object.entries(context.window.PRONUNCIATION_TIPS)
  .map(([id, tips]) => ({ id: String(id), tips }))
  .sort((a, b) => Number(a.id) - Number(b.id));

if (records.length !== 300) {
  throw new Error(
    "Expected 300 authored records, found " + records.length + "."
  );
}

function extractFocus(text) {
  const match = String(text).match(/まず意味の中心になる\s+(.+?)\s+を/);
  if (match) return match[1].trim();
  const compactMatch = String(text).match(/まずは大事な\s+(.+?)\s+を/);
  if (compactMatch) return compactMatch[1].trim();
  return "";
}

function focusWords(focus) {
  return focus
    .split(/\s*\/\s*/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function isHeading(part, word) {
  return (
    part === word ||
    part.startsWith(word + "：") ||
    part.startsWith(word + ":") ||
    part.startsWith(word + " /")
  );
}

function compactCue(groupText) {
  const text = String(groupText);
  if (/\br は/.test(text)) {
    return "r は舌先を歯ぐきに付けず、口の奥で響かせます。";
  }
  if (/\bl は/.test(text)) {
    return "l は舌先を上の歯ぐきに軽く触れます。";
  }
  if (/\bw は/.test(text)) {
    return "w は唇を丸めてすぐ開き、「ウ」を一拍にしません。";
  }
  if (/tʃ/.test(text)) {
    return "最後の /tʃ/ は「チ」と母音を足さず、息で短く閉じます。";
  }
  if (/下唇|f は|v は/.test(text)) {
    return "f / v は下唇を上の歯に軽く触れ、母音を足しません。";
  }
  if (/[ðθ]|(?:^|[\s:])th(?:\s*(?:は|\/|音)|\b)/.test(text)) {
    return "th は舌先を歯の間に少し出し、息（または声）を添えます。";
  }
  if (/ng|ŋ/.test(text)) {
    return "ng は舌の奥で止め、最後の /g/ を強く出しません。";
  }
  if (/-ed|過去形/.test(text)) {
    return "語尾の -ed は「エッド」と一拍にせず、短く収めます。";
  }
  if (/-tion|ʃən|ション/.test(text)) {
    return "-tion は「ション」と一拍で軽く収めます。";
  }
  if (/語尾.*\/z\/|\/z\/.*語尾/.test(text)) {
    return "語尾の /z/ は母音を足さず、声を残して短く閉じます。";
  }
  if (/語尾.*\/s\/|\/s\/.*語尾/.test(text)) {
    return "語尾の /s/ は「ス」と開かず、息だけで止めます。";
  }
  if (/(?:語尾|語末).*\/t\/|\/t\/.*(?:語尾|語末)|破裂/.test(text)) {
    return "語尾の /t/ は強く破裂させず、舌先で止めます。";
  }
  if (
    /連続子音|子音の連続|\/sk\/|\/kr\/|\/st\/|\/str\/|\/pl\/|\/pr\/|\/tr\/|\/dr\//.test(
      text
    )
  ) {
    return "子音が続くところは、間に母音を足さず一息でつなぎます。";
  }
  if (/アクセント|強勢|強く/.test(text)) {
    return "アクセントのある音を少し長く、ほかは軽く流します。";
  }
  return "この語は語尾に母音を足さず、最後の子音で短く閉じます。";
}

function rewriteAdvice1(record) {
  const original = record.tips?.[0];
  if (!original || typeof original.text !== "string") {
    throw new Error("Advice 1 is missing for record " + record.id + ".");
  }

  const focus = extractFocus(original.text);
  const words = focusWords(focus);
  if (!focus || !words.length) {
    throw new Error("Focus words are missing for record " + record.id + ".");
  }

  let body = original.text;
  const introEnd = body.indexOf("練習します。");
  if (introEnd >= 0) {
    body = body.slice(introEnd + "練習します。".length);
  }
  body = body.replace(
    /\s*この文では単語を一つずつ同じ強さで読まず、前後の語へそのままつなぎます。/g,
    ""
  );
  body = body.replace(
    /\s*[^。！？!?]+を読んだとき、強勢語の母音を少し長く保ち、弱い音節を同じ長さ・高さにそろえないことが第一です。?\s*$/,
    ""
  );

  const parts = body
    .split(/[。！？!?]/)
    .map((part) => part.trim())
    .filter(Boolean);
  let cursor = 0;
  const groups = [];

  for (const word of words) {
    let headingIndex = -1;
    for (let index = cursor; index < parts.length; index += 1) {
      if (isHeading(parts[index], word)) {
        headingIndex = index;
        break;
      }
    }

    if (headingIndex < 0) {
      groups.push({ word, text: "" });
      continue;
    }

    let nextHeading = parts.length;
    for (let index = headingIndex + 1; index < parts.length; index += 1) {
      if (words.some((nextWord) => isHeading(parts[index], nextWord))) {
        nextHeading = index;
        break;
      }
    }

    groups.push({
      word,
      text: parts.slice(headingIndex, nextHeading).join("。")
    });
    cursor = headingIndex + 1;
  }

  const lines = [
    "「" +
      words.join(" / ") +
      "」を中心に、強い音は少し長く、弱い音は軽くつなぎます。"
  ];
  for (const group of groups) {
    lines.push(group.word + "：" + compactCue(group.text));
  }

  return {
    ...original,
    label: original.label,
    text: lines.join("\n")
  };
}

const rewritten = records.map((record) => ({
  ...record,
  newTip: rewriteAdvice1(record)
}));
const fallbackLineCount = rewritten.filter((record) =>
  record.newTip.text.includes("語尾に母音を足さず")
).length;
const lengths = rewritten.map((record) => record.newTip.text.length);
const average = Math.round(
  lengths.reduce((total, length) => total + length, 0) / lengths.length
);

console.log(
  JSON.stringify(
    {
      records: rewritten.length,
      minLength: Math.min(...lengths),
      maxLength: Math.max(...lengths),
      averageLength: average,
      fallbackLineCount,
      samples: rewritten
        .filter((record) => ["1", "53", "297", "300"].includes(record.id))
        .map((record) => ({ id: record.id, text: record.newTip.text }))
    },
    null,
    2
  )
);

if (process.argv.includes("--write")) {
  const byId = new Map(
    rewritten.map((record) => [record.id, record.newTip])
  );

  for (const file of tipFiles) {
    const filePath = path.join(root, file);
    let source = fs.readFileSync(filePath, "utf8");
    const localContext = { window: { PRONUNCIATION_TIPS: {} } };
    vm.createContext(localContext);
    vm.runInContext(source, localContext, { filename: file });

    for (const [id, tips] of Object.entries(
      localContext.window.PRONUNCIATION_TIPS
    )) {
      const oldTip = tips[0];
      const newTip = byId.get(String(id));
      const oldText = JSON.stringify(oldTip.text);
      const newText = JSON.stringify(newTip.text);
      const oldLabel = JSON.stringify(oldTip.label);
      const newLabel = JSON.stringify(newTip.label);
      const oldTextIndex = source.indexOf(oldText);
      const oldLabelIndex = source.indexOf(oldLabel);

      if (oldTextIndex < 0 || oldLabelIndex < 0) {
        throw new Error(
          "Could not locate Advice 1 for record " + id + " in " + file + "."
        );
      }

      source =
        source.slice(0, oldTextIndex) +
        newText +
        source.slice(oldTextIndex + oldText.length);
      const adjustedLabelIndex =
        oldLabelIndex > oldTextIndex
          ? oldLabelIndex + newText.length - oldText.length
          : oldLabelIndex;
      source =
        source.slice(0, adjustedLabelIndex) +
        newLabel +
        source.slice(adjustedLabelIndex + oldLabel.length);
    }

    fs.writeFileSync(filePath, source, "utf8");
  }

  console.log("wrote 300 Advice 1 records");
}
