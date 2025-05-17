/* global chrome */
// Google Meetのキャプション要素を監視し、検出したテキストをbackgroundに送信し、翻訳を字幕直下に挿入する本実装
(function () {
  const CAPTION_CLASS = 'bh44bd'; // VbkSUeは動的な場合があるため主クラスのみ
  const TRANSLATION_CLASS = 'mt-translation';
  const TRANSLATED_ATTR = 'data-mt-translated';

  // 翻訳有効フラグ
  let translateEnabled = true;
  // 設定を取得
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    // @ts-ignore
    chrome.storage.local.get(['translateEnabled'], (items) => {
      translateEnabled = items.translateEnabled !== false; // デフォルトON
    });
    // @ts-ignore
    chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.translateEnabled) {
        translateEnabled = changes.translateEnabled.newValue !== false;
      }
    });
  }

  // 字幕要素を監視し、未翻訳なら送信
  function observeCaptions() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        // ノード追加時
        mutation.addedNodes.forEach(node => {
          // @ts-ignore
          if (node.nodeType === 1 && node.classList && node.classList.contains(CAPTION_CLASS)) {
            handleCaptionNode(node);
          }
        });
        // テキストノードの内容が変わった場合
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          if (parent && parent.classList && parent.classList.contains(CAPTION_CLASS)) {
            handleCaptionNode(parent);
          }
        }
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true // テキストノードの変化も監視
    });
  }

  // 字幕ノードの処理
  // 直前の字幕内容をnodeIdごとに記憶
  const lastCaptionTextMap = new Map();
  function handleCaptionNode(node) {
    if (!translateEnabled) return;
    const text = node.textContent.trim();
    if (!text) return;
    const nodeId = getNodeId(node);
    node.setAttribute('data-mt-nodeid', nodeId);
    console.log('handleCaptionNode nodeId:', nodeId, node);
    if (lastCaptionTextMap.get(nodeId) === text) return;
    lastCaptionTextMap.set(nodeId, text);
    // Meet画面への挿入・既存字幕replaceは行わず、翻訳リクエストのみ
    // @ts-ignore
    chrome.runtime.sendMessage({ type: 'TRANSLATE', text, nodeId });
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

  // backgroundから翻訳結果を受信したらchrome.storage.localに保存し、Meet画面に翻訳を重ねて表示
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    // @ts-ignore
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      console.log('onMessage:', msg);
      if (msg.type === 'TRANSLATED' && msg.translated) {
        // Meet画面上に翻訳を重ねて表示
        if (msg.nodeId) {
          // XPath的なnodeIdから該当ノードを探索
          const node = findNodeById(msg.nodeId);
          console.log('findNodeById:', msg.nodeId, node);
          if (node) {
            insertTranslation(node, msg.translated);
          }
        }
        // 最新翻訳をchrome.storage.localにも保存（popup用）
        // @ts-ignore
        chrome.storage.local.set({ latestTranslation: msg.translated });
      }
    });
  }

  // nodeId（XPath的な）からノードを探索
  function findNodeById(nodeId) {
    // data-mt-nodeid属性で直接検索
    return document.querySelector(`[data-mt-nodeid="${CSS.escape(nodeId)}"]`);
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