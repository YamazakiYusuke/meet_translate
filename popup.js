// popupでAPIキー設定状態を表示
window.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['apiKey'], (items) => {
    const status = document.getElementById('popup-status');
    if (items.apiKey) {
      status.textContent = 'APIキー設定済み';
    } else {
      status.textContent = 'APIキー未設定';
    }
  });
}); 