// Mock chrome APIs
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => callback({})),
      set: jest.fn((items, callback) => callback()),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
  runtime: {
    lastError: null,
    onMessage: {
      addListener: jest.fn((callback) => {
        // Store the callback to simulate message events
        global.chrome.runtime.onMessage.trigger = callback;
      }),
      trigger: null, // Will be set by addListener mock
    },
    sendMessage: jest.fn(), // Mock for messages sent from background
  },
  tabs: {
    create: jest.fn(),
    sendMessage: jest.fn(),
  },
};

// Mock fetch
global.fetch = jest.fn();

// Import the functions to be tested
// Since background.js runs globally and is not a module,
// we need to load it in a way that its global variables and listeners are set up.
// We also need to be able to reset its state between tests.
let backgroundScriptModule;

// Helper function to simulate a message and get a response
async function simulateMessage(message, sender = { tab: { id: 1 } }) {
  return new Promise((resolve) => {
    if (!global.chrome.runtime.onMessage.trigger) {
      throw new Error("onMessage listener not registered by background.js");
    }
    // The actual sendResponse might be called asynchronously by background.js
    // The true here indicates that sendResponse will be called asynchronously
    const wasAsync = global.chrome.runtime.onMessage.trigger(message, sender, resolve);
    if (!wasAsync) {
        // If the listener didn't return true, it means it responded synchronously (or not at all)
        // For simplicity in this mock, we'll assume undefined means no immediate response for non-async.
        resolve(undefined); 
    }
  });
}


