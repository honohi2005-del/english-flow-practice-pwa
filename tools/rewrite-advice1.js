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
  const rewrittenMatch = String(text).match(/「([^」]+)」(?:を中心に|を意識して|を、)/);
  if (rewrittenMatch) return rewrittenMatch[1].trim();
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

const WORD_GUIDES = {
  i: "I は /aɪ/ を「ア」と「イ」の2拍に分けず、口を開いてそのまま一滑り。単独の「アイ」と切らず、次の語へすぐつなぎます。",
  teach: "teach は /tiːtʃ/。/iː/ を「イー」と長く保ち、最後の /tʃ/ は「チュ」と開かず息で止めます。",
  japanese: "Japanese は /ˌdʒæpəˈniːz/。いちばん高く長くするのは -nee-、最後の /z/ は「ズ」と母音を足さず声だけ残します。",
  practicing: "practicing は /ˈpræktɪsɪŋ/。最初の /pr/ を「プ・ラ」と分けず、/præk/ を強く、最後の /ŋ/ は「ング」と破裂させません。",
  pause: "pause は /pɔːz/。/ɔː/ を「ポ・オ」と分けず一つの長い母音にし、最後の /z/ は声を残して「ズ」と開きません。",
  natural: "natural は /ˈnætʃərəl/。最初の /næ/ を強く、-tural- は「チュラル」と3拍にせず、/tʃr/ を続けて最後を軽くします。",
  different: "different は /ˈdɪfrənt/。「ディ・ファ・レント」と3拍にせず、/dɪf/ を強くして /frənt/ へ一息でつなぎ、最後の /t/ は破裂させません。",
  general: "general は /ˈdʒenrəl/。/dʒen/ を強く、「ジェ・ネ・ラル」と母音を3つ足さず、後半は /rəl/ を軽くまとめます。",
  trends: "trends は /trendz/。/tr/ を「ト・ゥ」と分けず、/trend/ のあと最後の /dz/ を一気に閉じ、「トレンズ」と母音を足しません。",
  individual: "individual は /ˌɪndɪˈvɪdʒuəl/。一番強くするのは -vid-、最後の /dʒuəl/ は「ジュ・アル」と分けず軽く流します。",
  experiences: "experiences は /ɪkˈspɪriənsɪz/。/ɪkˈspɪr/ を「イク・スピ」と切らず、-spee- を強くし、最後の /sɪz/ は小さく添えます。",
  english: "English は /ˈɪŋɡlɪʃ/。最初の /ɪŋ/ を強く、/ŋ/ のあとに「グ」を独立させず、最後の /ʃ/ は「シ」と母音を足さず息で終えます。",
  language: "language は /ˈlæŋɡwɪdʒ/。/læŋ/ を強く、/ŋ/ から /ɡw/ を一息でつなぎ、最後の /dʒ/ を「ジ」と開きません。",
  sentence: "sentence は /ˈsentəns/。最初の /sent/ を強く、真ん中の /tə/ を弱くし、最後の /s/ は「ス」と母音を足さず止めます。",
  sentences: "sentences は /ˈsentənsɪz/。/sent/ を強く、/tənsɪz/ を細かく区切らず、最後の /ɪz/ を「イズ」と大きく開きません。",
  feedback: "feedback は /ˈfiːdbæk/。/fiːd/ の /iː/ を保ち、/d/ から /b/ を切らず、最後の /k/ は「ク」と母音を添えず止めます。",
  conversation: "conversation は /ˌkɑːnvərˈseɪʃən/。一番強くするのは -say-、/kɑːn-vər/ は弱くつなぎ、最後の /ʃən/ を「ション」と2拍にしません。",
  discussion: "discussion は /dɪˈskʌʃən/。/sk/ を「ス・ク」と分けず -cuss- を強く、最後の /ʃən/ は短く一まとまりにします。",
  important: "important は /ɪmˈpɔːrtənt/。/pɔːr/ を強く、最初の /ɪm/ と最後の /tənt/ は軽くし、語尾に「トゥ」と母音を足しません。",
  example: "example は /ɪɡˈzæmpəl/。/zæm/ を強く、/ɡ/ から /z/ を切らず、最後の /pəl/ は「ポル」と開かず軽く終えます。",
  specific: "specific は /spəˈsɪfɪk/。真ん中の /sɪf/ を強く、最初の /spə/ は弱くつなぎ、最後の /k/ は「ク」と開きません。"
};

