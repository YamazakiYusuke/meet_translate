// popupでAPIキー設定状態を表示
window.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['apiKey', 'translateEnabled'], (items) => {
    const status = document.getElementById('popup-status');
    if (items.apiKey) {
      status.textContent = 'APIキー設定済み';
    } else {
      status.textContent = 'APIキー未設定';
    }
    // トグル初期化
    const toggle = document.getElementById('toggle-translate');
    if (toggle) {
      toggle.checked = items.translateEnabled !== false; // デフォルトON
      toggle.addEventListener('change', () => {
        chrome.storage.local.set({ translateEnabled: toggle.checked }, () => {
          status.textContent = toggle.checked ? '翻訳ON' : '翻訳OFF';
          setTimeout(() => status.textContent = '', 1200);
        });
      });
    }
  });
}); 