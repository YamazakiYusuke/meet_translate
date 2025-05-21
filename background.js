// Global variables for meeting minutes
let accumulatedCaptions = "";
let isMinutesEnabled = false;
let currentMinutesEmail = "";
let currentApiKey = "";
let currentModel = "";

// Function to update settings from storage
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['apiKey', 'targetLang', 'model', 'enableMinutes', 'minutesEmail'], (items) => {
      if (chrome.runtime.lastError) {
        console.error("Error loading settings:", chrome.runtime.lastError);
        resolve({}); // Resolve with empty object on error
        return;
      }
      isMinutesEnabled = items.enableMinutes || false;
      currentMinutesEmail = items.minutesEmail || "";
      currentApiKey = items.apiKey || "";
      currentModel = items.model || 'gpt-4.1-nano'; // Default model if not set

      if (!isMinutesEnabled) {
        accumulatedCaptions = ""; // Clear captions if minutes are disabled
      }
      resolve(items);
    });
  });
}

// Load settings when the background script starts
loadSettings();

// Listen for changes in storage to update settings dynamically
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    console.log("Settings changed, reloading...");
    loadSettings().then(settings => {
        console.log("Settings reloaded:", settings);
        // If enableMinutes was turned off, clear captions
        if (changes.enableMinutes && changes.enableMinutes.newValue === false) {
            accumulatedCaptions = "";
            console.log("Meeting minutes disabled, captions cleared.");
        }
    });
  }
});

// content scriptからの翻訳リクエストを受け、OpenAI APIにリクエストする本実装
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TRANSLATE') {
    (async () => {
      // Settings are now loaded and updated by loadSettings() and chrome.storage.onChanged
      const { targetLang } = await loadSettings(); // Ensure settings are fresh, especially targetLang

      if (!currentApiKey) {
        // APIキー未設定
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATED', original: msg.text, translated: '[APIキー未設定]', nodeId: msg.nodeId, untranslated: msg.untranslated });
        sendResponse();
        return;
      }
      // 入力長に応じてmax_tokensを調整
      const inputLength = msg.text.length;
      // For translation, keep maxTokens relatively small.
      // For summaries, it might need to be larger, but that's handled in generateMinutes.
      const maxTokens = Math.max(60, Math.ceil(inputLength * 2.0), 400); // Increased multiplier slightly for safety

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: currentModel, // Use the globally loaded model
            messages: [
              { role: 'system', content: `You are a translation engine. Translate the following text to ${targetLang || 'ja'}. Output ONLY the translated sentence.` },
              { role: 'user', content: msg.text }
            ],
            max_tokens: maxTokens
          })
        });
        const data = await response.json();
        const translated = data.choices?.[0]?.message?.content || '[翻訳失敗]';

        if (isMinutesEnabled && translated && !translated.startsWith('[')) { // Don't accumulate errors
          accumulatedCaptions += translated + "\n";
          console.log("Caption accumulated. Total length:", accumulatedCaptions.length);
        }

        // console.log('[MT-bg] 送信前 TRANSLATED:', { original: msg.text, translated, nodeId: msg.nodeId, untranslated: msg.untranslated });
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATED', original: msg.text, translated, nodeId: msg.nodeId, untranslated: msg.untranslated }, function (response) {
          if (chrome.runtime.lastError) {
            // console.log('[MT-bg] Error sending TRANSLATED message:', chrome.runtime.lastError.message);
          } else {
            // console.log('[MT-bg] 送信後 TRANSLATED:', response);
          }
        });
        sendResponse({status: "Translation processed"});
      } catch (e) {
        console.error('[MT-bg] APIエラー:', e);
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATED', original: msg.text, translated: '[APIエラー]', nodeId: msg.nodeId, untranslated: msg.untranslated }, function (response) {
           if (chrome.runtime.lastError) {
            // console.log('[MT-bg] Error sending TRANSLATED message (error case):', chrome.runtime.lastError.message);
          } else {
            // console.log('[MT-bg] 送信後 TRANSLATED(エラー):', response);
          }
        });
        sendResponse({status: "API error", error: e.message});
      }
    })();
    return true; // Indicates async response
  } else if (msg.type === 'GENERATE_MINUTES') {
    (async () => {
      await loadSettings(); // Ensure settings are current

      if (!isMinutesEnabled) {
        console.log("GENERATE_MINUTES: Minutes feature is disabled.");
        sendResponse({ success: false, message: "Meeting minutes feature is not enabled." });
        return;
      }
      if (!currentApiKey) {
        console.log("GENERATE_MINUTES: API key is not set.");
        sendResponse({ success: false, message: "API key is not set." });
        return;
      }
      if (accumulatedCaptions.trim() === "") {
        console.log("GENERATE_MINUTES: No captions accumulated.");
        sendResponse({ success: false, message: "No captions have been recorded to generate minutes." });
        return;
      }

      try {
        const minutesText = await generateMinutes(accumulatedCaptions);
        if (minutesText) {
          await sendMinutesByEmail(minutesText);
          accumulatedCaptions = ""; // Clear captions after successful generation and sending
          console.log("GENERATE_MINUTES: Minutes generated, sent (attempted), and captions cleared.");
          sendResponse({ success: true, message: "Minutes generated and email process initiated." });
        } else {
          console.log("GENERATE_MINUTES: Failed to generate minutes text.");
          sendResponse({ success: false, message: "Failed to generate minutes from the transcript." });
        }
      } catch (error) {
        console.error("GENERATE_MINUTES: Error during minutes generation/sending:", error);
        sendResponse({ success: false, message: `Error: ${error.message}` });
      }
    })();
    return true; // Indicates async response
  }
  // Default case for sendResponse if no async operation started for a message type
  // sendResponse(); // This might be needed if there are other synchronous message types
});

