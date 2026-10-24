(() => {
  "use strict";

  const config = window.GOOGLE_DRIVE_CONFIG || {};
  const APP_ID = "english-flow-practice";
  const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const DRIVE_API = "https://www.googleapis.com/drive/v3";
  const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
  const ENABLED_KEY = "english-flow-practice:drive-sync-enabled";
  const PENDING_DELETIONS_KEY = "english-flow-practice:drive-sync-pending-deletions";
  const LAST_SYNC_KEY = "english-flow-practice:drive-sync-last-sync";
  const RECORD_TYPE = "pronunciation-recording";
  const TOMBSTONE_TYPE = "pronunciation-recording-tombstone";

  const state = {
    initialized: false,
    syncing: false,
    accessToken: "",
    accessTokenExpiresAt: 0,
    tokenRequest: null,
    syncTimer: null,
  };

  const ui = {
    enableButton: null,
    nowButton: null,
    status: null,
  };

  function hasConfiguration() {
    return typeof config.clientId === "string" && config.clientId.trim().length > 0;
  }

  function isEnabled() {
    return window.localStorage.getItem(ENABLED_KEY) === "true";
  }

  function setEnabled(value) {
    if (value) {
      window.localStorage.setItem(ENABLED_KEY, "true");
    } else {
      window.localStorage.removeItem(ENABLED_KEY);
    }
  }

  function getPendingDeletions() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(PENDING_DELETIONS_KEY) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed;
    } catch (_error) {
      return {};
    }
  }

  function savePendingDeletions(pending) {
    const ids = Object.keys(pending);
    if (ids.length === 0) {
      window.localStorage.removeItem(PENDING_DELETIONS_KEY);
      return;
    }
    window.localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(pending));
  }

  function normalizedTime(value) {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? time : 0;
  }

  function formatTime(value) {
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(value);
    } catch (_error) {
      return value.toLocaleTimeString();
    }
  }

  function setStatus(message, isError) {
    if (!ui.status) {
      return;
    }
    ui.status.textContent = message;
    ui.status.dataset.state = isError ? "error" : "normal";
  }

  function updateButtons() {
    if (!ui.enableButton || !ui.nowButton) {
      return;
    }

    if (!hasConfiguration()) {
      ui.enableButton.disabled = true;
      ui.enableButton.textContent = "同期を設定できません";
      ui.nowButton.disabled = true;
      if (!state.syncing) {
        setStatus(
          "Google OAuth設定が未登録です。管理者がWebクライアントIDを設定すると利用できます。",
          true
        );
      }
      return;
    }

    ui.enableButton.disabled = state.syncing;
    ui.enableButton.textContent = isEnabled()
      ? "Google Drive同期を再認証"
      : "Google Drive同期を有効化";
    ui.nowButton.disabled = state.syncing || !isEnabled();
  }

  function createError(message, code, status, detail) {
    const error = new Error(message);
    error.code = code || "";
    error.status = status || 0;
    error.detail = detail || "";
    return error;
  }

  function sanitizeErrorText(value) {
    return String(value || "")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
  }

  function parseApiErrorBody(detail) {
    if (!detail) {
      return "";
    }
    try {
      const payload = JSON.parse(detail);
      const apiError = payload && payload.error;
      if (apiError && typeof apiError === "object") {
        return sanitizeErrorText(
          [
            apiError.status,
            apiError.message,
            apiError.errors && apiError.errors[0] && apiError.errors[0].reason,
          ]
            .filter(Boolean)
            .join(" / ")
        );
      }
    } catch (_error) {
      // The response may be a plain-text or HTML error page.
    }
    return sanitizeErrorText(detail);
  }

  function formatSyncError(error) {
    const code = error && error.code;
    const status = Number(error && error.status) || 0;
    const detail = sanitizeErrorText(error && (error.detail || error.message));
    const suffix = detail ? " (" + detail + ")" : "";

    if (code === "AUTH_REQUIRED") {
      return "Google Driveの認証が必要です。『Google Drive同期を再認証』を押してください。" + suffix;
    }
    if (code === "GIS_UNAVAILABLE") {
      return "Google認証サービスを読み込めませんでした。ページを再読み込みして再試行してください。";
    }
    if (code === "NETWORK_ERROR") {
      return "Google Driveへ接続できませんでした。通信状態を確認して再試行してください。" + suffix;
    }
    if (
      code === "DRIVE_API_ERROR" &&
      (status === 403 || /forbidden|permission|insufficient|drive api|api has not been used|accessnotconfigured/i.test(detail))
    ) {
      return "Google Drive APIまたは権限で拒否されました。Google CloudのDrive API・OAuth設定を確認してください。" + suffix;
    }
    if (code === "DRIVE_API_ERROR" && status === 429) {
      return "Google Driveの利用制限に達しました。少し待って再試行してください。" + suffix;
    }
    if (code === "DRIVE_API_ERROR") {
      return "Google Drive APIで同期に失敗しました。" + suffix;
    }
    return detail
      ? "Google Drive同期に失敗しました。詳細: " + detail
      : "Google Drive同期に失敗しました。ページを再読み込みして再試行してください。";
  }

  function clearAccessToken() {
    state.accessToken = "";
    state.accessTokenExpiresAt = 0;
  }

  function waitForIdentityServices() {
    if (
      window.google &&
      window.google.accounts &&
      window.google.accounts.oauth2 &&
      typeof window.google.accounts.oauth2.initTokenClient === "function"
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const poll = () => {
        if (
          window.google &&
          window.google.accounts &&
          window.google.accounts.oauth2 &&
          typeof window.google.accounts.oauth2.initTokenClient === "function"
        ) {
          resolve();
          return;
        }
        if (Date.now() - startedAt >= 15000) {
          reject(createError("Google認証サービスを読み込めませんでした。", "GIS_UNAVAILABLE"));
          return;
        }
        window.setTimeout(poll, 100);
      };
      poll();
    });
  }

  function requestAccessToken(interactive) {
    if (
      state.accessToken &&
      Date.now() < state.accessTokenExpiresAt - 60000
    ) {
      return Promise.resolve(state.accessToken);
    }

    if (state.tokenRequest) {
      return state.tokenRequest;
    }

    const request = waitForIdentityServices().then(
      () =>
        new Promise((resolve, reject) => {
          const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: config.clientId.trim(),
            scope: SCOPE,
            callback: (response) => {
              if (!response || response.error || !response.access_token) {
                reject(
                  createError(
                    response && response.error_description
                      ? response.error_description
                      : "Google Driveへのアクセスが許可されませんでした。",
                    "AUTH_REQUIRED",
                    0,
                    response && (response.error_description || response.error)
                  )
                );
                return;
              }
              state.accessToken = response.access_token;
              state.accessTokenExpiresAt =
                Date.now() + (Number(response.expires_in) || 3600) * 1000;
              resolve(state.accessToken);
            },
            error_callback: (error) => {
              reject(
                createError(
                  "Google認証を完了できませんでした。",
                  "AUTH_REQUIRED",
                  0,
                  error && (error.type || error.message)
                )
              );
            },
          });

          try {
            tokenClient.requestAccessToken({
              prompt: interactive ? "consent" : "",
            });
          } catch (error) {
            reject(error);
          }
        })
    );

    state.tokenRequest = request.finally(() => {
      state.tokenRequest = null;
    });
    return state.tokenRequest;
  }

  async function driveFetch(url, options, interactive) {
    const token = await requestAccessToken(Boolean(interactive));
    const headers = new Headers((options && options.headers) || {});
    headers.set("Authorization", "Bearer " + token);
    const requestOptions = Object.assign({}, options || {}, { headers });
    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      throw createError(
        "Google Driveへの接続に失敗しました。",
        "NETWORK_ERROR",
        0,
        error && error.message
      );
    }

    if (response.status === 401) {
      clearAccessToken();
      const renewedToken = await requestAccessToken(Boolean(interactive));
      headers.set("Authorization", "Bearer " + renewedToken);
      try {
        response = await fetch(url, requestOptions);
      } catch (error) {
        throw createError(
          "Google Driveへの接続に失敗しました。",
          "NETWORK_ERROR",
          0,
          error && error.message
        );
      }
    }
    return response;
  }

  async function requireOk(response) {
    if (response.ok) {
      return response;
    }
    let rawDetail = "";
    try {
      rawDetail = (await response.text()).slice(0, 1000);
    } catch (_error) {
      rawDetail = "";
    }
    const detail = parseApiErrorBody(rawDetail);
    if (response.status === 401) {
      throw createError(
        "Google Driveの認証が切れました。再認証してください。",
        "AUTH_REQUIRED",
        401,
        detail
      );
    }
    throw createError(
      "Google Drive APIがエラーを返しました。",
      "DRIVE_API_ERROR",
      response.status,
      detail
    );
  }

  async function listRemoteFiles(interactive) {
    const files = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        spaces: "appDataFolder",
        pageSize: "1000",
        q:
          "appProperties has { key='app' and value='" +
          APP_ID +
          "' } and trashed = false",
        fields:
          "nextPageToken,files(id,name,mimeType,size,modifiedTime,appProperties)",
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }
      const response = await driveFetch(
        DRIVE_API + "/files?" + params.toString(),
        { method: "GET" },
        interactive
      );
      await requireOk(response);
      const data = await response.json();
      files.push(...(Array.isArray(data.files) ? data.files : []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return files;
  }

  function makeRemoteIndex(files) {
    const index = new Map();
    for (const file of files) {
      const properties = file.appProperties || {};
      const type = properties.type;
      const sentenceId = String(properties.sentenceId || "");
      if (
        !sentenceId ||
        (type !== RECORD_TYPE && type !== TOMBSTONE_TYPE)
      ) {
        continue;
      }

      const entry = {
        kind: type === RECORD_TYPE ? "record" : "tombstone",
        file,
        sentenceId,
        updatedAt: properties.updatedAt || file.modifiedTime || "",
      };
      const previous = index.get(sentenceId);
      const entryTime = normalizedTime(entry.updatedAt);
      const previousTime = previous ? normalizedTime(previous.updatedAt) : -1;
      const entryPriority = entry.kind === "tombstone" ? 2 : 1;
      const previousPriority =
        previous && previous.kind === "tombstone" ? 2 : 1;
      if (
        !previous ||
        entryTime > previousTime ||
        (entryTime === previousTime && entryPriority > previousPriority)
      ) {
        index.set(sentenceId, entry);
      }
    }
    return index;
  }

  function makeMultipartBody(metadata, payload, mimeType) {
    const boundary =
      "----EnglishFlowPractice" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2);
    const body = new Blob(
      [
        "--" + boundary + "\r\n",
        "Content-Type: application/json; charset=UTF-8\r\n\r\n",
        JSON.stringify(metadata),
        "\r\n--" + boundary + "\r\n",
        "Content-Type: " + (mimeType || "application/octet-stream") + "\r\n\r\n",
        payload,
        "\r\n--" + boundary + "--\r\n",
      ],
      { type: "multipart/related; boundary=" + boundary }
    );
    return { body, contentType: "multipart/related; boundary=" + boundary };
  }

  async function uploadFile(metadata, payload, mimeType, fileId, interactive) {
    const multipart = makeMultipartBody(metadata, payload, mimeType);
    const endpoint = fileId
      ? DRIVE_UPLOAD_API +
        "/files/" +
        encodeURIComponent(fileId) +
        "?uploadType=multipart"
      : DRIVE_UPLOAD_API + "/files?uploadType=multipart";
    const response = await driveFetch(
      endpoint,
      {
        method: fileId ? "PATCH" : "POST",
        headers: {
          "Content-Type": multipart.contentType,
        },
        body: multipart.body,
      },
      interactive
    );
    await requireOk(response);
    return response.json();
  }

  async function removeRemoteFile(fileId, interactive) {
    const response = await driveFetch(
      DRIVE_API + "/files/" + encodeURIComponent(fileId),
      { method: "DELETE" },
      interactive
    );
    await requireOk(response);
  }

  async function downloadRemoteFile(file) {
    const response = await driveFetch(
      DRIVE_API +
        "/files/" +
        encodeURIComponent(file.id) +
        "?alt=media",
      { method: "GET" },
      false
    );
    await requireOk(response);
    return response.blob();
  }

  function recordMetadata(record, isPatch) {
    const sentenceId = String(record.sentenceId);
    const updatedAt = record.updatedAt || new Date().toISOString();
    const createdAt = record.createdAt || updatedAt;
    return {
      name: "pronunciation-" + sentenceId + ".webm",
      mimeType: record.mimeType || record.blob.type || "audio/webm",
      ...(isPatch ? {} : { parents: ["appDataFolder"] }),
      appProperties: {
        app: APP_ID,
        type: RECORD_TYPE,
        sentenceId,
        createdAt,
        updatedAt,
        durationMs: String(Number(record.durationMs) || 0),
        mimeType: record.mimeType || record.blob.type || "audio/webm",
      },
    };
  }

  function tombstoneMetadata(sentenceId, updatedAt) {
    return {
      name: "pronunciation-" + sentenceId + ".deleted.json",
      mimeType: "application/json",
      parents: ["appDataFolder"],
      appProperties: {
        app: APP_ID,
        type: TOMBSTONE_TYPE,
        sentenceId: String(sentenceId),
        updatedAt,
      },
    };
  }

  function tombstonePayload(sentenceId, updatedAt) {
    return new Blob(
      [
        JSON.stringify({
          app: APP_ID,
          type: TOMBSTONE_TYPE,
          sentenceId: String(sentenceId),
          updatedAt,
        }),
      ],
      { type: "application/json" }
    );
  }

  function localRecordTime(record) {
    return normalizedTime(record && (record.updatedAt || record.createdAt));
  }

  async function getLocalRecords() {
    if (
      !window.PRONUNCIATION_RECORDINGS ||
      typeof window.PRONUNCIATION_RECORDINGS.getAll !== "function"
    ) {
      throw createError("録音ストアを初期化できませんでした。", "STORE_UNAVAILABLE");
    }
    const records = await window.PRONUNCIATION_RECORDINGS.getAll();
    return Array.isArray(records) ? records : [];
  }

  async function saveRemoteRecord(remoteEntry, localRecord, interactive) {
    const metadata = recordMetadata(localRecord, Boolean(remoteEntry));
    const fileId =
      remoteEntry && remoteEntry.kind === "record"
        ? remoteEntry.file.id
        : null;
    await uploadFile(
      metadata,
      localRecord.blob,
      localRecord.mimeType || localRecord.blob.type || "audio/webm",
      fileId,
      interactive
    );
    if (remoteEntry && remoteEntry.kind === "tombstone") {
      await removeRemoteFile(remoteEntry.file.id, interactive);
    }
  }

  async function saveRemoteTombstone(remoteEntry, sentenceId, updatedAt, interactive) {
    const metadata = tombstoneMetadata(sentenceId, updatedAt);
    const fileId =
      remoteEntry && remoteEntry.kind === "tombstone"
        ? remoteEntry.file.id
        : null;
    await uploadFile(
      metadata,
      tombstonePayload(sentenceId, updatedAt),
      "application/json",
      fileId,
      interactive
    );
  }

  async function applyRemoteRecord(entry) {
    const blob = await downloadRemoteFile(entry.file);
    const properties = entry.file.appProperties || {};
    await window.PRONUNCIATION_RECORDINGS.save({
      sentenceId: entry.sentenceId,
      blob,
      durationMs: Number(properties.durationMs) || 0,
      createdAt: properties.createdAt || entry.updatedAt,
      updatedAt: entry.updatedAt,
      mimeType: properties.mimeType || entry.file.mimeType || blob.type || "audio/webm",
    });
  }

  async function synchronize(interactive) {
    const localRecords = await getLocalRecords();
    const localIndex = new Map(
      localRecords.map((record) => [String(record.sentenceId), record])
    );
    const pending = getPendingDeletions();
    let remoteIndex = makeRemoteIndex(await listRemoteFiles(interactive));

    for (const sentenceId of Object.keys(pending)) {
      if (localIndex.has(sentenceId)) {
        delete pending[sentenceId];
        continue;
      }

      const deletedAt = pending[sentenceId] || new Date().toISOString();
      const remoteEntry = remoteIndex.get(sentenceId);
      const remoteTime = remoteEntry
        ? normalizedTime(remoteEntry.updatedAt)
        : 0;

      if (
        remoteEntry &&
        remoteEntry.kind === "record" &&
        remoteTime > normalizedTime(deletedAt)
      ) {
        await applyRemoteRecord(remoteEntry);
        localIndex.set(
          sentenceId,
          await window.PRONUNCIATION_RECORDINGS.get(sentenceId)
        );
        delete pending[sentenceId];
        continue;
      }

      if (remoteEntry && remoteEntry.kind === "record") {
        await removeRemoteFile(remoteEntry.file.id, interactive);
      }
      await saveRemoteTombstone(
        remoteEntry && remoteEntry.kind === "tombstone" ? remoteEntry : null,
        sentenceId,
        deletedAt,
        interactive
      );
      delete pending[sentenceId];
    }
    savePendingDeletions(pending);

    remoteIndex = makeRemoteIndex(await listRemoteFiles(interactive));
    const sentenceIds = new Set([
      ...Array.from(localIndex.keys()),
      ...Array.from(remoteIndex.keys()),
    ]);

    for (const sentenceId of sentenceIds) {
      const localRecord = localIndex.get(sentenceId);
      const remoteEntry = remoteIndex.get(sentenceId);

      if (remoteEntry && remoteEntry.kind === "tombstone") {
        if (
          localRecord &&
          localRecordTime(localRecord) > normalizedTime(remoteEntry.updatedAt)
        ) {
          await saveRemoteRecord(remoteEntry, localRecord, interactive);
        } else if (localRecord) {
          await window.PRONUNCIATION_RECORDINGS.remove(sentenceId);
        }
        continue;
      }

      if (remoteEntry && remoteEntry.kind === "record") {
        if (!localRecord) {
          await applyRemoteRecord(remoteEntry);
        } else if (
          localRecordTime(localRecord) > normalizedTime(remoteEntry.updatedAt)
        ) {
          await saveRemoteRecord(remoteEntry, localRecord, interactive);
        } else if (
          localRecordTime(localRecord) < normalizedTime(remoteEntry.updatedAt)
        ) {
          await applyRemoteRecord(remoteEntry);
        }
        continue;
      }

      if (localRecord) {
        await saveRemoteRecord(null, localRecord, interactive);
      }
    }
  }

  function scheduleSync(delay) {
    if (!isEnabled() || !hasConfiguration() || state.syncing) {
      return;
    }
    if (state.syncTimer) {
      window.clearTimeout(state.syncTimer);
    }
    state.syncTimer = window.setTimeout(() => {
      state.syncTimer = null;
      syncNow(false);
    }, Number(delay) || 1000);
  }

  async function syncNow(interactive) {
    if (state.syncing) {
      return;
    }
    if (!hasConfiguration()) {
      setStatus(
        "Google OAuth設定が未登録です。管理者がWebクライアントIDを設定すると利用できます。",
        true
      );
      return;
    }
    if (!isEnabled()) {
      setStatus("先に「Google Drive同期を有効化」を押してください。", false);
      return;
    }

    state.syncing = true;
    updateButtons();
    setStatus("Google Driveと録音を同期しています…", false);
    try {
      await synchronize(Boolean(interactive));
      const syncedAt = new Date().toISOString();
      window.localStorage.setItem(LAST_SYNC_KEY, syncedAt);
      setStatus("最終同期: " + formatTime(new Date(syncedAt)), false);
    } catch (error) {
      setStatus(formatSyncError(error), true);
      console.warn("Google Drive sync failed", error);
    } finally {
      state.syncing = false;
      updateButtons();
    }
  }

  function bindUi() {
    ui.enableButton = document.getElementById("drive-sync-enable");
    ui.nowButton = document.getElementById("drive-sync-now");
    ui.status = document.getElementById("drive-sync-status");
    if (!ui.enableButton || !ui.nowButton || !ui.status) {
      return false;
    }

    ui.enableButton.addEventListener("click", () => {
      if (!hasConfiguration()) {
        return;
      }
      setEnabled(true);
      updateButtons();
      syncNow(true);
    });
    // 通常の手動同期は、既存のGoogle許可をサイレントに再利用する。
    ui.nowButton.addEventListener("click", () => syncNow(false));

    window.addEventListener("recording-store-changed", (event) => {
      const detail = event && event.detail;
      const sentenceId = detail && detail.sentenceId != null
        ? String(detail.sentenceId)
        : "";
      if (!sentenceId || state.syncing) {
        return;
      }

      const pending = getPendingDeletions();
      if (detail.action === "remove") {
        pending[sentenceId] = new Date().toISOString();
      } else if (detail.action === "save") {
        delete pending[sentenceId];
      }
      savePendingDeletions(pending);
      scheduleSync(1200);
    });

    return true;
  }

  function init() {
    if (state.initialized) {
      return;
    }
    state.initialized = true;
    if (!bindUi()) {
      return;
    }
    updateButtons();

    if (hasConfiguration() && isEnabled()) {
      const lastSync = window.localStorage.getItem(LAST_SYNC_KEY);
      if (lastSync) {
        setStatus("前回の同期: " + formatTime(new Date(lastSync)), false);
      } else {
        setStatus("Google Drive同期を確認しています…", false);
      }
      scheduleSync(800);
    } else if (hasConfiguration()) {
      setStatus(
        "この端末では未有効化です。同じGoogleアカウントの端末で一度だけ有効化してください。",
        false
      );
    }
  }

  window.GOOGLE_DRIVE_SYNC = Object.freeze({
    init,
    syncNow,
    isEnabled,
    hasConfiguration,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
