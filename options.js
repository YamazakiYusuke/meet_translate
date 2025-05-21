// オプション保存・復元
const form = document.getElementById('options-form');
const apiKeyInput = document.getElementById('apiKey');
const targetLangSelect = document.getElementById('targetLang');
const modelSelect = document.getElementById('model');
const statusDiv = document.getElementById('status');
const captionColorSelect = document.getElementById('captionColor');
const enableMinutesSwitch = document.getElementById('enableMinutes');
const minutesEmailInput = document.getElementById('minutesEmail');

// 言語プルダウン生成
if (typeof languages !== 'undefined' && targetLangSelect) {
  targetLangSelect.innerHTML = '';
  languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.label;
    targetLangSelect.appendChild(opt);
  });
}

// モデルプルダウン生成
if (typeof models !== 'undefined' && modelSelect) {
  modelSelect.innerHTML = '';
  models.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model.value;
    opt.textContent = model.label;
    modelSelect.appendChild(opt);
  });
}

// 復元
window.addEventListener('DOMContentLoaded', () => {
  if (!chrome || !chrome.storage || !chrome.storage.sync) {
    console.error("Chrome storage sync API not available.");
    return;
  }
  chrome.storage.sync.get(['apiKey', 'targetLang', 'model', 'captionColor', 'enableMinutes', 'minutesEmail'], (items) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading options:", chrome.runtime.lastError);
      if (statusDiv) statusDiv.textContent = 'オプションの読み込みに失敗しました。';
      return;
    }
    if (apiKeyInput && items.apiKey) apiKeyInput.value = items.apiKey;
    if (targetLangSelect && items.targetLang) targetLangSelect.value = items.targetLang;
    if (modelSelect && items.model) modelSelect.value = items.model;
    if (captionColorSelect && items.captionColor) {
      captionColorSelect.value = items.captionColor;
    }
    if (enableMinutesSwitch) enableMinutesSwitch.checked = items.enableMinutes !== undefined ? items.enableMinutes : false;
    if (minutesEmailInput && items.minutesEmail) minutesEmailInput.value = items.minutesEmail;
  });
});

// 保存
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!apiKeyInput || !targetLangSelect || !modelSelect || !captionColorSelect || !enableMinutesSwitch || !minutesEmailInput) return;
    const captionColor = captionColorSelect.value;
    const enableMinutes = enableMinutesSwitch.checked;
    const minutesEmail = minutesEmailInput.value;

    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.error("Chrome storage sync API not available.");
      if (statusDiv) statusDiv.textContent = '設定の保存に失敗しました。ストレージAPIが利用できません。';
      return;
    }

    chrome.storage.sync.set({
      apiKey: apiKeyInput.value,
      targetLang: targetLangSelect.value,
      model: modelSelect.value,
      captionColor,
      enableMinutes,
      minutesEmail
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving options:", chrome.runtime.lastError);
        if (statusDiv) statusDiv.textContent = '保存に失敗しました。';
      } else {
        if (statusDiv) {
          statusDiv.textContent = '保存しました';
          setTimeout(() => statusDiv.textContent = '', 1500);
        }
      }
    });
  });
}

let lastCaptionText = '';

function handleCaptionNode(node) {
  const text = node.textContent.trim();
  if (!text) return;
  if (text === lastCaptionText) return;
  lastCaptionText = text;
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // ...既存処理...
  });
} 