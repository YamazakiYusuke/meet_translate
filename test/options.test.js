// Mock chrome API
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => callback({})),
      set: jest.fn((items, callback) => callback()),
    },
    local: { // Also mock local if it's used as a fallback or in other parts of the script
        get: jest.fn((keys, callback) => callback({})),
        set: jest.fn((items, callback) => callback()),
    }
  },
  runtime: {
    lastError: null,
    onMessage: {
      addListener: jest.fn(),
    },
  },
};

// Mock languages and models if they are used by options.js for populating dropdowns
// Adjust this if options.js expects specific structures for these
global.languages = [{ code: 'en', label: 'English' }, { code: 'ja', label: 'Japanese' }];
global.models = [{ value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }];


describe('Options Page Functionality', () => {
  let apiKeyInput;
  let targetLangSelect;
  let modelSelect;
  let captionColorSelect;
  let enableMinutesSwitch;
  let minutesEmailInput;
  let form;
  let statusDiv;

  beforeEach(() => {
    // Reset mocks
    chrome.storage.sync.get.mockReset().mockImplementation((keys, callback) => callback({}));
    chrome.storage.sync.set.mockReset().mockImplementation((items, callback) => callback());
    chrome.runtime.lastError = null;

    // Set up DOM elements
    document.body.innerHTML = `
      <form id="options-form">
        <input type="password" id="apiKey">
        <select id="targetLang"></select>
        <select id="model"></select>
        <select id="captionColor">
          <option value="black">Black</option>
          <option value="white">White</option>
        </select>
        <input type="checkbox" id="enableMinutes">
        <input type="email" id="minutesEmail">
        <button type="submit">Save</button>
      </form>
      <div id="status"></div>
    `;

    // Re-require options.js to apply it to the new DOM and with fresh mocks
    // This ensures that event listeners are attached to the new DOM elements
    // and that the script runs in a clean environment for each test.
    // Jest caching needs to be handled for this to work as expected across tests.
    jest.resetModules(); 
    require('../options.js');


    // Assign elements after options.js has potentially modified them (e.g., populated selects)
    apiKeyInput = document.getElementById('apiKey');
    targetLangSelect = document.getElementById('targetLang');
    modelSelect = document.getElementById('model');
    captionColorSelect = document.getElementById('captionColor');
    enableMinutesSwitch = document.getElementById('enableMinutes');
    minutesEmailInput = document.getElementById('minutesEmail');
    form = document.getElementById('options-form');
    statusDiv = document.getElementById('status');
    
    // Dispatch DOMContentLoaded to trigger loading options
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  describe('Meeting Minutes Settings', () => {
    test('should load default value for enableMinutes (false)', () => {
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        callback({}); // Simulate no settings saved
      });
      // Re-dispatch DOMContentLoaded or directly call the handler if it's exported
      document.dispatchEvent(new Event('DOMContentLoaded'));
      expect(enableMinutesSwitch.checked).toBe(false);
    });

    test('should load saved value for enableMinutes (true)', (done) => {
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        callback({ enableMinutes: true });
      });
      document.dispatchEvent(new Event('DOMContentLoaded'));
      // Allow async operations within DOMContentLoaded to complete
      setTimeout(() => {
        expect(enableMinutesSwitch.checked).toBe(true);
        done();
      }, 0);
    });

    test('should load saved value for enableMinutes (false)', (done) => {
        chrome.storage.sync.get.mockImplementation((keys, callback) => {
          callback({ enableMinutes: false });
        });
        document.dispatchEvent(new Event('DOMContentLoaded'));
        setTimeout(() => {
          expect(enableMinutesSwitch.checked).toBe(false);
          done();
        },0);
    });

    test('should load default value for minutesEmail (empty)', () => {
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        callback({});
      });
      document.dispatchEvent(new Event('DOMContentLoaded'));
      expect(minutesEmailInput.value).toBe('');
    });

    test('should load saved value for minutesEmail', (done) => {
      const testEmail = 'test@example.com';
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        callback({ minutesEmail: testEmail });
      });
      document.dispatchEvent(new Event('DOMContentLoaded'));
       setTimeout(() => {
        expect(minutesEmailInput.value).toBe(testEmail);
        done();
      }, 0);
    });

    test('should save enableMinutes and minutesEmail settings', (done) => {
      enableMinutesSwitch.checked = true;
      minutesEmailInput.value = 'save@example.com';
      
      form.dispatchEvent(new Event('submit'));

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({
          enableMinutes: true,
          minutesEmail: 'save@example.com',
        }),
        expect.any(Function)
      );
      
      // Check status message
      chrome.storage.sync.set.mock.calls[0][1](); // Call the callback
      expect(statusDiv.textContent).toBe('保存しました');
      done();
    });

     test('should set enableMinutes to false if undefined in storage', (done) => {
        chrome.storage.sync.get.mockImplementation((keys, callback) => {
            // Simulate enableMinutes being undefined
            callback({ apiKey: 'testKey', minutesEmail: 'test@example.com' });
        });
        document.dispatchEvent(new Event('DOMContentLoaded'));
        setTimeout(() => {
            expect(enableMinutesSwitch.checked).toBe(false);
            done();
        }, 0);
    });

    test('handles error when loading options', (done) => {
        chrome.runtime.lastError = { message: "Test load error" };
        chrome.storage.sync.get.mockImplementation((keys, callback) => {
            callback({}); // Data doesn't matter, lastError will be checked
        });
        document.dispatchEvent(new Event('DOMContentLoaded'));
        setTimeout(() => {
            expect(statusDiv.textContent).toBe('オプションの読み込みに失敗しました。');
            chrome.runtime.lastError = null; // Clean up
            done();
        },0);
    });

    test('handles error when saving options', (done) => {
        form.dispatchEvent(new Event('submit')); // Trigger save

        chrome.runtime.lastError = { message: "Test save error" };
        // Manually call the callback passed to chrome.storage.sync.set
        // This simulates chrome.storage.sync.set completing its operation and then invoking our callback
        const setCallback = chrome.storage.sync.set.mock.calls[0][1];
        setCallback(); // This callback is where lastError is checked in options.js

        expect(statusDiv.textContent).toBe('保存に失敗しました。');
        chrome.runtime.lastError = null; // Clean up
        done();
    });


    test('should correctly populate language and model dropdowns', () => {
        // options.js populates these on script load, which is handled by beforeEach's require
        expect(targetLangSelect.options.length).toBe(languages.length);
        expect(targetLangSelect.options[0].value).toBe(languages[0].code);
        expect(targetLangSelect.options[0].textContent).toBe(languages[0].label);

        expect(modelSelect.options.length).toBe(models.length);
        expect(modelSelect.options[0].value).toBe(models[0].value);
        expect(modelSelect.options[0].textContent).toBe(models[0].label);
    });
  });
});
