// The shelf page ("Мои доски"): boards from elsewhere ("Доски извне", src/labs).
import { expect, sleep } from '../lib.mjs';

export const checks = {
  async 'one page for all: the shelf from a board by its logo, a board from the shelf, back by the browser, never loaded again'(p) {
    await p.ev(`planx.board.add(planx.editor.newItem('sticky', 0, 0, { id: 's', text: 'Здесь' }))`);
    const first = await p.ev('planx.conn.boardId ?? new URLSearchParams(location.search).get("board")');
    await sleep(1300);
    await p.ev('window.stillHere = 1');
    await p.click(await p.at('.topbar .logo'));
    await sleep(800);
    expect([await p.ev('location.search'), !!(await p.rect('.shelf-page')), await p.ev('window.stillHere')].join(), 'the shelf, the page the same').toBe(',true,1');
    await p.click(await p.at(`.card-cover[href*="${first}"]`));
    await sleep(800);
    expect([await p.ev('location.search'), await p.ev(`!!planx.board.get('s')`), await p.ev('window.stillHere')].join(), 'the board again').toBe(`?board=${first},true,1`);
    await p.ev('history.back()');
    await sleep(800);
    expect([await p.ev('location.search'), !!(await p.rect('.shelf-page')), await p.ev('window.stillHere')].join(), 'back to the shelf').toBe(',true,1');
  },

  async 'the new board dialog opens a board by its address, and a board file dropped from the Finder opens'(p) {
    // Kept to this browser: no sync server for the boards opened here.
    await p.cdp('Page.enable');
    const { identifier } = await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} };` });
    await p.cdp('Page.navigate', { url: 'http://localhost:5199/' });
    await sleep(1200);
    await p.click(await p.at('.shelf-recent .card-new'));
    await sleep(200);
    expect(await p.ev(`[...document.querySelectorAll('.from-row .btn')].map((b) => b.textContent).join(', ')`), 'two more ways')
      .toBe('Загрузить доску из файла, Вставить адрес доски');
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.from-row .btn')][1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await p.cdp('Input.insertText', { text: 'https://planx-ten.vercel.app/?board=shared123' });
    await p.click(await p.at('.from-address .btn.primary'));
    await sleep(1200);
    expect(await p.ev('location.search'), 'the shared board opened').toBe('?board=shared123');
    // A board file brought from the Finder.
    await p.cdp('Page.navigate', { url: 'http://localhost:5199/' });
    await sleep(1200);
    await p.ev(`(async () => {
      const { encodeBoardFile } = await import('/src/collab/boardFile.ts');
      const Y = await import('/node_modules/.vite/deps/yjs.js'), { Board } = await import('/src/model/board.ts');
      const doc = new Y.Doc(), b = new Board(doc);
      b.replaceAll([{ id: 'x', type: 'sticky', x: 0, y: 0, w: 100, h: 100, z: 1, text: 'Из файла' }], [], 'Из Finder');
      const file = new File([encodeBoardFile(doc)], 'Из Finder.plnt');
      const dt = new DataTransfer(); dt.items.add(file);
      const page = document.querySelector('.shelf-page');
      page.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.overlay = !!document.querySelector('.shelf-drop');
      page.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    })()`);
    await sleep(1500);
    expect(await p.ev('location.search.startsWith("?board=")'), 'opened as a new board').toBe(true);
    await sleep(500);
    expect(await p.ev(`planx.board.list().map((i) => i.text).join()`), 'with what was in it').toBe('Из файла');
    await p.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  },

  async 'inside a folder, creation is unavailable but a board and a folder moved there are visible'(p) {
    await p.ev(`(async () => { const s = await import('/src/shelf/boards.ts');
      s.addFolder('parent-folder', { title: 'Сюда', color: '#4786D4', parent: null });
      s.addFolder('child-folder', { title: 'Перемещённая папка', color: '#FF6767', parent: 'parent-folder' });
      s.updateEntry('moved-board', { title: 'Перемещённая доска', folder: 'parent-folder' });
    })()`);
    await p.cdp('Page.navigate', { url: 'http://localhost:5199/?folder=parent-folder' });
    await sleep(1000);
    expect(!!(await p.rect('.card-cover[href*="moved-board"]')), 'the moved board is shown').toBe(true);
    expect(!!(await p.rect('.book-cover[href*="child-folder"]')), 'the moved folder is shown').toBe(true);
    expect(!!(await p.rect('.shelf-recent .card-new')), 'no board creation inside').toBe(false);
    expect(await p.ev(`!!document.querySelector('[aria-label="Новая папка"]')`), 'no folder creation inside').toBe(false);
  },
};
