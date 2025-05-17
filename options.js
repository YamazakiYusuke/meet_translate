// オプション保存・復元
const form = document.getElementById('options-form');
const apiKeyInput = document.getElementById('apiKey');
const targetLangSelect = document.getElementById('targetLang');
const modelSelect = document.getElementById('model');
const statusDiv = document.getElementById('status');

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

// 復元
window.addEventListener('DOMContentLoaded', () => {
  if (!chrome || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.get(['apiKey', 'targetLang', 'model'], (items) => {
    if (apiKeyInput && items.apiKey) apiKeyInput.value = items.apiKey;
    if (targetLangSelect && items.targetLang) targetLangSelect.value = items.targetLang;
    if (modelSelect && items.model) modelSelect.value = items.model;
  });
});

// 保存
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!apiKeyInput || !targetLangSelect || !modelSelect) return;
    chrome.storage.local.set({
      apiKey: apiKeyInput.value,
      targetLang: targetLangSelect.value,
      model: modelSelect.value
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