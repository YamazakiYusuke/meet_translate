require('dotenv').config();
const fetch = require('node-fetch');

const API_KEY = process.env.OPENAI_API_KEY;

describe('OpenAI API integration', () => {
  test('英語→日本語の翻訳が返る', async () => {
    if (!API_KEY) throw new Error('APIキーが設定されていません');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        messages: [
          { role: 'system', content: 'You are a translation engine. Translate the following text to Japanese. Output ONLY the translated sentence.' },
          { role: 'user', content: 'Hello, how are you?' }
        ],
        max_tokens: 60
      })
    });
    const data = await response.json();
    expect(data.choices).toBeDefined();
    const translated = data.choices[0].message.content;
    expect(translated).toMatch(/こんにちは|元気/); // 日本語の一部が含まれること
  });
}); 