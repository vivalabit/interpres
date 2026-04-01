const BACKEND_ENDPOINT = "http://localhost:8787/api/translate-explain";
const CONTEXT_MENU_ID = "selection-translator.translate-explain";
const MAX_SELECTION_LENGTH = 300;
const BACKEND_TIMEOUT_MS = 25000;
const SETTINGS_VERSION = 3;
const DEFAULT_SETTINGS = {
  targetLanguage: "English",
  explanationLanguage: "English",
  autoSpeakExplanation: false,
  settingsVersion: SETTINGS_VERSION
};

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let text = "";
  let rect = null;

  try {
    if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
      return;
    }

    await ensureContentScript(tab.id);

    const snapshot = await getSelectionSnapshot(tab.id);
    text = normalizeText(snapshot?.text || info.selectionText);
    rect = snapshot?.rect || null;

    if (!text) {
      await notifyTab(tab.id, {
        type: "selection-translator:error",
        error: "Could not read the selected text",
        rect: null
      });
      return;
    }

    if (text.length > MAX_SELECTION_LENGTH) {
      await notifyTab(tab.id, {
        type: "selection-translator:error",
        error: "Select a shorter fragment",
        rect
      });
      return;
    }

    await notifyTab(tab.id, {
      type: "selection-translator:loading",
      text,
      rect
    });

    const settings = await getSettings();
    const data = await handleTranslateExplain({
      text,
      targetLanguage: settings.targetLanguage,
      explanationLanguage: settings.explanationLanguage
    });

    await notifyTab(tab.id, {
      type: "selection-translator:result",
      text,
      rect,
      data,
      autoSpeakExplanation: Boolean(settings.autoSpeakExplanation)
    });
  } catch (error) {
    if (!tab?.id) {
      return;
    }

    await notifyTab(tab.id, {
      type: "selection-translator:error",
      text,
      rect,
      error: error.message || "Could not complete the translation"
    });
  }
});

async function createContextMenu() {
  await removeAllContextMenus();
  await createContextMenuItem({
    id: CONTEXT_MENU_ID,
    title: "Translate and explain",
    contexts: ["selection"]
  });
}

async function handleTranslateExplain(payload) {
  const requestBody = {
    text: normalizeText(payload?.text),
    targetLanguage: normalizeText(payload?.targetLanguage) || "English",
    explanationLanguage:
      normalizeText(payload?.explanationLanguage) ||
      normalizeText(payload?.targetLanguage) ||
      "English"
  };

  if (!requestBody.text) {
    throw new Error("No text to translate");
  }

  const response = await fetchWithTimeout(BACKEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("Backend returned invalid JSON");
  }

  if (!response.ok) {
    throw new Error(data?.error || `Backend error: ${response.status}`);
  }

  validateResponseShape(data);
  return data;
}

function validateResponseShape(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Backend returned an empty response");
  }

  const isValidInterestingPoints =
    Array.isArray(data.interesting_points) &&
    data.interesting_points.length === 3 &&
    data.interesting_points.every((item) => typeof item === "string");

  if (
    typeof data.detected_source_language !== "string" ||
    typeof data.translation !== "string" ||
    typeof data.simple_explanation !== "string" ||
    typeof data.speakable_explanation !== "string" ||
    !isValidInterestingPoints
  ) {
    throw new Error("Backend returned JSON with an unexpected structure");
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getStorageItems(defaults) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaults, resolve);
  });
}

async function getSettings() {
  const settings = await getStorageItems(DEFAULT_SETTINGS);
  return migrateLegacySettingsIfNeeded(settings);
}

function notifyTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) {
        if (isIgnorableMessagePortError(chrome.runtime.lastError.message)) {
          resolve();
          return;
        }

        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

async function ensureContentScript(tabId) {
  try {
    await sendMessageStrict(tabId, { type: "selection-translator:ping" });
  } catch (error) {
    await executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  }
}

async function migrateLegacySettingsIfNeeded(settings) {
  const targetLanguage = normalizeText(settings?.targetLanguage) || DEFAULT_SETTINGS.targetLanguage;
  const explanationLanguage =
    normalizeText(settings?.explanationLanguage) || targetLanguage || DEFAULT_SETTINGS.explanationLanguage;
  const autoSpeakExplanation = Boolean(settings?.autoSpeakExplanation);
  const settingsVersion = Number(settings?.settingsVersion || 0);

  const shouldResetToEnglishDefaults = settingsVersion < SETTINGS_VERSION;

  const normalizedSettings = shouldResetToEnglishDefaults
    ? {
        targetLanguage: "English",
        explanationLanguage: "English",
        autoSpeakExplanation,
        settingsVersion: SETTINGS_VERSION
      }
    : {
        targetLanguage,
        explanationLanguage,
        autoSpeakExplanation,
        settingsVersion: SETTINGS_VERSION
      };

  if (
    settingsVersion !== normalizedSettings.settingsVersion ||
    targetLanguage !== normalizedSettings.targetLanguage ||
    explanationLanguage !== normalizedSettings.explanationLanguage
  ) {
    await setStorageItems(normalizedSettings);
  }

  return normalizedSettings;
}

function getSelectionSnapshot(tabId) {
  return executeScript({
    target: { tabId },
    func: () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return null;
      }

      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (!text) {
        return null;
      }

      let rect = null;
      try {
        const range = selection.getRangeAt(0);
        const rangeRect = range.getBoundingClientRect();
        const chosenRect =
          rangeRect && (rangeRect.width || rangeRect.height)
            ? rangeRect
            : range.getClientRects().length
              ? range.getClientRects()[0]
              : null;

        if (chosenRect) {
          rect = {
            top: chosenRect.top,
            left: chosenRect.left,
            right: chosenRect.right,
            bottom: chosenRect.bottom,
            width: chosenRect.width,
            height: chosenRect.height
          };
        }
      } catch (error) {
        rect = null;
      }

      return { text, rect };
    }
  }).then((result) => result?.text ? result : null);
}

function removeAllContextMenus() {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function setStorageItems(items) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(items, resolve);
  });
}

function createContextMenuItem(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(createProperties, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function sendMessageStrict(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        if (isIgnorableMessagePortError(chrome.runtime.lastError.message)) {
          resolve(response);
          return;
        }

        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function executeScript(injection) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(injection, (results) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(results?.[0]?.result ?? null);
    });
  });
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, BACKEND_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Backend timed out while waiting for OpenAI");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isIgnorableMessagePortError(message) {
  return typeof message === "string" && message.includes("The message port closed before a response was received.");
}
