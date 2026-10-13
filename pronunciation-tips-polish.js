(function polishPronunciationTips() {
  const tipsById = window.PRONUNCIATION_TIPS;

  if (!tipsById || typeof tipsById !== "object") {
    return;
  }

  const genericLink = "この文では単語を一つずつ同じ強さで読まず、前後の語へそのままつなぎます。";
  const genericCoda = "の語尾を「ウ」「オ」「イ」で開かず、最後の子音で音を止める意識を持ってください。";
  const codaGuidance = "語尾は、子音で終わる語だけ「ウ」「オ」「イ」を足さずに音を閉じます。母音で終わる語は一拍増やさず、そのまま次の語へ続けます。";
  const fallbackLink = "語を一つずつ切らず、強勢語を中心に前後を一息でつなぎます。";
  const weakFunctionWords = new Set([
    "a", "an", "the", "and", "or", "but", "as", "to", "of", "for", "from",
    "in", "on", "at", "by", "with", "can", "could", "will", "would", "should",
    "may", "might", "must", "do", "does", "did", "is", "am", "are", "was",
    "were", "be", "been", "being", "have", "has", "had", "that", "this",
    "these", "those", "it", "he", "she", "we", "they", "you", "i", "my",
    "your", "our", "their", "his", "her", "its", "there", "here", "not",
    "than"
  ]);
  const weakWordPattern = /([A-Za-z][A-Za-z'-]*)\s*は短く弱く発音し、([^。]*)。/g;

  for (const [rawId, authoredTips] of Object.entries(tipsById)) {
    if (!Array.isArray(authoredTips)) {
      continue;
    }

    const linkingTip = authoredTips.find((tip) => tip && tip.label === "音のつながり");
    const linkLead = linkingTip?.text?.match(/文中(?:では|で実際に隣り合う|で)[^。]*。/)?.[0] || fallbackLink;

    tipsById[rawId] = authoredTips.map((tip) => {
      let text = String(tip.text || "");

      text = text.replaceAll(genericLink, linkLead);
      text = text.replaceAll(genericCoda, codaGuidance);

      // 内容語を「弱く短く」と説明すると、英語の文強勢と逆になるため補正する。
      text = text.replace(weakWordPattern, (_match, word, rest) => {
        if (weakFunctionWords.has(word.toLowerCase())) {
          return `${word} は短く弱く発音し、${rest}。`;
        }
        return `${word} は内容語なので、弱めすぎずに中心音節を少し長く保ち、${rest}。`;
      });

      // ステージ練習でも内容語を弱く読む指示を残さない。
      text = text.replace(
        /([A-Za-z][A-Za-z'-]*)\s+弱く短く\s+と続ける/g,
        "$1を短く切らずに続ける"
      );
      text = text.replace(
        /([A-Za-z][A-Za-z'-]*)\s+弱く短く/g,
        "$1を短く切らずに"
      );

      // 同じ発話内で同じリンキング説明が重複する場合は、最初の一度だけ残す。
      const firstLinkIndex = text.indexOf(linkLead);
      if (firstLinkIndex >= 0) {
        const before = text.slice(0, firstLinkIndex + linkLead.length);
        const after = text.slice(firstLinkIndex + linkLead.length).replaceAll(linkLead, "");
        text = before + after;
      }

      // I は子音終わりではないため、語末子音の定型説明を二重母音に合わせて補正する。
      if (rawId === "1") {
        text = text.replace(
          "I。強勢のある母音を中心にし、語末の子音を日本語の母音で開かずに短く閉じます。",
          "I /aɪ/。二重母音を一息で滑らかに動かし、「ア・イ」と二つに切らず、最後に「イー」と母音を足して伸ばしません。"
        );
        text = text.replace(
          "teach は内容語なので、弱めすぎずに中心音節を少し長く保ち、I の終わりからそのまま移ります。",
          "teach は I から切らず、語末の /tʃ/ を閉じて Japanese へ移ります。"
        );
      }

      return { ...tip, text };
    });
  }

  window.PRONUNCIATION_TIPS_POLISHED = true;
})();
