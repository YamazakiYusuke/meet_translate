// オプション保存・復元
const form = document.getElementById('options-form');
const apiKeyInput = document.getElementById('apiKey');
const targetLangInput = document.getElementById('targetLang');
const modelSelect = document.getElementById('model');
const statusDiv = document.getElementById('status');

// 復元
window.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['apiKey', 'targetLang', 'model'], (items) => {
    if (items.apiKey) apiKeyInput.value = items.apiKey;
    if (items.targetLang) targetLangInput.value = items.targetLang;
    if (items.model) modelSelect.value = items.model;
  });
});

// 保存
form.addEventListener('submit', (e) => {
  e.preventDefault();
  chrome.storage.local.set({
    apiKey: apiKeyInput.value,
    targetLang: targetLangInput.value,
    model: modelSelect.value
  }, () => {
    statusDiv.textContent = '保存しました';
    setTimeout(() => statusDiv.textContent = '', 1500);
  });
}); 