async function generateMinutes(text) {
  if (!currentApiKey || !currentModel) {
    console.error("Cannot generate minutes: API key or model not set.");
    return null;
  }
  // Estimate token count for the input text. OpenAI counts tokens, not characters.
  // A rough estimate: 1 token ~ 4 chars in English.
  // Max context for many models is 4096, 8192, or higher. Let's be conservative.
  // We need to leave space for the output as well.
  const inputTextTokenEstimate = Math.ceil(text.length / 3); // Generous estimate
  const maxOutputTokens = 1000; // Max tokens for the summary
  // This is a very rough calculation. A proper tokenizer would be better.
  // If model's max tokens is, say, 4096, then input + output must be less than that.
  // This simple check doesn't account for the prompt's tokens.
  // For now, we'll cap input text if it's excessively long to avoid errors.
  
  let processedText = text;
  // Example: if model is gpt-3.5-turbo (4096 tokens), and we want 1000 for output,
  // prompt is ~50 tokens, so input text should be < ~3000 tokens.
  // If text is 3 chars/token, this is ~9000 chars.
  const MAX_INPUT_CHARS_FOR_SUMMARY = 20000; // Adjust as needed
  if (processedText.length > MAX_INPUT_CHARS_FOR_SUMMARY) {
    console.warn(`Input text for summary is too long (${processedText.length} chars), truncating to ${MAX_INPUT_CHARS_FOR_SUMMARY} chars.`);
    processedText = processedText.substring(processedText.length - MAX_INPUT_CHARS_FOR_SUMMARY); // Take the most recent part
  }


  console.log(`Generating minutes with model: ${currentModel}. Input text length: ${processedText.length}`);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: currentModel,
        messages: [
          { role: 'system', content: "You are an AI assistant specializing in summarizing meeting transcripts. Your task is to generate concise and well-structured meeting minutes from the provided text.\n\nThe input text is a transcript of a meeting's translated captions.\n\nFrom this transcript, please identify and clearly present:\n1.  **Key Discussion Points:** The main topics and important subjects that were discussed.\n2.  **Decisions Made:** Any resolutions, agreements, or conclusions reached during the meeting.\n3.  **Action Items:** Specific tasks assigned to individuals or groups, including deadlines if mentioned.\n\nPlease format the minutes for clarity and readability. Using headings for each section (Discussion Points, Decisions, Action Items) and bullet points within them is recommended. The summary should be objective and focus on the informational content of the meeting." },
          { role: 'user', content: processedText }
        ],
        max_tokens: maxOutputTokens // Max tokens for the generated summary
      })
    });
    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      console.log("Minutes generated successfully.");
      return data.choices[0].message.content;
    } else {
      console.error("Failed to generate minutes: No content in API response.", data);
      return null;
    }
  } catch (e) {
    console.error('Error generating minutes via OpenAI:', e);
    return null;
  }
}

async function sendMinutesByEmail(minutesText) {
  if (!currentMinutesEmail) {
    console.warn("Cannot send minutes: Recipient email not configured.");
    // Optionally, notify the user via chrome.notifications API here
    // For now, we just log and don't throw an error to stop the flow if generation was successful.
    return; // Or throw new Error("Recipient email not configured.");
  }

  const subject = "Meeting Minutes Summary";
  const body = encodeURIComponent(minutesText);
  // Standard mailto URI encoding might have issues with very long bodies.
  // Most modern email clients handle fairly long bodies, but there are limits (e.g., ~2000 chars for URL in IE).
  // For very long minutes, a different approach (e.g., copying to clipboard, saving to a file) might be better.
  // But for typical summaries, mailto should work.
  const mailtoUrl = `mailto:${currentMinutesEmail}?subject=${encodeURIComponent(subject)}&body=${body}`;

  try {
    chrome.tabs.create({ url: mailtoUrl });
    console.log("Attempting to open email client for minutes.");
  } catch (e) {
    console.error('Error creating email tab:', e);
    // Fallback or notification could be added here
  }
}

// The observeCaptions function seems to be related to content script functionality
// for observing DOM mutations. It doesn't belong in the background script.
// It should be in content_script.js if it's for watching captions in a web page.
// Removing it from here.
/*
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
*/