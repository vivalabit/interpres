const SETTINGS_VERSION = 3;
const DEFAULT_SETTINGS = {
  targetLanguage: "English",
  explanationLanguage: "English",
  autoSpeakExplanation: false,
  settingsVersion: SETTINGS_VERSION
};

const form = document.getElementById("settings-form");
const targetLanguageInput = document.getElementById("targetLanguage");
const explanationLanguageInput = document.getElementById("explanationLanguage");
const autoSpeakExplanationInput = document.getElementById("autoSpeakExplanation");
const statusElement = document.getElementById("status");

document.addEventListener("DOMContentLoaded", restoreSettings);
form.addEventListener("submit", handleSubmit);

async function restoreSettings() {
  const settings = await getStorageItems(DEFAULT_SETTINGS);
  const migratedSettings = await migrateLegacySettingsIfNeeded(settings);
  const targetLanguage =
    normalizeText(migratedSettings.targetLanguage) || DEFAULT_SETTINGS.targetLanguage;
  const explanationLanguage =
    normalizeText(migratedSettings.explanationLanguage) ||
    targetLanguage ||
    DEFAULT_SETTINGS.explanationLanguage;

  targetLanguageInput.value = targetLanguage;
  explanationLanguageInput.value = explanationLanguage;
  autoSpeakExplanationInput.checked = Boolean(migratedSettings.autoSpeakExplanation);
}

async function handleSubmit(event) {
  event.preventDefault();

  const targetLanguage = normalizeText(targetLanguageInput.value) || DEFAULT_SETTINGS.targetLanguage;
  const explanationLanguage = normalizeText(explanationLanguageInput.value) || targetLanguage;
  const autoSpeakExplanation = autoSpeakExplanationInput.checked;

  await setStorageItems({
    targetLanguage,
    explanationLanguage,
    autoSpeakExplanation,
    settingsVersion: SETTINGS_VERSION
  });

  targetLanguageInput.value = targetLanguage;
  explanationLanguageInput.value = explanationLanguage;

  statusElement.textContent = "Settings saved";
  window.setTimeout(() => {
    statusElement.textContent = "";
  }, 1800);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getStorageItems(defaults) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaults, resolve);
  });
}

function setStorageItems(items) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(items, resolve);
  });
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
