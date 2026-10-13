(() => {
  "use strict";

  const sentences = Array.isArray(window.SENTENCES) ? window.SENTENCES : [];
  const sentenceHeading = document.getElementById("sentence-heading");
  const sentenceCount = document.getElementById("sentence-count");
  const sentenceNumber = document.getElementById("sentence-number");
  const tipsList = document.getElementById("tips-list");
  const flowExample = document.getElementById("flow-example");
  const speakButton = document.getElementById("speak-button");
  const nextButton = document.getElementById("next-button");
  const voiceStatus = document.getElementById("voice-status");
  const installButton = document.getElementById("install-button");

  const functionWords = new Set([
    "a", "an", "the", "am", "is", "are", "was", "were", "be", "been",
    "being", "to", "of", "and", "or", "but", "for", "from", "in", "on",
    "at", "with", "can", "could", "will", "would", "do", "does", "did",
    "that", "this", "than", "as", "if", "it", "i", "my", "our", "we",
    "you", "they", "some", "more", "not", "so", "how", "when", "what",
    "who", "which", "their", "there", "here", "by", "into", "about",
    "after", "before", "while", "should", "must", "may", "might"
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
    index: 0,
    voices: [],
    selectedVoice: null,
    deferredInstall: null
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

  function buildFlow(text, index) {
    if (index === 296) {
      return [
        '<span class="flow-chunk strong">Individual experiences</span>',
        '<span class="flow-arrow" aria-hidden="true">→</span>',
        '<span class="flow-chunk">can be</span>',
        '<span class="flow-arrow" aria-hidden="true">→</span>',
        '<span class="flow-chunk strong">different</span>',
        '<span class="flow-arrow" aria-hidden="true">→</span>',
        '<span class="flow-chunk">from</span>',
        '<span class="flow-arrow" aria-hidden="true">→</span>',
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
      '<span class="flow-arrow" aria-hidden="true">→</span>',
      '<span class="flow-chunk">' + escapeHtml(second) + "</span>"
    ].join(" ");
  }

  function render() {
    if (!sentences.length) {
      sentenceHeading.textContent = "例文を読み込めませんでした";
      return;
    }

    const sentence = sentences[state.index];
    sentenceHeading.textContent = sentence.text;
    sentenceCount.textContent = state.index + 1 + " / " + sentences.length;
    sentenceNumber.textContent = "No. " + String(sentence.id).padStart(3, "0");

    tipsList.innerHTML = buildTips(sentence.text, state.index)
      .map((tip) => {
        return "<li><strong>" + escapeHtml(tip.label) + "</strong><span>" + escapeHtml(tip.text) + "</span></li>";
      })
      .join("");

    flowExample.innerHTML = buildFlow(sentence.text, state.index);
  }

  function nextSentence() {
    if (sentences.length < 2) {
      return;
    }

    let nextIndex = state.index;
    while (nextIndex === state.index) {
      nextIndex = Math.floor(Math.random() * sentences.length);
    }
    state.index = nextIndex;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateVoiceStatus(message) {
    if (message) {
      voiceStatus.textContent = message;
      return;
    }
    voiceStatus.textContent = state.selectedVoice
      ? window.describeVoice(state.selectedVoice)
      : "男性の英語音声を優先します。";
  }

  function refreshVoices() {
    if (!("speechSynthesis" in window)) {
      updateVoiceStatus("この端末は音声読み上げに対応していません。");
      speakButton.disabled = true;
      return;
    }

    state.voices = window.speechSynthesis.getVoices();
    state.selectedVoice = window.selectPreferredEnglishVoice(state.voices, "en-US");
    updateVoiceStatus();
  }

  function speakCurrentSentence() {
    if (!("speechSynthesis" in window)) {
      updateVoiceStatus("この端末は音声読み上げに対応していません。");
      return;
    }

    const sentence = sentences[state.index];
    if (!sentence) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sentence.text);
    utterance.lang = state.selectedVoice ? state.selectedVoice.lang : "en-US";
    utterance.voice = state.selectedVoice || null;
    utterance.rate = 0.82;
    utterance.pitch = 0.78;
    utterance.onstart = () => updateVoiceStatus("再生中: " + (state.selectedVoice ? state.selectedVoice.name : "英語音声"));
    utterance.onend = () => updateVoiceStatus();
    utterance.onerror = () => updateVoiceStatus("音声を再生できませんでした。もう一度お試しください。");
    window.speechSynthesis.speak(utterance);
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
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstall = event;
      installButton.hidden = false;
      installButton.textContent = "ホーム画面に追加";
    });

    if (isIos() && !isStandalone()) {
      installButton.hidden = false;
      installButton.textContent = "追加方法";
      installButton.addEventListener("click", () => {
        updateVoiceStatus("Safariの共有ボタンから「ホーム画面に追加」を選んでください。");
      });
    } else {
      installButton.addEventListener("click", async () => {
        if (!state.deferredInstall) {
          return;
        }
        state.deferredInstall.prompt();
        await state.deferredInstall.userChoice;
        state.deferredInstall = null;
        installButton.hidden = true;
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
  render();
  refreshVoices();
  setupInstallPrompt();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
        updateVoiceStatus("オフライン登録は利用できませんが、ページはそのまま使えます。");
      });
    });
  }
})();
