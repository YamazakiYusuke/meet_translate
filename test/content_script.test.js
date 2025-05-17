/**
 * @jest-environment jsdom
 */

const { handleCaptionNode, _resetLastCaptionTextMap } = require('../content_script.js');

describe('content_script DOM操作', () => {
  let document, captionNode, overlayClass;

  beforeEach(() => {
    document = window.document;
    overlayClass = 'mt-translation';
    // 字幕ノードを作成
    captionNode = document.createElement('div');
    captionNode.className = 'bh44bd';
    captionNode.textContent = 'Hello world';
    document.body.appendChild(captionNode);
    global.chrome = { runtime: { sendMessage: jest.fn() } };
    _resetLastCaptionTextMap();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete global.chrome;
  });

  test('字幕ノードに翻訳オーバーレイを挿入できる', () => {
    function insertTranslation(node, translated) {
      const overlay = document.createElement('div');
      overlay.className = overlayClass;
      overlay.textContent = translated;
      node.appendChild(overlay);
    }
    insertTranslation(captionNode, 'こんにちは世界');
    const overlay = captionNode.querySelector('.mt-translation');
    expect(overlay).not.toBeNull();
    expect(overlay.textContent).toBe('こんにちは世界');
  });

  test('既存オーバーレイを除去できる', () => {
    function removeTranslation(node) {
      Array.from(node.getElementsByClassName(overlayClass)).forEach(e => e.remove());
    }
    // 2回挿入→1回除去
    for (let i = 0; i < 2; i++) {
      const overlay = document.createElement('div');
      overlay.className = overlayClass;
      overlay.textContent = 'dummy';
      captionNode.appendChild(overlay);
    }
    removeTranslation(captionNode);
    expect(captionNode.querySelector('.mt-translation')).toBeNull();
  });

  test('同じ字幕内容なら2回目以降はAPIリクエストしない', () => {
    // 1回目
    captionNode.removeAttribute('data-mt-translated');
    handleCaptionNode(captionNode);
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    // 2回目（同じ内容）
    captionNode.removeAttribute('data-mt-translated');
    handleCaptionNode(captionNode);
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    // 内容を変えると再度呼ばれる
    captionNode.textContent = 'Different text';
    captionNode.removeAttribute('data-mt-translated');
    handleCaptionNode(captionNode);
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });
}); 