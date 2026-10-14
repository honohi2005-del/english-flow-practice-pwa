(() => {
  "use strict";

  const sentences = Array.isArray(window.SENTENCES) ? window.SENTENCES : [];
  const START_INDEX_STORAGE_KEY = "english-flow-practice-start-index-v2";

  function randomUnit() {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0] / 4294967296;
    }
    return Math.random();
  }

  function readLastStartIndex() {
    try {
      const stored = Number.parseInt(window.localStorage.getItem(START_INDEX_STORAGE_KEY), 10);
      return Number.isInteger(stored) && stored >= 0 && stored < sentences.length ? stored : -1;
    } catch {
      return -1;
    }
  }

  function chooseInitialIndex() {
    if (sentences.length <= 1) {
      return 0;
    }

    const previousIndex = readLastStartIndex();
    let index;
    do {
      // Keep the first example out of the automatic initial selection. This
      // makes it impossible for the old static No. 001 card to appear as the
      // first card after a fresh load while still choosing randomly.
      index = 1 + Math.floor(randomUnit() * (sentences.length - 1));
    } while (index === previousIndex && sentences.length > 2);

    return index;
  }

  const initialIndex = chooseInitialIndex();
  try {
    window.localStorage.setItem(START_INDEX_STORAGE_KEY, String(initialIndex));
  } catch {
    // Private browsing or restricted storage must not block the app.
  }

  window.__INITIAL_SENTENCE_INDEX__ = initialIndex;

  const sentence = sentences[initialIndex];
  if (!sentence) {
    return;
  }

  const count = document.getElementById("sentence-count");
  const number = document.getElementById("sentence-number");
  const heading = document.getElementById("sentence-heading");

  if (count) {
    count.textContent = `${initialIndex + 1} / ${sentences.length}`;
  }
  if (number) {
    number.textContent = `No. ${String(sentence.id).padStart(3, "0")}`;
  }
  if (heading) {
    heading.textContent = sentence.text;
  }
})();