describe('Background Script Functionality', () => {
  beforeEach(async () => {
    // Reset all mocks and global state before each test
    jest.resetModules(); // This is crucial for resetting module-internal state

    // Re-mock chrome APIs for a clean state
    global.chrome = {
      storage: {
        sync: {
          get: jest.fn((keys, callback) => callback({})),
          set: jest.fn((items, callback) => callback()),
        },
        onChanged: {
          addListener: jest.fn(),
        },
      },
      runtime: {
        lastError: null,
        onMessage: {
          addListener: jest.fn((callback) => {
            global.chrome.runtime.onMessage.trigger = callback;
          }),
          trigger: null,
        },
        sendMessage: jest.fn(),
      },
      tabs: {
        create: jest.fn(),
        sendMessage: jest.fn(),
      },
    };
    global.fetch.mockReset();

    // Load background.js. This will execute its global scope code,
    // including calling loadSettings() and addListener for onMessage.
    // The internal state of background.js (like accumulatedCaptions) will be fresh.
    // We need to ensure that the `loadSettings` call inside background.js completes.
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ // Default settings for a clean run
        apiKey: 'test-api-key',
        targetLang: 'en',
        model: 'gpt-test-model',
        enableMinutes: false,
        minutesEmail: 'test@example.com',
      });
    });

    // Dynamically import background.js to re-run its top-level code
    // Note: For this to work, background.js should not have `export` statements if it's meant to be a simple script.
    // If it IS a module, then we'd import its functions directly.
    // Given the structure, it's a script. We need to execute it.
    const fs = require('fs');
    const path = require('path');
    const backgroundFileContent = fs.readFileSync(path.resolve(__dirname, '../background.js'), 'utf8');
    eval(backgroundFileContent); // Execute the script in the current (test's) global context.

    // Ensure initial loadSettings has been called and completed
    // The eval above will call it. We need to make sure Jest waits for any async operations within it.
    // The mock for chrome.storage.sync.get is synchronous for simplicity here.
    // If loadSettings were truly async and background.js didn't export a promise for its initialization,
    // testing its initial state can be tricky. For now, assume `eval` and sync mock handles it.
  });

  describe('Settings Management (loadSettings and onChanged)', () => {
    test('should load settings from storage and initialize global vars', async () => {
        const settings = {
            apiKey: 'key123', targetLang: 'fr', model: 'gpt-custom',
            enableMinutes: true, minutesEmail: 'custom@example.com'
        };
        chrome.storage.sync.get.mockImplementation((keys, callback) => callback(settings));
        
        // Call loadSettings directly if possible, or trigger it via an event if not.
        // Since loadSettings is global in background.js after eval:
        await global.loadSettings(); 

        // Check global variables (these are not directly exported, so this is an indirect way to test)
        // This requires background.js to set these as globals (e.g. window.isMinutesEnabled) or expose them.
        // For this test, we'll assume they are available in the global scope of the test after eval.
        expect(global.isMinutesEnabled).toBe(true);
        expect(global.currentApiKey).toBe('key123');
        expect(global.currentModel).toBe('gpt-custom');
        expect(global.currentMinutesEmail).toBe('custom@example.com');
    });

    test('should update settings when chrome.storage.onChanged is triggered', async () => {
        const newSettings = {
            enableMinutes: { newValue: true },
            minutesEmail: { newValue: 'new@example.com' },
            apiKey: {newValue: 'newKey'}
        };
        chrome.storage.sync.get.mockImplementation((keys, callback) => callback({
            enableMinutes: true, minutesEmail: 'new@example.com', apiKey: 'newKey'
        }));

        // Trigger the onChanged listener
        const onChangedCallback = global.chrome.storage.onChanged.addListener.mock.calls[0][0];
        await onChangedCallback(newSettings, 'sync');

        expect(global.isMinutesEnabled).toBe(true);
        expect(global.currentMinutesEmail).toBe('new@example.com');
        expect(global.currentApiKey).toBe('newKey');
    });

    test('should clear accumulatedCaptions if enableMinutes is changed to false', async () => {
        // First, enable minutes and add some captions
        chrome.storage.sync.get.mockImplementation((keys, callback) => callback({ enableMinutes: true, apiKey: 'key' }));
        await global.loadSettings();
        global.accumulatedCaptions = "some text";

        // Now, simulate enableMinutes being set to false via storage change
        const changes = { enableMinutes: { oldValue: true, newValue: false } };
        chrome.storage.sync.get.mockImplementation((keys, callback) => callback({ enableMinutes: false, apiKey: 'key' })); // loadSettings will be called by onChanged
        
        const onChangedCallback = global.chrome.storage.onChanged.addListener.mock.calls[0][0];
        await onChangedCallback(changes, 'sync');

        expect(global.isMinutesEnabled).toBe(false);
        expect(global.accumulatedCaptions).toBe("");
    });
  });

  describe('Caption Accumulation (via TRANSLATE message)', () => {
    const mockSender = { tab: { id: 1 } };

    test('should accumulate translated text when enableMinutes is true', async () => {
      // Setup: Enable minutes
      chrome.storage.sync.get.mockImplementation((keys, callback) => callback({ enableMinutes: true, apiKey: 'test-key', model: 'test-model', targetLang: 'en' }));
      await global.loadSettings(); // Ensure isMinutesEnabled is true

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Translated text 1' } }] }),
      });
      await simulateMessage({ type: 'TRANSLATE', text: 'Original text 1', nodeId: 'n1' }, mockSender);
      expect(global.accumulatedCaptions).toBe("Translated text 1\n");

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Translated text 2' } }] }),
      });
      await simulateMessage({ type: 'TRANSLATE', text: 'Original text 2', nodeId: 'n2' }, mockSender);
      expect(global.accumulatedCaptions).toBe("Translated text 1\nTranslated text 2\n");
    });

    test('should NOT accumulate translated text when enableMinutes is false', async () => {
      chrome.storage.sync.get.mockImplementation((keys, callback) => callback({ enableMinutes: false, apiKey: 'test-key' }));
      await global.loadSettings(); // isMinutesEnabled is false

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Translated text 3' } }] }),
      });
      await simulateMessage({ type: 'TRANSLATE', text: 'Original text 3', nodeId: 'n3' }, mockSender);
      expect(global.accumulatedCaptions).toBe("");
    });

    test('should NOT accumulate text if translation fails or returns error format', async () => {
        chrome.storage.sync.get.mockImplementation((keys, callback) => callback({ enableMinutes: true, apiKey: 'test-key' }));
        await global.loadSettings(); // isMinutesEnabled is true

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ choices: [{ message: { content: '[翻訳失敗]' } }] }),
        });
        await simulateMessage({ type: 'TRANSLATE', text: 'Original text 4', nodeId: 'n4' }, mockSender);
        expect(global.accumulatedCaptions).toBe(""); // Should not accumulate error messages
    });
  });

  describe('generateMinutes Function', () => {
    beforeEach(async () => {
      // Set default settings for generateMinutes tests
      chrome.storage.sync.get.mockImplementation((keys, callback) => callback({
        apiKey: 'test-api-key-for-minutes',
        model: 'gpt-model-for-minutes',
        enableMinutes: true, // Assuming it's enabled for these tests
        minutesEmail: 'default@example.com'
      }));
      await global.loadSettings(); // Loads apiKey and model into global vars
    });

    test('should call OpenAI API with correct parameters and return summary', async () => {
      const inputText = "This is a test transcript.";
      const expectedSummary = "Test summary.";
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: expectedSummary } }] }),
      });

      const summary = await global.generateMinutes(inputText);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${global.currentApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: global.currentModel,
            messages: [
              { role: 'system', content: expect.stringContaining("generate concise meeting minutes") },
              { role: 'user', content: inputText },
            ],
            max_tokens: 1000,
          }),
        })
      );
      expect(summary).toBe(expectedSummary);
    });
    
    test('should truncate very long input text before sending to API', async () => {
        const veryLongText = "a".repeat(25000); // MAX_INPUT_CHARS_FOR_SUMMARY is 20000
        const truncatedText = veryLongText.substring(veryLongText.length - 20000);
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ choices: [{ message: { content: "Summary of truncated text." } }] }),
        });

        await global.generateMinutes(veryLongText);

        const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(requestBody.messages[1].content.length).toBe(20000);
        expect(requestBody.messages[1].content).toBe(truncatedText);
    });

    test('should return null if API key or model is missing', async () => {
      global.currentApiKey = ""; // Simulate missing API key
      let summary = await global.generateMinutes("test");
      expect(summary).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();

      await global.loadSettings(); // Restore API key
      global.currentModel = ""; // Simulate missing model
      summary = await global.generateMinutes("test");
      expect(summary).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should return null if API call fails', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      const summary = await global.generateMinutes("Test transcript");
      expect(summary).toBeNull();
    });

    test('should return null if API response is not as expected', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ error: "API error" }), // Malformed/error response
        });
        const summary = await global.generateMinutes("Test transcript");
        expect(summary).toBeNull();
    });
  });

  describe('sendMinutesByEmail Function', () => {
     beforeEach(async () => {
      chrome.storage.sync.get.mockImplementation((keys, callback) => callback({
        minutesEmail: 'user@example.com'
      }));
      await global.loadSettings(); // loads minutesEmail into currentMinutesEmail
    });

    test('should open mailto link with correct parameters', async () => {
      const minutesText = "These are the minutes.";
      await global.sendMinutesByEmail(minutesText);

      const expectedSubject = "Meeting Minutes Summary";
      const expectedBody = encodeURIComponent(minutesText);
      const expectedMailtoUrl = `mailto:${global.currentMinutesEmail}?subject=${encodeURIComponent(expectedSubject)}&body=${expectedBody}`;
      
      expect(global.chrome.tabs.create).toHaveBeenCalledWith({ url: expectedMailtoUrl });
    });

    test('should not attempt to open mailto link if email is not configured', async () => {
      global.currentMinutesEmail = ""; // Simulate not configured
      await global.sendMinutesByEmail("Some minutes");
      expect(global.chrome.tabs.create).not.toHaveBeenCalled();
    });
  });

  describe('GENERATE_MINUTES Message Listener', () => {
    const mockSender = { tab: { id: 1 } }; // Define mockSender if not already in scope

    beforeEach(async () => {
        // Ensure fresh settings for each GENERATE_MINUTES test
        chrome.storage.sync.get.mockImplementation((keys, callback) => callback({
            apiKey: 'api-key-for-gen',
            model: 'gpt-model-for-gen',
            enableMinutes: true,
            minutesEmail: 'email-for-gen@example.com'
        }));
        await global.loadSettings();
        global.accumulatedCaptions = "Previous meeting notes.\nMore notes."; // Set some initial captions
    });
    
    test('should successfully generate and attempt to send minutes', async () => {
        const mockGeneratedMinutes = "Generated summary of the meeting.";
        global.fetch.mockResolvedValueOnce({ // For generateMinutes call
            ok: true,
            json: async () => ({ choices: [{ message: { content: mockGeneratedMinutes } }] }),
        });

        const response = await simulateMessage({ type: 'GENERATE_MINUTES' }, mockSender);

        expect(global.fetch).toHaveBeenCalledTimes(1); // generateMinutes
        expect(global.chrome.tabs.create).toHaveBeenCalledTimes(1); // sendMinutesByEmail
        expect(global.accumulatedCaptions).toBe(""); // Captions should be cleared
        expect(response).toEqual({ success: true, message: "Minutes generated and email process initiated." });
    });

    test('should fail if minutes feature is disabled', async () => {
        chrome.storage.sync.get.mockImplementation((keys, callback) => callback({ enableMinutes: false }));
        await global.loadSettings(); // Disable minutes

        const response = await simulateMessage({ type: 'GENERATE_MINUTES' }, mockSender);
        expect(response).toEqual({ success: false, message: "Meeting minutes feature is not enabled." });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should fail if API key is not set', async () => {
        chrome.storage.sync.get.mockImplementation((keys, callback) => callback({ apiKey: null, enableMinutes: true }));
        await global.loadSettings(); // Remove API key

        const response = await simulateMessage({ type: 'GENERATE_MINUTES' }, mockSender);
        expect(response).toEqual({ success: false, message: "API key is not set." });
         expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should fail if no captions are accumulated', async () => {
        global.accumulatedCaptions = ""; // Clear captions

        const response = await simulateMessage({ type: 'GENERATE_MINUTES' }, mockSender);
        expect(response).toEqual({ success: false, message: "No captions have been recorded to generate minutes." });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should fail if minutes generation returns null (e.g., API error)', async () => {
        global.fetch.mockResolvedValueOnce({ // For generateMinutes call
            ok: false, // Simulate API error
            json: async () => ({ error: "Failed" })
        });
        // Or mock generateMinutes to return null directly if it's easier
        // jest.spyOn(global, 'generateMinutes').mockResolvedValueOnce(null);


        const response = await simulateMessage({ type: 'GENERATE_MINUTES' }, mockSender);
        
        expect(global.fetch).toHaveBeenCalledTimes(1); // generateMinutes was called
        expect(response).toEqual({ success: false, message: "Failed to generate minutes from the transcript." });
        expect(global.accumulatedCaptions).not.toBe(""); // Captions should NOT be cleared if generation fails
    });
  });
});
