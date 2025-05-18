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

  let captionColor = 'black';
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['captionColor'], (items) => {
      if (items.captionColor === 'white' || items.captionColor === 'black') {
        captionColor = items.captionColor;
      }
    });
    chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.captionColor) {
        captionColor = changes.captionColor.newValue;
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

  function handleCaptionNode(node) {
    if (!translateEnabled) return;
    const text = node.textContent.trim();
    if (!text) return;
    const nodeId = getNodeId(node);
    node.setAttribute('data-mt-nodeid', nodeId);

    // 直前と同じ字幕内容ならAPIリクエストしない（重複検出）
    if (node.getAttribute('data-mt-lasttext') === text) return;
    node.setAttribute('data-mt-lasttext', text);

    // 字幕全体をAPIリクエスト
    console.log('[MT] APIリクエスト:', text);
    chrome.runtime.sendMessage({ type: 'TRANSLATE', text, nodeId });

    // オーバーレイは翻訳結果受信時に描画
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

  // 絶対配置の翻訳オーバーレイをbody直下に表示
  function insertTranslationOverlay(node, translated) {
    removeTranslationOverlay();
    const rect = node.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'mt-translation-overlay';
    overlay.textContent = translated;
    overlay.style.position = 'fixed';
    overlay.style.left = String(rect.left) + 'px';
    overlay.style.top = String(rect.top - 40) + 'px';
    overlay.style.zIndex = '9999';
    overlay.style.fontSize = '24px';
    overlay.style.pointerEvents = 'none';
    overlay.style.whiteSpace = 'pre-wrap';
    overlay.style.maxWidth = '90vw';
    overlay.style.padding = '6px 18px';
    overlay.style.borderRadius = '10px';
    if (captionColor === 'white') {
      overlay.style.color = '#fff';
      overlay.style.background = '#111';
    } else {
      overlay.style.color = '#111';
      overlay.style.background = '#fff';
    }
    document.body.appendChild(overlay);
  }
  function removeTranslationOverlay() {
    document.querySelectorAll('.mt-translation-overlay').forEach(e => e.remove());
  }

  // backgroundから翻訳結果を受信したらchrome.storage.localに保存し、Meet画面に翻訳を重ねて表示
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      console.log('[MT-cs] onMessage受信:', JSON.stringify(msg));
      if (msg.type === 'TRANSLATED' && msg.translated && msg.nodeId) {
        const node = findNodeById(msg.nodeId);
        if (node) {
          insertTranslationOverlay(node, msg.translated);
        }
      }
      if (msg.translated) {
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
    };
  }
})(); 