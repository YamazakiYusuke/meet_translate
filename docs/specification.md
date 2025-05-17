# Google Meet キャプション翻訳 Chrome拡張 仕様書

## 1. 機能概要
- Google Meetのキャプション（字幕）を、OpenAI APIを用いて任意の言語にリアルタイム翻訳し、画面上に表示する。
- ユーザーは翻訳モデル（精度・コスト別）と翻訳先言語を選択できる。
- オリジナルのキャプションは表示せず、翻訳のみを表示する。

---

## 2. ユースケース
- 英語などの会議キャプションを日本語等に翻訳して理解を補助したい。
- コストや精度に応じて翻訳モデルを切り替えたい。

---

## 3. コンポーネント構成
- **manifest.json**  
  - permissions: `"activeTab"`, `"scripting"`, `"storage"`, `"https://api.openai.com/*"`
  - host_permissions: `"https://meet.google.com/*"`
- **Content Script**  
  - Google MeetのDOMからキャプション要素（`<div class="bh44bd VbkSUe">`）を監視し、新しい字幕を検出。
  - 検出した字幕テキストをbackground scriptへ送信。
- **Background/Service Worker**  
  - OpenAI API（選択モデル）へ字幕テキストを送信し、翻訳結果を受信。
  - レート制限・エラー処理・簡易キャッシュを実装。
- **UI Overlay**  
  - Meetのキャプションと同じデザイン（フォント・色・背景）で、翻訳字幕のみを画面上に重ねて表示。
- **Options Page / Popup**  
  - 翻訳先言語、OpenAI API Key、翻訳モデル（精度・コスト別）を選択・保存。

---

## 4. 翻訳モデル選択
- ユーザーは以下の3モデルから選択可能（UIで切替）：
  - **Low:** GPT-4.1 nano（低コスト・低精度）
  - **Middle:** GPT-4.1 mini（中コスト・中精度）
  - **High:** GPT-4.1（高コスト・高精度）
- モデルごとにAPIのmodel名・同時リクエスト数・レート制限を切替。

---

## 5. データフロー
1. Content ScriptがMutationObserverで`<div class="bh44bd VbkSUe">`のテキスト変化を検出。
2. 新しい字幕テキストをbackground scriptへ送信。
3. background scriptがOpenAI API（選択モデル）へ翻訳リクエスト。
4. 翻訳結果をcontent scriptへ返却。
5. content scriptがMeet画面上に翻訳字幕を挿入・更新。

---

## 6. デザイン・表示仕様
- Meetのキャプションと同じフォント・色・背景で翻訳字幕を表示。
- オリジナル字幕は非表示、翻訳のみ表示。
- 複数行・複数話者の場合も、翻訳字幕のみを各発話ごとに表示。

---

## 7. コスト・レート制限
- 1字幕行ごとにAPIリクエスト（バッチ化なし、コンテキスト最小）。
- モデルごとに同時リクエスト数を制御（例: nano=5, mini=3, 4.1=1）。
- レートリミット超過時はキューイングまたは「翻訳停止中」表示。
- コスト目安や注意事項をオプションページに記載。

---

## 8. 設定項目（chrome.storageに保存）
- targetLang（翻訳先言語、例: ja）
- apiKey（OpenAI API Key）
- model（翻訳モデル選択: nano/mini/4.1）

---

## 9. エラー処理・セキュリティ
- API Key未設定時は警告表示。
- レートリミット・APIエラー時はリトライ、失敗時は字幕非表示または原文表示。
- API Keyはローカル保存のみ、外部送信なし。
- キャプションテキストが外部APIに送信される旨を明記。

---

## 10. 今後の拡張案
- TTSによる翻訳音声出力
- 会議録画・議事録生成
- 話者ごとのタグ付け 