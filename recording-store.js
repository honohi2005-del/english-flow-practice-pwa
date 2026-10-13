(() => {
  "use strict";

  const DB_NAME = "english-flow-practice";
  const STORE_NAME = "pronunciation-recordings";
  const DB_VERSION = 1;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available"));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "sentenceId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open recording storage"));
    });
  }

  function requestStore(mode, operation) {
    return openDatabase().then((database) => new Promise((resolve, reject) => {
      let result;
      let settled = false;

      const close = () => {
        try {
          database.close();
        } catch {
          // The database may already be closed after a failed transaction.
        }
      };

      const fail = (error) => {
        if (settled) return;
        settled = true;
        close();
        reject(error);
      };

      try {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => {
          fail(request.error || new Error("Recording storage request failed"));
        };
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          close();
          resolve(result);
        };
        transaction.onerror = () => {
          fail(transaction.error || new Error("Recording storage transaction failed"));
        };
        transaction.onabort = () => {
          fail(transaction.error || new Error("Recording storage transaction aborted"));
        };
      } catch (error) {
        fail(error);
      }
    }));
  }

  window.PRONUNCIATION_RECORDINGS = {
    get(sentenceId) {
      return requestStore("readonly", (store) => store.get(String(sentenceId)));
    },

    save(record) {
      if (!record || record.sentenceId == null || !(record.blob instanceof Blob)) {
        return Promise.reject(new Error("Invalid recording"));
      }

      return requestStore("readwrite", (store) => store.put({
        sentenceId: String(record.sentenceId),
        blob: record.blob,
        durationMs: Number(record.durationMs) || 0,
        createdAt: record.createdAt || new Date().toISOString(),
        mimeType: record.mimeType || record.blob.type || "audio/webm"
      }));
    },

    remove(sentenceId) {
      return requestStore("readwrite", (store) => store.delete(String(sentenceId)));
    }
  };
})();
