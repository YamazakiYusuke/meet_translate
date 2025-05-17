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
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATED', original: msg.text, translated: '[APIキー未設定]', nodeId: msg.nodeId });
        sendResponse();
        return;
      }
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
            max_tokens: 60
          })
        });
        const data = await response.json();
        const translated = data.choices?.[0]?.message?.content || '[翻訳失敗]';
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATED', original: msg.text, translated, nodeId: msg.nodeId });
        sendResponse();
      } catch (e) {
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATED', original: msg.text, translated: '[APIエラー]', nodeId: msg.nodeId });
        sendResponse();
      }
    })();
    return true;
  }
}); 