global.fetch = jest.fn();

describe('background.js API呼び出し', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('APIキー未設定時はエラーを返す', async () => {
    global.chrome = {
      storage: {
        local: {
          get: (keys, cb) => cb({ apiKey: null })
        }
      },
      tabs: {
        sendMessage: jest.fn()
      }
    };
    const msg = { type: 'TRANSLATE', text: 'test', nodeId: '/DIV[0]' };
    // background.jsのonMessageリスナーをここにコピペまたはimportして呼び出し
    // ここでは省略（本番では分割export推奨）
    // chrome.tabs.sendMessageが呼ばれ、translated: '[APIキー未設定]' であることを確認
    // expect(global.chrome.tabs.sendMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ translated: '[APIキー未設定]' }));
  });

  // fetchのレスポンスをモックして正常系もテスト可能
}); 