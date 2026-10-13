(() => {
  "use strict";

  const preferredNames = [
    "male",
    "man",
    "mature",
    "david",
    "alex",
    "daniel",
    "mark",
    "james",
    "guy",
    "fred",
    "george",
    "arthur",
    "oliver"
  ];

  const avoidNames = [
    "female",
    "woman",
    "samantha",
    "zira",
    "victoria",
    "karen",
    "susan",
    "google uk english female",
    "google us english"
  ];

  function scoreVoice(voice, preferredLocale) {
    const name = String(voice.name || "").toLowerCase();
    const lang = String(voice.lang || "").toLowerCase();
    const locale = String(preferredLocale || "en-US").toLowerCase();
    let score = 0;

    if (!lang.startsWith("en")) {
      return -1000;
    }

    if (lang === locale) {
      score += 35;
    } else if (lang.startsWith(locale.slice(0, 2))) {
      score += 18;
    }

    if (voice.localService) {
      score += 6;
    }

    for (const token of preferredNames) {
      if (name.includes(token)) {
        score += 24;
      }
    }

    for (const token of avoidNames) {
      if (name.includes(token)) {
        score -= 40;
      }
    }

    if (name.includes("english") || name.includes("en-us") || name.includes("en_us")) {
      score += 4;
    }

    return score;
  }

  function selectPreferredEnglishVoice(voices, preferredLocale) {
    const available = Array.from(voices || []).filter((voice) => {
      return String(voice.lang || "").toLowerCase().startsWith("en");
    });

    if (!available.length) {
      return null;
    }

    return available
      .map((voice) => ({ voice, score: scoreVoice(voice, preferredLocale) }))
      .sort((left, right) => right.score - left.score)[0].voice;
  }

  function describeVoice(voice) {
    if (!voice) {
      return "英語音声を読み上げます。";
    }

    const label = voice.name || "英語音声";
    const maleLike = preferredNames.some((token) => {
      return String(voice.name || "").toLowerCase().includes(token);
    });

    if (maleLike) {
      return "男性系の英語音声: " + label;
    }

    return "英語音声: " + label + "（端末に男性音声がないため代替）";
  }

  window.selectPreferredEnglishVoice = selectPreferredEnglishVoice;
  window.describeVoice = describeVoice;
})();