function cleanWord(word) {
  return String(word).replace(/[^A-Za-z'-]/g, "");
}

function specificCue(word, groupText) {
  const normalized = cleanWord(word);
  const lower = normalized.toLowerCase();
  if (WORD_GUIDES[lower]) return WORD_GUIDES[lower];

  const text = String(groupText);
  const cues = [];
  if (/[r]/.test(lower) || /\br は|\/r\//.test(text)) {
    cues.push(`${word} の /r/ は舌先を歯ぐきに付けず、口の奥で響かせます。`);
  }
  if (/[l]/.test(lower) || /\bl は|\/l\//.test(text)) {
    cues.push(`${word} の /l/ は舌先を上の歯ぐきに軽く触れ、後ろに母音を足しません。`);
  }
  if (/[w]/.test(lower) || /\bw は|\/w\//.test(text)) {
    cues.push(`${word} の /w/ は唇を丸めてすぐ開き、「ウ」を一拍にしません。`);
  }
  if (/[fv]/.test(lower) || /下唇|f は|v は/.test(text)) {
    cues.push(`${word} の f / v は下唇を上の歯に軽く触れ、最後まで母音を足さずに息（または声）を残します。`);
  }
  if (/th/.test(lower) || /[ðθ]|(?:^|[\s:])th(?:\s*(?:は|\/|音)|\b)/.test(text)) {
    cues.push(`${word} の th は舌先を歯の間に少し出し、「トゥ」と区切らず息（または声）を添えます。`);
  }
  if (/ng/.test(lower) || /ng|ŋ/.test(text)) {
    cues.push(`${word} の ng は舌の奥で止め、最後の /g/ を独立させず鼻に抜いて終えます。`);
  }
  if (lower.endsWith("ing")) {
    cues.push(`${word} の -ing は /ɪŋ/。最後を「イング」と二拍にせず、/ŋ/ で鼻に抜いて止めます。`);
  }
  if (lower.endsWith("ed")) {
    cues.push(`${word} の -ed は「エッド」と一拍にせず、直前の音から短く閉じます。`);
  }
  if (/(tion|sion)$/.test(lower)) {
    cues.push(`${word} の -${lower.endsWith("tion") ? "tion" : "sion"} は「ション」と二拍にせず、/ʃən/ を一まとまりで軽く収めます。`);
  }
  if (/tch|ch/.test(lower)) {
    cues.push(`${word} の ch は「チュ」と母音を足さず、/tʃ/ を一度だけ弾いて止めます。`);
  }
  if (/sh/.test(lower)) {
    cues.push(`${word} の sh は「シ」と声を足さず、唇を少し丸めた /ʃ/ の息で閉じます。`);
  }
  if (/ph/.test(lower)) {
    cues.push(`${word} の ph は /f/。下唇を上の歯に触れ、「フ」と母音を後ろに足しません。`);
  }
  if (/[^aeiou]{2,}/.test(lower)) {
    cues.push(`${word} の子音が続く箇所は、「ク」や「トゥ」を挟まず、子音を一息でつなぎます。`);
  }
  if (/[z]$/.test(lower)) {
    cues.push(`${word} の語尾 /z/ は「ズ」と開かず、声を残したまま短く閉じます。`);
  } else if (/[s]$/.test(lower)) {
    cues.push(`${word} の語尾 /s/ は「ス」と母音を足さず、息だけで止めます。`);
  } else if (/[td]$/.test(lower)) {
    cues.push(`${word} の語尾 /${lower.at(-1)}/ は強く破裂させず、舌先で止めます。`);
  }
  if (cues.length) return cues.slice(0, 2).join(" ");

  const first = lower[0] || normalized || word;
  const last = lower.at(-1) || first;
  return `${word} は最初の /${first}/ をはっきり出し、最後の /${last}/ で音を閉じます。「${word}」を日本語の拍に分けず、一息でつなげます。`;
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

  let body = original.text.replace(
    /^\s*この文では「[^」]+」を、単語ごとの口の形と音の止め方に合わせて読みます。\s*/,
    ""
  );
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
    "この文では「" +
      words.join(" / ") +
      "」を、単語ごとの口の形と音の止め方に合わせて読みます。"
  ];
  for (const group of groups) {
    lines.push(group.word + "：" + specificCue(group.word, group.text));
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
