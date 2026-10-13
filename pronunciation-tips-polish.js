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
  const friendlyReplacements = [
    [
      "文中(?:では|で実際に隣り合う|で)([^。]*?)を単語ごとに切らず、一つの音の流れとして練習します。",
      "文の中では$1を一語ずつ切らず、ひと続きで言います。"
    ],
    ["についての発話です。", "について話しています。"],
    ["まず意味の中心になる", "まずは大事な"],
    ["日本語のカタカナ読みから切り離して練習します。", "カタカナ読みにならないように練習しましょう。"],
    [
      "日本語話者に起きやすい「語中の母音の追加」「子音の置き換え」「語末子音の開き」を避けます。",
      "日本語話者がやりがちな「途中の母音足し」「子音の置き換え」「語尾の母音足し」に気をつけましょう。"
    ],
    ["語末の子音を日本語の母音で開かずに短く閉じます。", "語尾の子音に母音を足さず、短く閉じます。"],
    ["語末の子音を母音で開かずに短く閉じます。", "語尾の子音に母音を足さず、短く閉じます。"],
    ["語末の /z/ の前に「ズー」と母音を足さず、声を残したまま短く止めます。", "語尾の /z/ は「ズー」と伸ばさず、声を残して短く止めます。"],
    ["最後の /tʃ/ を母音付きにせず、息だけで閉じます。", "最後の /tʃ/ は母音を足さず、息だけで閉じます。"],
    ["この文で前に出す内容語は", "ここで強く読む語は"],
    ["この文で特に注意する語は", "ここで特に気をつけたい語は"],
    ["強勢のある母音", "アクセントのある母音"],
    ["強勢語", "強く読む語"],
    ["短い機能語は低く軽く読み", "短い機能語は低く軽く言い"],
    ["内容語なので、弱めすぎずに中心音節を少し長く保ち、", "大事な語なので、中心の音を少し長めにして、"],
    ["これは速く読む練習ではなく、意味の焦点を聞き手に渡すための強弱練習です。", "速さではなく、大事なところを相手に伝える強弱の練習です。"],
    ["内容語から次の内容語までの時間を意識し、弱い語を圧縮します。", "強く読む語と次の強い語の間を意識し、弱い語は短くします。"],
    ["日本語のように全単語を母音で開くと流れが止まるので、子音を次の語へ持ち越してください。", "日本語のように全部の語尾を母音で開くと流れが止まるので、子音を次の語へつなげます。"],
    ["弱い音節を同じ長さ・高さにそろえない", "弱い音を同じ長さ・高さにしない"],
    ["毎回ポーズを置かず", "途中で毎回止まらず"],
    ["意味の区切り", "意味のまとまり"],
    ["一つの音の流れとして", "ひと続きの音として"],
    ["一息でつなぎます", "一息でつなげます"],
    ["一息でつなぐ", "一息でつなげる"],
    ["短く弱く発音し", "短く軽く発音し"],
    ["弱くつないで", "軽くつないで"],
    ["弱い語を圧縮します", "弱い語を短くします"],
    ["最も強くします", "いちばん強くします"],
    ["仕上げでは、", "最後は、"],
    ["まとまりを保って通常速度で", "まとまりを保って普通の速さで"],
    ["意味を相手に届ける速度で", "意味が伝わる速さで"],
    ["各段階で", "毎回"],
    ["意識を持ってください。", "意識しましょう。"],
    ["確認してください。", "チェックしましょう。"],
    ["ことが第一です。", "のがポイントです。"]
  ];

  const polishFriendlyJapanese = (value) => {
    let text = value;

    for (const [from, to] of friendlyReplacements) {
      if (from.startsWith("文中(?:")) {
        text = text.replace(new RegExp(from, "g"), to);
      } else {
        text = text.replaceAll(from, to);
      }
    }

    text = text.replaceAll(
      "語尾は、子音で終わる語だけ「ウ」「オ」「イ」を足さずに音を閉じます。母音で終わる語は一拍増やさず、そのまま次の語へ続けます。",
      "語尾が子音で終わる語は、「ウ」「オ」「イ」を足さずに音を止めます。母音で終わる語は一拍増やさず、そのまま次の語へつなげます。"
    );

    return text;
  };

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

      text = polishFriendlyJapanese(text);

      return { ...tip, text };
    });
  }

  window.PRONUNCIATION_TIPS_POLISHED = true;
})();
