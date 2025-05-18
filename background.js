// content scriptからの翻訳リクエストを受け、OpenAI APIにリクエストする本実装
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TRANSLATE') {
    (async () => {
      // 設定取得（仮: chrome.storage.localから）
      const { apiKey, targetLang, model } = await new Promise(resolve => {
        chrome.storage.local.get(['apiKey', 'targetLang', 'model'], resolve);
      });
      if (!apiKey) {
        // APIキー未設定
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATED', original: msg.text, translated: '[APIキー未設定]', nodeId: msg.nodeId, untranslated: msg.untranslated });
        sendResponse();
        return;
      }
      // 入力長に応じてmax_tokensを調整
      const inputLength = msg.text.length;
      const maxTokens = Math.max(60, Math.ceil(inputLength * 1.5), 200); // 200以上に制限
      // OpenAI API呼び出し雛形
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model || 'gpt-4.1-nano',
            messages: [
              { role: 'system', content: `You are a translation engine. Translate the following text to ${targetLang || 'ja'}. Output ONLY the translated sentence.` },
              { role: 'user', content: msg.text }
            ],
            max_tokens: maxTokens
          })
        });
        const data = await response.json();
        const translated = data.choices?.[0]?.message?.content || '[翻訳失敗]';
        console.log('[MT-bg] 送信前 TRANSLATED:', { original: msg.text, translated, nodeId: msg.nodeId, untranslated: msg.untranslated });
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATED', original: msg.text, translated, nodeId: msg.nodeId, untranslated: msg.untranslated }, function (response) {
          console.log('[MT-bg] 送信後 TRANSLATED:', response);
        });
        sendResponse();
      } catch (e) {
        console.log('[MT-bg] APIエラー:', e);
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATED', original: msg.text, translated: '[APIエラー]', nodeId: msg.nodeId, untranslated: msg.untranslated }, function (response) {
          console.log('[MT-bg] 送信後 TRANSLATED(エラー):', response);
        });
        sendResponse();
      }
    })();
    return true;
  }
});

function observeCaptions() {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      // ノード追加時
      mutation.addedNodes.forEach(node => {
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
    characterData: true // ← これを追加
  });
} 