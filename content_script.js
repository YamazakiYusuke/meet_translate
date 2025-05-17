// Google Meetのキャプション要素を監視し、検出したテキストをbackgroundに送信し、翻訳を字幕直下に挿入する本実装
(function () {
  const CAPTION_CLASS = 'bh44bd'; // VbkSUeは動的な場合があるため主クラスのみ
  const TRANSLATION_CLASS = 'mt-translation';
  const TRANSLATED_ATTR = 'data-mt-translated';

  // 字幕要素を監視し、未翻訳なら送信
  function observeCaptions() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.classList.contains(CAPTION_CLASS)) {
            handleCaptionNode(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 字幕ノードの処理
  // 直前の字幕内容をnodeIdごとに記憶
  const lastCaptionTextMap = new Map();
  function handleCaptionNode(node) {
    // 既に翻訳済みならスキップ
    if (node.getAttribute(TRANSLATED_ATTR)) return;
    const text = node.textContent.trim();
    if (!text) return;
    const nodeId = getNodeId(node);
    // 直前と同じ内容ならスキップ
    if (lastCaptionTextMap.get(nodeId) === text) return;
    lastCaptionTextMap.set(nodeId, text);
    // 既存翻訳オーバーレイ除去
    removeTranslation(node);
    // 翻訳リクエスト
    chrome.runtime.sendMessage({ type: 'TRANSLATE', text, nodeId });
    node.setAttribute(TRANSLATED_ATTR, 'pending');
  }

  // 翻訳オーバーレイを挿入
  function insertTranslation(node, translated) {
    removeTranslation(node);
    const overlay = document.createElement('div');
    overlay.className = TRANSLATION_CLASS;
    overlay.textContent = translated;
    node.appendChild(overlay);
    node.setAttribute(TRANSLATED_ATTR, 'done');
  }

  // 既存翻訳オーバーレイ除去
  function removeTranslation(node) {
    Array.from(node.getElementsByClassName(TRANSLATION_CLASS)).forEach(e => e.remove());
    node.removeAttribute(TRANSLATED_ATTR);
  }

  // ノード一意ID生成（XPath的な）
  function getNodeId(node) {
    if (!node) return '';
    let path = '';
    while (node && node !== document.body) {
      let idx = 0;
      let sib = node;
      while ((sib = sib.previousElementSibling)) idx++;
      path = `/${node.nodeName}[${idx}]` + path;
      node = node.parentElement;
    }
    return path;
  }

  // 翻訳結果を受信し、該当ノードに挿入
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'TRANSLATED' && msg.nodeId) {
        const node = findNodeById(msg.nodeId);
        if (node) insertTranslation(node, msg.translated);
      }
    });
  }

  // XPath的IDからノードを探索
  function findNodeById(nodeId) {
    if (!nodeId) return null;
    let node = document.body;
    const parts = nodeId.split('/').filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^(\w+)\[(\d+)\]$/);
      if (!match) return null;
      const [, tag, idx] = match;
      let count = 0;
      let found = null;
      for (const child of node.children) {
        if (child.nodeName === tag) {
          if (count == idx) { found = child; break; }
          count++;
        }
      }
      if (!found) return null;
      node = found;
    }
    return node;
  }

  // 初期化
  observeCaptions();

  // テスト用にエクスポート
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      handleCaptionNode,
      _resetLastCaptionTextMap: () => lastCaptionTextMap.clear(),
    };
  }
})(); 