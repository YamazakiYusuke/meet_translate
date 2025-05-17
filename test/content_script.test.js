/**
 * @jest-environment jsdom
 */

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
  });

  afterEach(() => {
    document.body.innerHTML = '';
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
}); 