# Google Meet キャプション翻訳 Chrome拡張 詳細設計

---

## 1. ファイル構成案

```
meet_translate/
├── manifest.json
├── content_script.js
├── background.js
├── options.html
├── options.js
├── popup.html
├── popup.js
├── style.css
├── icons/
│   └── ...（拡張用アイコン）
└── specification.md
```

---

## 2. 各ファイルの役割

- **manifest.json**  
  Chrome拡張の定義。MV3形式。必要な権限・スクリプト・オプションページ等を記述。

- **content_script.js**  
  MeetのDOMからキャプションを検出し、翻訳リクエストをbackgroundに送信。翻訳結果を受け取り、画面にオーバーレイ表示。

- **background.js**  
  content scriptからのリクエストを受け、OpenAI APIに翻訳リクエストを送信。レスポンスをcontent scriptに返却。API Keyやモデル情報の管理、レート制限・エラー処理も担当。

- **options.html / options.js**  
  拡張の設定画面。API Key、翻訳先言語、モデル選択などを保存・管理。

- **popup.html / popup.js**  
  拡張アイコンをクリックした際の簡易UI（設定画面へのリンクや状態表示）。

- **style.css**  
  オーバーレイやオプションページのスタイル。

---

## 3. 主要ロジック詳細

### 3.1 Content Script

- MeetのDOMから`<div class="bh44bd VbkSUe">`を監視（MutationObserver）。
- 新しい字幕テキストを検出したら、chrome.runtime.sendMessageでbackgroundに送信。
- backgroundから翻訳結果を受信したら、元字幕の直下に同じデザインで翻訳字幕を挿入。
- オリジナル字幕はCSSで非表示にする。

#### 例: 字幕検出・送信
```js
const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    // 新しい字幕テキストを検出
    // 既に翻訳済みかどうかも判定
    // chrome.runtime.sendMessage({ type: 'TRANSLATE', text: captionText });
  });
});
// Meetのキャプション親要素を監視
observer.observe(targetNode, { childList: true, subtree: true });
```

#### 例: 翻訳結果の挿入
```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TRANSLATED') {
    // 元字幕の下に翻訳字幕を挿入
    // オリジナル字幕は非表示
  }
});
```

---

### 3.2 Background Script

- content scriptからの翻訳リクエストを受信。
- chrome.storageからAPI Key・モデル・言語設定を取得。
- OpenAI API（選択モデル）にPOSTリクエスト。
- レート制限管理（同時リクエスト数、キューイング）。
- 結果またはエラーをcontent scriptに返却。

#### 例: メッセージ受信・API呼び出し
```js
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === 'TRANSLATE') {
    // 設定取得
    // レート制限チェック
    // fetchでOpenAI API呼び出し
    // 結果をsender.tabに送信
  }
});
```

#### 例: OpenAI APIリクエスト
```js
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: selectedModel,
    messages: [
      { role: 'system', content: `You are a translation engine. Translate the following text from ${srcLang} to ${targetLang}. Output ONLY the translated sentence.` },
      { role: 'user', content: captionText }
    ],
    max_tokens: 60
  })
});
```

---

### 3.3 Options Page

- API Key、翻訳先言語、モデル選択をフォームで入力・保存。
- chrome.storage.sync/localに保存。
- 保存時にバリデーション（API Key形式、必須項目チェック）。

---

### 3.4 UI Overlay

- Meetのキャプションと同じフォント・色・背景をCSSで再現。
- オリジナル字幕はCSSで非表示（`display: none`）。
- 複数行・複数話者にも対応（各字幕ごとに翻訳を挿入）。

---

## 4. データ構造

### 4.1 chrome.storageに保存する設定
```js
{
  apiKey: string,
  targetLang: string, // 例: 'ja'
  model: string // 'gpt-4.1-nano' | 'gpt-4.1-mini' | 'gpt-4.1'
}
```

### 4.2 メッセージ通信
- content script → background
  ```js
  { type: 'TRANSLATE', text: string }
  ```
- background → content script
  ```js
  { type: 'TRANSLATED', original: string, translated: string }
  ```

---

## 5. エラー処理フロー

- API Key未設定時：content scriptに警告表示、翻訳リクエストは送信しない。
- レートリミット超過時：キューイング、一定回数失敗で「翻訳停止中」表示。
- APIエラー時：リトライ（最大2回）、失敗時は字幕非表示または原文表示。
- 通信エラー時：オフライン案内。

---

## 6. レート制限・コスト管理

- モデルごとに同時リクエスト数を設定（nano=5, mini=3, 4.1=1）。
- キューで順次処理、超過時は警告表示。
- オプションページにコスト目安・注意事項を記載。

---

## 7. セキュリティ・プライバシー

- API Keyはローカル保存のみ、外部送信なし。
- キャプションテキストが外部APIに送信される旨を明記。
- Meet以外のドメインでは動作しないように制限。

---

## 8. UI設計（イメージ）

- **Options Page**  
  - API Key入力欄（必須）
  - 翻訳先言語選択（例: ja, en, zh など）
  - モデル選択（ラジオボタン or セレクトボックス）
  - 保存ボタン
  - コスト・注意事項の説明

- **Meet画面オーバーレイ**  
  - Meetの字幕と同じ位置・デザインで翻訳字幕のみ表示
  - オリジナル字幕は非表示

---

## 9. 今後の拡張を考慮した設計

- モデル追加やAPI切替が容易なように、モデル情報を定数管理
- 設定項目の拡張性を考慮（TTSや議事録生成など） 