(() => {
  "use strict";

  const sentences = Array.isArray(window.SENTENCES) ? window.SENTENCES : [];
  const PREGENERATED_AUDIO_ROOT = "./audio/tts/en-US-RyanPiper";
  const START_INDEX_STORAGE_KEY = "english-flow-practice-start-index-v2";

  function randomSentenceIndex(excludeIndex = -1) {
    if (sentences.length <= 1) {
      return 0;
    }

    const randomUnit = () => {
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const values = new Uint32Array(1);
        window.crypto.getRandomValues(values);
        return values[0] / 4294967296;
      }
      return Math.random();
    };

    let index;
    do {
      index = Math.min(sentences.length - 1, Math.floor(randomUnit() * sentences.length));
    } while (index === excludeIndex);
    return index;
  }

  function readLastStartIndex() {
    try {
      const stored = Number.parseInt(window.localStorage.getItem(START_INDEX_STORAGE_KEY), 10);
      return Number.isInteger(stored) && stored >= 0 && stored < sentences.length ? stored : -1;
    } catch {
      return -1;
    }
  }

  function rememberStartIndex(index) {
    try {
      window.localStorage.setItem(START_INDEX_STORAGE_KEY, String(index));
    } catch {
      // Private browsing or a restricted storage policy should not block practice.
    }
  }

  function getInitialSentenceIndex() {
    const index = randomSentenceIndex(readLastStartIndex());
    rememberStartIndex(index);
    return index;
  }

  const initialSentenceIndex = getInitialSentenceIndex();
  const sentenceHeading = document.getElementById("sentence-heading");
  const sentenceCount = document.getElementById("sentence-count");
  const sentenceNumber = document.getElementById("sentence-number");
  const tipsList = document.getElementById("tips-list");
  const flowExample = document.getElementById("flow-example");
  const speakButton = document.getElementById("speak-button");
  const nextButton = document.getElementById("next-button");
  const recordButton = document.getElementById("record-button");
  const deleteRecordingButton = document.getElementById("delete-recording-button");
  const recordingAudio = document.getElementById("recording-audio");
  const recordingStatus = document.getElementById("recording-status");
  const recordingBadge = document.getElementById("recording-badge");
  const voiceStatus = document.getElementById("voice-status");
  const narrationAudio = document.getElementById("narration-audio");
  const installButton = document.getElementById("install-button");

  const functionWords = new Set([
    "a", "an", "the", "am", "is", "are", "was", "were", "be", "been",
    "being", "to", "of", "and", "or", "but", "for", "from", "in", "on",
    "at", "with", "can", "could", "will", "would", "do", "does", "did",
    "that", "this", "than", "as", "if", "it", "i", "my", "our", "we",
    "you", "they", "some", "more", "not", "so", "how", "when", "what",
    "who", "which", "their", "there", "here", "by", "into", "about",
    "after", "before", "while", "should", "must", "may", "might", "have", "has", "had"
  ]);

  const wordTips = {
    individual: {
      label: "Individual",
      text: "アクセントは -vi-。前半を強くしすぎず、後半の -ual は力を抜いて「インディ・VI・ジュル」と流します。"
    },
    experiences: {
      label: "experiences",
      text: "ex- は弱く、-spe- を強くします。最後の -s は母音を足さず、短い /z/ を添えて閉じます。"
    },
    different: {
      label: "different",
      text: "「ディファレント」と3音節にせず、中央を弱めた2音節感覚で /DIFF-rənt/。語尾の t は破裂させすぎません。"
    },
    general: {
      label: "general",
      text: "gen- を強く、真ん中を弱くして「ジェンラル」。日本語の4拍を均等に並べないのがコツです。"
    },
    trends: {
      label: "trends",
      text: "語尾に「オ」を足さず、/dz/ を子音だけで閉じます。tr- は t と r を分けず、一息で出します。"
    }
  };

  const state = {
    index: initialSentenceIndex,
    voices: [],
    selectedVoice: null,
    deferredInstall: null,
    narrationAudio: null,
    narrationToken: 0,
    recording: {
      recorder: null,
      stream: null,
      chunks: [],
      sentenceId: null,
      startedAt: 0,
      mimeType: "",
      pending: false,
      saving: false,
      objectUrl: null,
      loadToken: 0
    }
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function tokenize(text) {
    return String(text).match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || [];
  }

  function buildTips(text, index) {
    if (index === 296) {
      return [
        {
          label: "Individual",
          text: "「インディヴィジュアル」と音節を均等にせず、-vi- を一番強くします。後半は力を抜いて「ジュル」のように短く流します。"
        },
        {
          label: "experiences",
          text: "ex- は低く弱く入り、-spe- を強くします。語尾の -s に「イズ」と母音を足さず、短い /z/ で終えます。"
        },
        {
          label: "different / general",
          text: "different は「ディファレント」と3音節にせず、中央を弱めた2音節感覚で。general は gen- を強くして「ジェンラル」と流します。"
        },
        {
          label: "trends",
          text: "tr- は t と r を別々にせず一息で出し、語尾に「オ」を足しません。最後は /dz/ の子音で止めます。"
        },
        {
          label: "文全体の流れ",
          text: "can be は弱く短い「クン・ビー」。different の t は破裂させず from の f へつなぎ、内容語 Individual / experiences / different / general / trends を山にします。"
        }
      ];
    }

    const words = tokenize(text);
    const tips = [];
    const seen = new Set();

    for (const word of words) {
      const key = word.toLowerCase();
      if (wordTips[key] && !seen.has(key)) {
        tips.push(wordTips[key]);
        seen.add(key);
      }
      if (tips.length >= 2) {
        break;
      }
    }

    const firstWord = words[0] ? words[0].toLowerCase() : "";
    if (/[th]/i.test(text) && tips.length < 4) {
      tips.push({
        label: "th の音",
        text: "th は t や d と分けず、舌先を軽く歯の間に出して息を通します。語頭以外では力みすぎず短く。"
      });
    }
    if (words.some((word) => /s$|es$|ed$/i.test(word)) && tips.length < 4) {
      tips.push({
        label: "語尾の子音",
        text: "語尾の s / z / d に日本語の母音を足さず、最後の子音を短く閉じます。次の語があればそのままつなげます。"
      });
    }
    if (words.some((word) => /r/i.test(word)) && tips.length < 4) {
      tips.push({
        label: "r の音",
        text: "r は日本語のラ行のように弾かず、舌先をどこにも付けずに口の奥で響かせます。"
      });
    }
    if (tips.length < 3) {
      tips.push({
        label: "強勢と弱形",
        text: "名詞・動詞・形容詞などの内容語を少し強くし、a / to / and などの機能語は短く弱く読んで、文の山を作ります。"
      });
    }
    if (tips.length < 4) {
      tips.push({
        label: firstWord ? firstWord : "文のリズム",
        text: "最初から最後まで同じ強さで読まず、意味の中心になる語を一拍長くします。単語間の小さな隙間をなくして一息で言ってみましょう。"
      });
    }

    return tips.slice(0, 4);
  }

  const weakForms = {
    a: "a は /ə/ の短い曖昧母音にして、一拍にしません",
    an: "an は /ən/ のように短くし、「アン」を強く伸ばしません",
    the: "the は子音の前なら /ðə/、母音の前なら /ði/ とし、「ザ／ジー」を長くしません",
    to: "to は /tə/ に弱め、独立した「トゥ」という一拍にしません",
    and: "and は /ən/ または /n/ に縮め、前後の語を止めずにつなぎます",
    can: "can は通常 /kən/ に弱め、疑問や対比で強調するときだけ /kæn/ にします",
    of: "of は /əv/ に弱め、「オブ」と母音を二つ並べません",
    for: "for は /fər/ に弱め、強調しない限り「フォー」と長くしません",
    from: "from は /frəm/ に近づけ、強調しない限り母音を長くしません",
    are: "are は /ər/ に弱め、前の語と一つの流れにします",
    was: "was は /wəz/ に弱め、「ワズ」を強く区切りません",
    were: "were は /wər/ に弱め、前後の語を滑らかにつなぎます",
    have: "have は /həv/ に弱め、文中で「ハヴ」を強く打ちません",
    has: "has は /həz/ に弱め、語尾の z を短く添えます",
    had: "had は /həd/ に弱め、語尾の d に「ドゥ」を足しません",
    could: "could は /kəd/ に弱め、語尾の l を独立した母音にしません",
    would: "would は /wəd/ に弱め、語尾の d を短く閉じます",
    should: "should は /ʃəd/ に弱め、「シュッド」を一音ずつ区切りません",
    will: "will は /wəl/ に弱め、語尾の l を軽く添えます",
    do: "do は文中では /də/ に弱め、強調しない限り「ドゥ」を長くしません",
    does: "does は /dəz/ に弱め、最後の z を短く添えます"
  };

  const pronunciationPatterns = [
    {
      label: "th の音",
      matches: /th/i,
      text: "th は t や d、日本語の「ス／ズ」に置き換えません。舌先を上下の歯の間にほんの少し出し、/θ/ は息だけ、/ð/ は声を添えます。舌を引いたらすぐ後ろの母音へ移り、舌先を出したまま止めないでください。"
    },
    {
      label: "子音の連続",
      matches: /[bcdfghjklmnpqrstvwxyz]{2}/i,
      text: "隣り合う子音の間に「ウ」「オ」「ア」などの母音を挿入しません。前の子音を短く閉じ、口の形を次の子音へ直接移します。日本語の「ト・レ」「ンド・ズ」のように拍を分けないことが重要です。"
    },
    {
      label: "r の音",
      matches: /r/i,
      text: "r は日本語のラ行のように舌先を弾きません。舌先を上あごにつけず、少し後ろへ引いたまま口の奥を響かせ、次の母音へ滑らかに移ります。"
    },
    {
      label: "l の音",
      matches: /l/i,
      text: "l は日本語のラ行で代用せず、舌先を上の前歯のすぐ後ろへ一瞬だけ触れます。語末の l では「ル」という母音を足さず、舌を置いたまま音を閉じます。"
    },
    {
      label: "f / v の音",
      matches: /[fv]/i,
      text: "f と v は下唇を上の前歯に軽く触れさせます。f は息だけ、v は声を添え、「フ」「ブ」と母音を加えず、触れた場所から次の母音へ直行してください。"
    },
    {
      label: "w の音",
      matches: /w/i,
      text: "w は最初に唇をすぼめ、その形を一瞬でほどいて次の母音へ移します。「ウ」を独立した一拍にせず、唇の動きだけを先に置いてください。"
    },
    {
      label: "ch / sh / j",
      matches: /(?:ch|sh|j)/i,
      text: "ch・sh・j は日本語の「チ／シ／ジ」と同じ長さにしません。摩擦や破裂を短く保ち、直後の母音へ一気に移って、音の間に余分な「イ」を挟まないでください。"
    },
    {
      label: "ng の音",
      matches: /ng/i,
      text: "ng は最後に「グ」を足しません。舌の奥を上あごの奥へ近づけて鼻に響かせ、そのまま閉じます。次に子音が来る場合も「ング」と一拍にしないでください。"
    }
  ];

  const detailedWordGuides = {
    individual: {
      label: "Individual",
      text: "「インディヴィジュアル」と日本語の拍を均等に並べません。最初の in-di- は小さく速く、アクセントの -vi- だけを少し高く長くします。最後の -dual は「ジュ・アル」と二拍にせず、/dʒ/ から弱い母音へ流して「ジュル」に近く短く収めます。"
    },
    experiences: {
      label: "experiences",
      text: "ex- を「エックス」と独立させず /ɪk/ と軽く始め、-spe- を文中の山にします。/sp/ の間に「ス・ピ」と母音を挿入せず、後半の -ences も「エン・セズ」と伸ばしません。複数語尾 /ɪz/ は短く添え、語末で「イズ」を一拍にしないでください。"
    },
    different: {
      label: "different",
      text: "「ディ・ファ・レ・ン・ト」と拍を増やさず、最初の DIF- を強く、中央の /ə/ を弱くして二つのまとまりで言います。最後の t は「ト」と母音を足さず、舌先で息を止めるだけにし、次の語があればすぐつなぎます。"
    },
    general: {
      label: "general",
      text: "「ジェ・ネ・ラ・ル」と四拍にせず、GEN- を強く、-er- を曖昧母音に弱め、最後を「ラル／ル」と短く流します。/dʒ/ を「ジー」と長く引っ張らず、舌を一度だけ上あご近くへ寄せて次の母音へ移ります。"
    },
    trends: {
      label: "trends",
      text: "語頭の /tr/ を「ト・レ」と分けず、舌先を軽く止めてすぐ r の響きへ移ります。/ndz/ は「ンド・ズ」と三拍にせず、n から d、z までを一まとまりにし、最後に「ウ／オ」を足さず子音で閉じます。"
    }
  };

  function uniqueWords(words) {
    return words.filter((word, index) => words.findIndex((candidate) =>
      candidate.toLowerCase() === word.toLowerCase()
    ) === index);
  }

  function formatWords(words) {
    return words.map((word) => "“" + word + "”").join("、");
  }

  function riskScore(word) {
    const lower = word.toLowerCase();
    let score = Math.max(0, lower.length - 3);
    if (/[bcdfghjklmnpqrstvwxyz]{2}/i.test(lower)) score += 3;
    if (/[fvrlw]/i.test(lower)) score += 2;
    if (/th/i.test(lower)) score += 2;
    if (/(?:s|es|ed|ing)$/i.test(lower)) score += 2;
    if (/[aeiouy]{2}/i.test(lower)) score += 1;
    return score;
  }

  function genericWordGuide(word) {
    const lower = word.toLowerCase();
    const ending = /(s|es|ed|ing)$/i.test(lower)
      ? "語尾を「ス／ズ／ド／イング」と独立した一拍にせず、最後の子音を短く閉じます。"
      : "語末に「ウ」「オ」「ア」などを足さず、最後の子音で音を閉じます。";
    const cluster = /[bcdfghjklmnpqrstvwxyz]{2}/i.test(lower)
      ? "子音が続く箇所は間に母音を入れず、口の形を次の子音へ直接移します。"
      : "母音を一つずつ同じ長さで読まず、強い母音と弱い曖昧母音の差をつけます。";
    return {
      label: word,
      text: "“" + word + "”は日本語の拍に分解せず、最も強くする部分を一つ決めて残りを短く弱めます。" + cluster + ending
    };
  }

  function buildSpeechChunks(words) {
    const chunks = [];
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3);
      if (chunk.length) chunks.push(chunk.join(" "));
    }
    return chunks;
  }

  function buildSentenceAnalysis(words) {
    const contentWords = words.filter((word) => !functionWords.has(word.toLowerCase()));
    const focusWords = uniqueWords(contentWords.length ? contentWords : words)
      .sort((a, b) => riskScore(b) - riskScore(a))
      .slice(0, 3);
    const weakWords = uniqueWords(words.filter((word) => weakForms[word.toLowerCase()]));
    const chunks = buildSpeechChunks(words);
    return { focusWords, weakWords, chunks };
  }

  function buildDetailedTips(text) {
    const words = tokenize(text);
    const analysis = buildSentenceAnalysis(words);
    const tips = [];
    const usedLabels = new Set();

    function add(tip) {
      if (!tip || usedLabels.has(tip.label)) return;
      tips.push(tip);
      usedLabels.add(tip.label);
    }

    analysis.focusWords
      .sort((a, b) => {
        const aKey = a.toLowerCase();
        const bKey = b.toLowerCase();
        return (detailedWordGuides[bKey] ? 1 : 0) - (detailedWordGuides[aKey] ? 1 : 0);
      })
      .slice(0, 2)
      .forEach((word) => {
        add(detailedWordGuides[word.toLowerCase()] || genericWordGuide(word));
      });

    pronunciationPatterns
      .filter((candidate) => candidate.matches.test(text))
      .slice(0, 2)
      .forEach(add);

    if (analysis.weakWords.length) {
      const weakWord = analysis.weakWords[0];
      add({
        label: "弱形とリンキング",
        text: weakForms[weakWord.toLowerCase()] + "。その語だけで止めず、次の内容語へ子音や息を渡します。“" + weakWord + "”を独立した一拍にせず、前後を一息でつないでください。"
      });
    } else {
      add({
        label: "母音を足さない",
        text: "単語の終わりや子音の間に日本語の「ウ」「オ」「ア」を足しません。口を開いたまま次の語へ進まず、語末の子音を短く閉じてから次の音へ移します。"
      });
    }

    add({
      label: "文のまとまり",
      text: analysis.chunks.map((chunk) => "“" + chunk + "”").join(" ／ ") +
        " のように3語前後を一息で読みます。単語ごとに停止せず、チャンクの最後だけを軽く区切ってください。"
    });
    add({
      label: "強勢の置き方",
      text: formatWords(analysis.focusWords.length ? analysis.focusWords : words.slice(0, 2)) +
        "を文の山にします。それ以外の語は少し短くし、文全体を同じ音量・同じ長さで読まないことで、カタカナの均等なリズムを崩します。"
    });
    add({
      label: "仕上げ練習",
      text: "まず上の重点語だけを、母音を足さずにゆっくり確認します。次に弱い語を間へ差し込み、最後に文を一息で録音してください。聞き返すときは、語末の「ウ／オ」と単語ごとの停止が残っていないかを確認します。"
    });

    return tips.slice(0, 7);
  }

  function mergeOpeningTips(tips) {
    if (!Array.isArray(tips) || tips.length < 2) return tips;

    const [first, , ...rest] = tips;
    if (!first) return tips;

    // Advice 1 is authored as the concise, sentence-specific opening tip.
    // Keep it intact and omit the legacy second block to avoid duplicated guidance.
    return [first, ...rest];
  }

  function buildFlow(text, index) {
    if (index === 296) {
      return [
        '<span class="flow-chunk strong">Individual experiences</span>',
        '<span class="flow-arrow" aria-hidden="true">／</span>',
        '<span class="flow-chunk">can be</span>',
        '<span class="flow-arrow" aria-hidden="true">／</span>',
        '<span class="flow-chunk strong">different</span>',
        '<span class="flow-arrow" aria-hidden="true">／</span>',
        '<span class="flow-chunk">from</span>',
        '<span class="flow-arrow" aria-hidden="true">／</span>',
        '<span class="flow-chunk strong">general trends.</span>'
      ].join(" ");
    }

    const words = tokenize(text);
    if (words.length <= 5) {
      return '<span class="flow-chunk strong">' + escapeHtml(text) + "</span>";
    }

    const breakAt = Math.max(2, Math.ceil(words.length / 2));
    const first = words.slice(0, breakAt).join(" ");
    const second = words.slice(breakAt).join(" ");
    return [
      '<span class="flow-chunk strong">' + escapeHtml(first) + "</span>",
      '<span class="flow-arrow" aria-hidden="true">／</span>',
      '<span class="flow-chunk">' + escapeHtml(second) + "</span>"
    ].join(" ");
  }

  function currentSentence() {
    return sentences[state.index] || null;
  }

  function formatRecordingDuration(milliseconds) {
    const seconds = Math.max(1, Math.round(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes
      ? minutes + "分" + String(remainder).padStart(2, "0") + "秒"
      : seconds + "秒";
  }

  function selectRecordingMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus"
    ];
    if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== "function") {
      return "";
    }
    return candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) || "";
  }

  function setRecordingStatus(message) {
    if (recordingStatus) {
      recordingStatus.textContent = message;
    }
  }

  function releaseRecordingUrl() {
    if (state.recording.objectUrl) {
      URL.revokeObjectURL(state.recording.objectUrl);
      state.recording.objectUrl = null;
    }
  }

  function clearRecordingAudio() {
    releaseRecordingUrl();
    if (!recordingAudio) {
      return;
    }
    recordingAudio.pause();
    recordingAudio.removeAttribute("src");
    recordingAudio.load();
    recordingAudio.hidden = true;
    if (recordingBadge) {
      recordingBadge.hidden = true;
    }
    if (deleteRecordingButton) {
      deleteRecordingButton.hidden = true;
    }
  }

  function updateRecordingControls() {
    const active = state.recording.recorder && state.recording.recorder.state === "recording";
    const busy = Boolean(active || state.recording.pending || state.recording.saving);
    if (recordButton) {
      recordButton.disabled = state.recording.pending || state.recording.saving;
      recordButton.classList.toggle("is-recording", Boolean(active));
      recordButton.innerHTML = active
        ? '<span aria-hidden="true">■</span>停止して保存'
        : state.recording.saving
          ? "保存しています…"
          : '<span aria-hidden="true">●</span>録音を開始';
    }
    if (nextButton) {
      nextButton.disabled = busy;
    }
    if (deleteRecordingButton) {
      deleteRecordingButton.disabled = busy;
    }
  }

  function showSavedRecording(record) {
    if (!record || !record.blob || !recordingAudio) {
      return;
    }
    releaseRecordingUrl();
    state.recording.objectUrl = URL.createObjectURL(record.blob);
    recordingAudio.src = state.recording.objectUrl;
    recordingAudio.hidden = false;
    if (recordingBadge) {
      recordingBadge.hidden = false;
    }
    if (deleteRecordingButton) {
      deleteRecordingButton.hidden = false;
    }
    const duration = record.durationMs
      ? "（" + formatRecordingDuration(record.durationMs) + "）"
      : "";
    setRecordingStatus("保存済み" + duration + "。再生して確認できます。");
  }

  async function refreshRecording() {
    const token = ++state.recording.loadToken;
    clearRecordingAudio();
    const sentence = currentSentence();
    if (!sentence) {
      return;
    }
    if (!window.PRONUNCIATION_RECORDINGS) {
      setRecordingStatus("このブラウザでは録音保存を利用できません。");
      updateRecordingControls();
      return;
    }
    setRecordingStatus("録音データを確認しています…");
    try {
      const record = await window.PRONUNCIATION_RECORDINGS.get(sentence.id);
      if (token !== state.recording.loadToken) {
        return;
      }
      if (record) {
        showSavedRecording(record);
        updateRecordingControls();
        return;
      }
      setRecordingStatus("この例文の録音はまだありません。");
    } catch {
      if (token === state.recording.loadToken) {
        setRecordingStatus("録音の読み込みに失敗しました。");
      }
    }
    updateRecordingControls();
  }

  function stopRecordingStream() {
    if (state.recording.stream) {
      state.recording.stream.getTracks().forEach((track) => track.stop());
      state.recording.stream = null;
    }
  }

  async function finishRecording(recorder) {
    if (state.recording.recorder !== recorder) {
      return;
    }
    const blob = new Blob(state.recording.chunks, {
      type: recorder.mimeType || state.recording.mimeType || "audio/webm"
    });
    const sentenceId = state.recording.sentenceId;
    const durationMs = performance.now() - state.recording.startedAt;
    stopRecordingStream();
    state.recording.recorder = null;
    state.recording.chunks = [];
    state.recording.sentenceId = null;
    state.recording.startedAt = 0;
    state.recording.mimeType = "";
    if (!blob.size || sentenceId == null || !window.PRONUNCIATION_RECORDINGS) {
      state.recording.saving = false;
      setRecordingStatus("録音データを取得できませんでした。");
      updateRecordingControls();
      return;
    }
    try {
      await window.PRONUNCIATION_RECORDINGS.save({
        sentenceId,
        blob,
        durationMs,
        mimeType: blob.type
      });
      state.recording.saving = false;
      if (currentSentence() && String(currentSentence().id) === String(sentenceId)) {
        await refreshRecording();
      }
    } catch {
      state.recording.saving = false;
      setRecordingStatus("録音の保存に失敗しました。ブラウザの空き容量を確認してください。");
      updateRecordingControls();
    }
  }

  function startRecording() {
    if (state.recording.pending || state.recording.saving || state.recording.recorder) {
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      setRecordingStatus("このブラウザでは録音に対応していません。");
      return;
    }
    const sentence = currentSentence();
    if (!sentence) {
      return;
    }
    state.recording.pending = true;
    setRecordingStatus("マイクの使用を許可してください。");
    updateRecordingControls();
    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }).then((stream) => {
      const current = currentSentence();
      if (!current || String(current.id) !== String(sentence.id)) {
        stream.getTracks().forEach((track) => track.stop());
        state.recording.pending = false;
        updateRecordingControls();
        return;
      }
      const mimeType = selectRecordingMimeType();
      let recorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        throw error;
      }
      state.recording.pending = false;
      state.recording.recorder = recorder;
      state.recording.stream = stream;
      state.recording.chunks = [];
      state.recording.sentenceId = String(sentence.id);
      state.recording.startedAt = performance.now();
      state.recording.mimeType = recorder.mimeType || mimeType;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) {
          state.recording.chunks.push(event.data);
        }
      });
      recorder.addEventListener("error", () => {
        stopRecordingStream();
        state.recording.recorder = null;
        state.recording.pending = false;
        state.recording.saving = false;
        setRecordingStatus("録音中にエラーが発生しました。もう一度お試しください。");
        updateRecordingControls();
      });
      recorder.addEventListener("stop", () => finishRecording(recorder));
      recorder.start(250);
      setRecordingStatus("録音中です。話し終えたら「停止して保存」を押してください。");
      updateRecordingControls();
    }).catch((error) => {
      state.recording.pending = false;
      setRecordingStatus(error && error.name === "NotAllowedError"
        ? "マイクの使用が許可されませんでした。ブラウザの設定を確認してください。"
        : "マイクを利用できませんでした。");
      updateRecordingControls();
    });
  }

  function stopRecording() {
    const recorder = state.recording.recorder;
    if (!recorder || recorder.state !== "recording") {
      return;
    }
    state.recording.saving = true;
    setRecordingStatus("録音を保存しています…");
    updateRecordingControls();
    recorder.stop();
  }

  function toggleRecording() {
    if (state.recording.recorder && state.recording.recorder.state === "recording") {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function deleteCurrentRecording() {
    const sentence = currentSentence();
    if (!sentence || !window.PRONUNCIATION_RECORDINGS) {
      return;
    }
    if (!window.confirm("この例文の録音を削除しますか？")) {
      return;
    }
    state.recording.saving = true;
    setRecordingStatus("録音を削除しています…");
    updateRecordingControls();
    try {
      await window.PRONUNCIATION_RECORDINGS.remove(sentence.id);
      state.recording.saving = false;
      clearRecordingAudio();
      setRecordingStatus("この例文の録音はまだありません。");
      updateRecordingControls();
    } catch {
      state.recording.saving = false;
      setRecordingStatus("録音の削除に失敗しました。");
      updateRecordingControls();
    }
  }

  function render() {
    if (!sentences.length) {
      sentenceHeading.textContent = "例文を読み込めませんでした";
      return;
    }

    const sentence = sentences[state.index];
    stopNarration();
    setNarrationSource(sentence);
    sentenceHeading.textContent = sentence.text;
    sentenceCount.textContent = state.index + 1 + " / " + sentences.length;
    sentenceNumber.textContent = "No. " + String(sentence.id).padStart(3, "0");

      const authoredTips = window.PRONUNCIATION_TIPS && window.PRONUNCIATION_TIPS[sentence.id];
      const tips = mergeOpeningTips(authoredTips || buildDetailedTips(sentence.text));

      tipsList.innerHTML = tips
      .map((tip) => {
        return "<li><strong>" + escapeHtml(tip.label) + "</strong><span>" + escapeHtml(tip.text) + "</span></li>";
      })
      .join("");

    flowExample.innerHTML = buildFlow(sentence.text, state.index);
    refreshRecording();
    updateRecordingControls();
  }

  function nextSentence() {
    if (sentences.length < 2 || state.recording.pending || state.recording.saving || state.recording.recorder) {
      return;
    }

    stopNarration();
    const nextIndex = randomSentenceIndex(state.index);
    state.index = nextIndex;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateVoiceStatus(message) {
    if (message) {
      voiceStatus.textContent = message;
      return;
    }
    voiceStatus.textContent = "収録した高品質英語音声を使用します。";
  }

  function getNarrationAudioUrl(sentence) {
    return PREGENERATED_AUDIO_ROOT + "/" + String(sentence.id).padStart(3, "0") + ".mp3";
  }

  function setNarrationSource(sentence) {
    if (!narrationAudio || !sentence) {
      return;
    }

    const url = getNarrationAudioUrl(sentence);
    narrationAudio.preload = "auto";
    if (narrationAudio.dataset.audioUrl === url) {
      return;
    }

    narrationAudio.dataset.audioUrl = url;
    narrationAudio.src = url;
    narrationAudio.load();
  }

  function stopNarration() {
    state.narrationToken += 1;
    const audio = state.narrationAudio || narrationAudio;
    if (audio) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // The audio may not have loaded metadata yet.
      }
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      state.narrationAudio = null;
    }
  }

  function speakCurrentSentence() {
    const sentence = sentences[state.index];
    if (!sentence || !narrationAudio) {
      return;
    }

    stopNarration();
    const token = state.narrationToken;
    setNarrationSource(sentence);
    state.narrationAudio = narrationAudio;
    narrationAudio.onplay = () => {
      if (token === state.narrationToken) {
        updateVoiceStatus("収録した高品質英語音声で再生中");
      }
    };
    narrationAudio.onended = () => {
      if (token === state.narrationToken) {
        state.narrationAudio = null;
        updateVoiceStatus();
      }
    };
    narrationAudio.onerror = () => {
      if (token === state.narrationToken) {
        state.narrationAudio = null;
        updateVoiceStatus("収録音声を読み込めませんでした。通信状態を確認して、もう一度お試しください。");
      }
    };
    const playPromise = narrationAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        if (token === state.narrationToken) {
          updateVoiceStatus("再生できませんでした。下の音声プレーヤーの再生ボタンを押してください。");
        }
      });
    }
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }

  function setupInstallPrompt() {
    if (isStandalone()) {
      installButton.hidden = true;
      return;
    }

    installButton.hidden = false;

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstall = event;
    });

    if (isIos()) {
      installButton.hidden = false;
      installButton.textContent = "追加方法";
      installButton.addEventListener("click", () => {
        updateVoiceStatus("Safariの共有ボタンから「ホーム画面に追加」を選んでください。");
      });
    } else {
      installButton.textContent = "ホーム画面に追加";
      installButton.addEventListener("click", async () => {
        if (!state.deferredInstall) {
          updateVoiceStatus("ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選んでください。");
          return;
        }
        try {
          state.deferredInstall.prompt();
          const { outcome } = await state.deferredInstall.userChoice;
          state.deferredInstall = null;
          if (outcome === "accepted") {
            installButton.hidden = true;
          }
        } catch {
          state.deferredInstall = null;
          updateVoiceStatus("ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選んでください。");
        }
      });
    }

    window.addEventListener("appinstalled", () => {
      state.deferredInstall = null;
      installButton.hidden = true;
      updateVoiceStatus("ホーム画面に追加しました。");
    });
  }

  nextButton.addEventListener("click", nextSentence);
  speakButton.addEventListener("click", speakCurrentSentence);
  recordButton.addEventListener("click", toggleRecording);
  deleteRecordingButton.addEventListener("click", deleteCurrentRecording);
  render();
  setupInstallPrompt();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
        updateVoiceStatus("オフライン登録は利用できませんが、ページはそのまま使えます。");
      });
    });
  }
})();
