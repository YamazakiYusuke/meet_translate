// オプション保存・復元
const form = document.getElementById('options-form');
const apiKeyInput = document.getElementById('apiKey');
const targetLangSelect = document.getElementById('targetLang');
const modelSelect = document.getElementById('model');
const statusDiv = document.getElementById('status');
const captionColorSelect = document.getElementById('captionColor');

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
  if (!chrome || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.get(['apiKey', 'targetLang', 'model', 'captionColor'], (items) => {
    if (apiKeyInput && items.apiKey) apiKeyInput.value = items.apiKey;
    if (targetLangSelect && items.targetLang) targetLangSelect.value = items.targetLang;
    if (modelSelect && items.model) modelSelect.value = items.model;
    if (captionColorSelect && items.captionColor) {
      captionColorSelect.value = items.captionColor;
    }
  });
});

// 保存
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!apiKeyInput || !targetLangSelect || !modelSelect || !captionColorSelect) return;
    const captionColor = captionColorSelect.value;
    chrome.storage.local.set({
      apiKey: apiKeyInput.value,
      targetLang: targetLangSelect.value,
      model: modelSelect.value,
      captionColor
    }, () => {
      if (statusDiv) {
        statusDiv.textContent = '保存しました';
        setTimeout(() => statusDiv.textContent = '', 1500);
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