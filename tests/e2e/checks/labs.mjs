// The features on trial ("Нововведения", src/labs): their switches, and each doing its job.
import { expect, openTab, sleep } from '../lib.mjs';
import { carry } from './sortable.mjs';

/** Two stickers through the app's handle; gives back their ids. */
const stickers = (p) => p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(400, 250);
  const a = e.newItem('sticky', X, Y, { text: 'Купить молоко' }), c = e.newItem('sticky', X + 260, Y, { text: 'Позвонить Ёжику' });
  b.add(a); b.add(c); return { a: a.id, c: c.id }; })()`);
const select = (p, id) => p.ev(`planx.editor.setSelection(['${id}'])`);

export const checks = {
  async '"Код": its copy button copies the code; a block too small for its code scrolls it by the wheel'(p) {
    const text = Array.from({ length: 14 }, (_, i) => `const line${i} = "очень длинная строка кода номер ${i}, чтобы не влезла";`).join('\\n');
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 200, 150, { id: 'c', code: 'js', text: '${text}', w: 420, h: 200, fs: 14, ff: 'mono', rad: 16 })); e.setSelection([]); })()`);
    await sleep(300);
    const cam = await p.ev('JSON.stringify(planx.editor.cam)');
    await p.mouse('mouseMoved', 400, 280);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 280, deltaX: 0, deltaY: 60 });
    await sleep(100);
    expect(await p.ev('JSON.stringify(planx.editor.cam)'), 'the code scrolled, not the board').toBe(cam);
    // Scrolled to its end: the board stays put still.
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 280, deltaX: 0, deltaY: 3000 });
    await sleep(100);
    expect(await p.ev('JSON.stringify(planx.editor.cam)'), 'at its end, the board not scrolled either').toBe(cam);
    // With Shift, across: as a Mac sends it, and as elsewhere.
    for (const [deltaX, deltaY] of [[40, 0], [0, 40]]) {
      const shot = () => p.ev(`document.querySelector('canvas').toDataURL()`), before = await shot();
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 280, deltaX, deltaY, modifiers: 8 });
      await sleep(100);
      expect(await shot() !== before, `Shift+wheel ${deltaX},${deltaY}: the code scrolled across`).toBe(true);
      expect(await p.ev('JSON.stringify(planx.editor.cam)'), `Shift+wheel ${deltaX},${deltaY}: the board stays`).toBe(cam);
    }
    await p.ev(`window.clip = null; navigator.clipboard.writeText = async (t) => { window.clip = t; }`);
    await p.click([200 + 420 - 26, 150 + 22]);
    await sleep(100);
    expect(await p.ev(`window.clip?.split('\\n').length`), 'all of it copied').toBe(14);
  },

  async '"Код": typed in, a press on its text goes on typing; one off it (under its lines, past a line\'s end, its band, its line numbers) picks the block'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 200, 150, { id: 'c', code: 'js', text: 'let a = 1;\\nlet b = 2;', w: 420, h: 260, fs: 14, ff: 'mono', rad: 16 })); e.setSelection(['c']); e.startEditing('c', null); })()`);
    await sleep(300);
    const box = await p.rect('.text-edit.code');
    await p.click([box.l + 20, box.t + 8]);
    expect(await p.ev('planx.editor.editingId'), 'on its text: typing').toBe('c');
    await p.click([box.l + 300, box.t + 8]);
    expect(await p.ev('[planx.editor.editingId, [...planx.editor.selection].join()].join()'), 'past the line\'s end: the block picked').toBe(',c');
    await p.ev(`planx.editor.startEditing('c', null)`);
    await sleep(200);
    await p.click([box.l + 20, box.t + 120]);
    expect(await p.ev('[planx.editor.editingId, [...planx.editor.selection].join()].join()'), 'under its lines: the block picked').toBe(',c');
    // Its band with the language, and its line numbers: the same.
    for (const [part, x, y] of [['its band', 300, 165], ['its line numbers', 215, 230]]) {
      await p.ev(`planx.editor.startEditing('c', null)`);
      await sleep(200);
      await p.click([x, y]);
      await sleep(200);
      expect(await p.ev('[planx.editor.editingId, [...planx.editor.selection].join()].join()'), `${part}: the block picked`).toBe(',c');
    }
  },

  async '"Код": an empty block clicked is typed in at once, to paste into; Backspace there takes it away'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      planx.board.add(e.newItem('rect', 300, 300, { id: 'c', code: 'js', text: '', w: 480, h: 120, fs: 14, ff: 'mono', rad: 16 })); e.setSelection([]); })()`);
    await sleep(200);
    await p.click([540, 380]);
    await sleep(200);
    expect(await p.ev('planx.editor.editingId'), 'typed in').toBe('c');
    await p.cdp('Input.insertText', { text: 'let a = 1;' });
    await p.key('Escape', 'Escape', 27);
    await sleep(200);
    expect(await p.ev(`planx.board.get('c').text`), 'pasted').toBe('let a = 1;');
    // With code in it, a click picks it, as anything else (not picked before: a second click would type in it).
    await p.ev(`planx.editor.setSelection([])`);
    await p.click([540, 380]);
    await sleep(200);
    expect(await p.ev('planx.editor.editingId'), 'not typed in').toBe(null);
    // Emptied, Backspace pressed anew takes it away (held on from erasing, not).
    await p.ev(`planx.board.update('c', { text: '' }); planx.editor.setSelection([])`);
    await sleep(200);
    await p.click([540, 380]);
    await sleep(200);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, autoRepeat: true });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    expect(await p.ev(`!!planx.board.get('c')`), 'held on: kept').toBe(true);
    await p.key('Backspace', 'Backspace', 8);
    await sleep(100);
    expect([await p.ev(`!!planx.board.get('c')`), await p.ev('planx.editor.editingId')].join(), 'pressed: gone, nothing typed in').toBe('false,');
  },

  async '"Боковая панель": the board\'s logo opens a dark side on the left with the boards beside it, kept open; its rows go to pages beside it, the help at its foot; its logo the start, its cross by the boards puts it away'(p) {
    const go = async (label) => p.click(await p.ev(`(() => { const b = [...document.querySelectorAll('.side-nav-row, .side-nav-help')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === '${label}').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`));
    await p.click(await p.at('.topbar .logo'));
    await sleep(400);
    const r = await p.rect('.side-nav');
    expect([r.l, r.t, r.w, r.h].join(), 'down the left edge').toBe('0,0,250,800');
    expect(await p.ev(`[...document.querySelectorAll('.side-nav-row span')].map((s) => s.textContent).join()`), 'what\'s in it').toBe('Работа,Доски,Профиль,Настройки');
    // The board's logo leads to the boards beside it; «Работа» back to the board.
    await sleep(400);
    expect(!!(await p.rect('.shelf-page')), 'the boards').toBe(true);
    await go('Работа');
    await sleep(800);
    expect([await p.ev('location.search').then((q) => q.startsWith('?board=')), !!(await p.rect('.side-nav'))].join(), '«Работа»: the board, the side put away').toBe('true,false');
    await p.ev(`(async () => (await import('/src/labs/SideNav.tsx')).setSideOpen(true))()`);
    await sleep(400);
    // The board pushed over by it: its area right of the side, as wide as what's left of the window.
    expect([await p.ev(`document.querySelector('.app-content').offsetLeft`), await p.ev('innerWidth'), await p.ev(`document.querySelector('.board-canvas').clientWidth`)].join(), 'the board beside it').toBe('250,950,950');
    await go('Настройки');
    await sleep(400);
    const page = await p.rect('.page-view');
    expect([await p.ev('location.search'), !!(await p.rect('.side-nav')), await p.ev(`!!document.querySelector(".modal")`), page.l >= 250].join(), 'the settings a page beside it, the side kept')
      .toBe('?page=settings,true,false,true');
    await go('Помощь');
    await sleep(300);
    expect(await p.ev(`document.querySelector('.page-view h1')?.textContent`), 'the help').toBe('Помощь');
    await go('Доски');
    await sleep(500);
    expect([await p.ev('location.search'), !!(await p.rect('.shelf-page')), !!(await p.rect('.side-nav'))].join(), 'the boards').toBe(',true,true');
    await go('Работа');
    await sleep(800);
    expect([await p.ev('location.search').then((q) => q.startsWith('?board=')), await p.ev(`!!document.querySelector('.board-canvas')`)].join(), '«Работа»: the board again').toBe('true,true');
    await p.ev(`(async () => (await import('/src/labs/SideNav.tsx')).setSideOpen(true))()`);
    await sleep(300);
    // Its logo: the start, a hero; no cross there, by the boards one.
    await p.click(await p.at('.side-nav .side-nav-logo'));
    await sleep(300);
    expect([await p.ev('location.search'), await p.ev(`!!document.querySelector('.hero h1')`), !!(await p.rect('.side-nav-close'))].join(), 'the start').toBe('?page=home,true,false');
    await go('Доски');
    await sleep(500);
    await p.click(await p.at('.side-nav-close'));
    await sleep(200);
    expect([!!(await p.rect('.side-nav')), (await p.rect('.shelf-page')).l].join(), 'its cross: the boards fill the window').toBe('false,0');
  },

  async '"Обсуждение": the left rail\'s chat button opens it on the right, between the others\' pictures and the zoom bar, over the right rail; the comments on the zoom bar'(p) {
    // (Tall enough for the whole left rail; kept to this browser, the wishlist in it never on the sync server.)
    await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} };` });
    await p.open(1200, 1300);
    await p.click(await p.at('.tools [data-key="comments"]'));
    await sleep(250);
    const d = await p.rect('.discussion'), zoom = await p.rect('.bar.zoom'), rail = await p.rect('.labs-rail');
    expect([d.b <= zoom.t - 12, d.t <= 60, d.l <= rail.l && d.r >= rail.r].join(), 'over the zoom bar, under the pictures, over the right rail').toBe('true,true,true');
    expect(await p.ev(`!!document.querySelector('.discussion .wish-form')`), 'the wishlist in it').toBe(true);
    await p.click(await p.at('.discussion-close'));
    await sleep(200);
    expect(!!(await p.rect('.discussion')), 'closed').toBe(false);
    await p.click(await p.at('.bar.zoom button[aria-label="Комментарий"]'));
    expect(await p.ev('planx.editor.tool'), 'the comments by the zoom bar').toBe('comment');
  },

  async '"Код": dragged off the right rail, a block put where it\'s let go'(p) {
    const at = await p.at('.labs-rail button[aria-label="Код"]');
    // (Seen as it'll be while it's dragged.)
    await p.mouse('mouseMoved', ...at); await p.mouse('mousePressed', ...at);
    for (let i = 1; i <= 8; i++) { await p.mouse('mouseMoved', at[0] + (500 - at[0]) * i / 16, at[1] + (400 - at[1]) * i / 16); await sleep(16); }
    expect(await p.ev(`!!document.querySelector('.pick-ghost .tp-code')`), 'the block under the pointer').toBe(true);
    await p.mouse('mouseReleased', ...at);
    await sleep(300);
    await p.ev(`planx.board.replaceAll([], [])`);
    await p.drag(at, [500, 400], { steps: 16 });
    await sleep(300);
    const c = await p.ev(`(() => { const it = planx.board.list().find((i) => i.code); if (!it) return null; const s = planx.editor.toScreen({ x: it.x + it.w / 2, y: it.y + it.h / 2 }); return [Math.round(s.x), Math.round(s.y)]; })()`);
    expect(c && Math.abs(c[0] - 500) <= 2 && Math.abs(c[1] - 400) <= 2, `its middle where let go (${c})`).toBe(true);
  },

  async '"Код": its button on the right rail takes its tool, a click on the board a block there, typed in at once, coloured, growing with its lines; its language picked on its panel'(p) {
    await p.click(await p.at('.labs-rail button[aria-label="Код"]'));
    await sleep(100);
    expect(await p.ev(`[planx.board.list().length, planx.editor.tool, document.querySelector('.labs-rail button[aria-label="Код"]').getAttribute('aria-pressed')].join()`), 'its tool, nothing put yet').toBe('0,code,true');
    await p.click([600, 400]);
    await sleep(200);
    const mid = await p.ev(`(() => { const it = planx.board.list().find((i) => i.code), s = planx.editor.toScreen({ x: it.x + it.w / 2, y: it.y + it.h / 2 }); return [Math.abs(s.x - 600) <= 1, Math.abs(s.y - 400) <= 1, planx.editor.tool].join(); })()`);
    expect(mid, 'put where clicked, the tool let go').toBe('true,true,select');
    expect(await p.ev(`!!document.querySelector('textarea.text-edit.code')`), 'typed in at once').toBe(true);
    await p.cdp('Input.insertText', { text: 'function hello(name) {\n  return `Привет, ${name}!`;\n}' });
    await sleep(100);
    await p.key('Escape', 'Escape', 27);
    await sleep(200);
    const it = await p.ev(`planx.board.list().find((i) => i.code)`);
    expect([it.type, it.code, it.text.split('\n').length, it.h].join(), 'kept, as tall as its lines').toBe(`rect,js,3,${Math.ceil(56 + 3 * 21 + 16)}`);
    expect(await p.ev(`!!document.querySelector('.tfmt')`), 'no text panel').toBe(false);
    await p.click(await p.at('.bar.panel .code-lang .fpick'));
    await sleep(100);
    await p.click(await p.at('.code-lang .tf-item:nth-child(3)'));
    await sleep(100);
    expect(await p.ev(`planx.board.list().find((i) => i.code).code`), 'Python').toBe('py');
    expect(await p.ev(`document.querySelector('.bar.panel .code-lang .fpick').textContent`), 'shown on the panel').toBe('Python');
  },

  async '"Код": code too long pasted in grows the block to the screen\'s bottom edge at most, the rest scrolled to'(p) {
    await p.click(await p.at('.labs-rail button[aria-label="Код"]'));
    await p.click([600, 300]);
    await sleep(200);
    await p.cdp('Input.insertText', { text: Array.from({ length: 120 }, (_, i) => `line(${i});`).join('\n') });
    await sleep(200);
    const bottom = () => p.ev(`(() => { const it = planx.board.list().find((i) => i.code); return Math.round(planx.editor.toScreen({ x: it.x, y: it.y + it.h }).y); })()`);
    expect(await bottom() <= 800, 'down to the screen\'s edge at most').toBe(true);
    expect(await p.ev(`document.querySelector('textarea.text-edit.code').scrollTop > 0`), 'scrolled to the caret, at the end').toBe(true);
    await p.key('Escape', 'Escape', 27);
    await sleep(200);
    expect(await bottom() <= 800, 'kept so').toBe(true);
  },

  async '"Настройки" (the board menu) have a switch for each feature on trial, and a switched off one goes away'(p) {
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'the timer button at first').toBeTruthy();
    const open = async (label) => {
      await p.click(await p.at('.topbar button[aria-label="Меню"]'));
      await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.board-menu .menu-row')].find((r) => r.textContent === '${label}'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
      await sleep(150);
    };
    await open('Настройки');
    expect(await p.ev(`document.querySelectorAll('.modal.settings .labs-list .settings-row .menu-switch').length`), 'switches').toBe(await p.ev(`(async () => (await import('/src/labs/labs.ts')).LABS.length)()`));
    await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.settings-row')].find((r) => r.textContent.includes('Общий таймер')); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`[...document.querySelectorAll('.labs-list .settings-row')].find((r) => r.textContent.includes('Общий таймер')).getAttribute('aria-checked')`), 'switched off').toBe('false');
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'its button gone').toBeFalsy();
    await p.escape();
    expect(await p.ev(`!!document.querySelector('.modal')`), 'Esc closes it').toBe(false);
    await p.reload();
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'and still gone after a reload').toBeFalsy();
    // "Профиль": a character, the fields, kept.
    await open('Профиль');
    expect(await p.ev(`!!document.querySelector('.modal.profile .profile-avatar') + ' ' + document.querySelectorAll('.modal.profile .form-grid label').length`), 'a character and the fields').toBe('true 7');
    await p.ev(`(() => { const i = [...document.querySelectorAll('.form-grid label')].find((l) => l.textContent.startsWith('Должность')).querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Дизайнер'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent === 'Сохранить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await open('Профиль');
    expect(await p.ev(`document.querySelector('.profile-role').textContent`), 'kept').toBe('Дизайнер');
  },

  async 'a menu level that would open past the bottom of the screen is moved up into it'(p) {
    // The screen just taller than the menu: its last row's level would open past its bottom.
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    const bottom = await p.ev(`Math.ceil(document.querySelector('.board-menu').getBoundingClientRect().bottom)`);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: bottom + 16, deviceScaleFactor: 1, mobile: false });
    await sleep(200);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    const row = await p.ev(`(() => { const e = [...document.querySelectorAll('.board-menu .menu-row')].filter((r) => r.textContent.includes('Нововведения')).pop(); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', row[0], row[1]);
    await sleep(300);
    const r = await p.ev(`(() => { const r = document.querySelector('.board-menu .board-menu.sub').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; })()`);
    await p.cdp('Emulation.clearDeviceMetricsOverride', {});
    expect(r[0] >= 8 && r[1] <= r[2] - 8, `on the screen (${r})`).toBe(true);
  },

  async '"Экспорт в PDF" saves the board as a PDF of one page'(p) {
    await stickers(p);
    // What's handed to the browser to save.
    await p.ev(`window.saved = null; URL.createObjectURL = (b) => { window.saved = b; return 'blob:x'; }`);
    await p.click(await p.at('.labs-rail button[aria-label="Экспорт в PDF"]'));
    expect(await p.ev(`document.querySelector('.export-pop h3')?.textContent`), 'its window').toBe('Экспорт в PDF');
    expect(await p.ev(`[...document.querySelectorAll('.export-pop .labs-seg button')].some((b) => b.textContent === 'Прозрачный')`), 'no see-through background').toBe(false);
    await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.export-pop button')].find((b) => b.textContent === 'Скачать PDF'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(500);
    const f = await p.ev(`(async () => { const b = window.saved; if (!b) return null; const t = new TextDecoder('latin1').decode(await b.arrayBuffer()); return { type: b.type, size: b.size, head: t.slice(0, 8), tail: t.slice(-6), jpeg: t.includes('/DCTDecode') }; })()`);
    expect(f?.type, 'a PDF').toBe('application/pdf');
    expect(f.head === '%PDF-1.4' && f.tail === '%%EOF\n' && f.jpeg, 'whole, with the picture in it').toBe(true);
  },

  async '"Выравнивание" lines the selected up by an edge or the middle, in one undo step'(p) {
    const ids = await stickers(p);
    await p.ev(`planx.board.update('${ids.c}', { y: planx.board.get('${ids.c}').y + 90 })`);
    await p.ev(`planx.editor.setSelection(['${ids.a}', '${ids.c}'])`);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label="Выравнивание"]'));
    expect(await p.ev(`document.querySelectorAll('.align-pop button:not([aria-label^="Авторасположение"])').length`), 'six ways (and the three of «Авторасположение»)').toBe(6);
    await p.ev(`document.documentElement.dataset.compact = ''; document.documentElement.dataset.size = 's'`);
    await sleep(100);
    expect(await p.ev(`[...document.querySelectorAll('.panel > * > .ib, .panel > .ib')][0].offsetWidth === document.querySelector('.align-pop .ib').offsetWidth`), 'as small as the panel').toBe(true);
    await p.ev(`delete document.documentElement.dataset.compact; delete document.documentElement.dataset.size`);
    const y = await p.ev(`planx.board.get('${ids.a}').y`);
    await p.click(await p.at('.align-pop button[aria-label="По верхнему краю"]'));
    expect(await p.ev(`planx.board.get('${ids.c}').y`), 'tops meet').toBe(y);
    await p.click(await p.at('.align-pop button[aria-label="По левому краю"]'));
    expect(await p.ev(`planx.board.get('${ids.c}').x === planx.board.get('${ids.a}').x`), 'left sides meet, the panel still open').toBe(true);
    await p.ev(`planx.editor.undo()`);
    expect(await p.ev(`planx.board.get('${ids.c}').x - planx.board.get('${ids.a}').x`), 'one undo step back').toBe(260);
  },

  async '"Перо": corners clicked make a figure when closed, a straight line on a double click; Backspace and Esc'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('nib'); })()`);
    for (const at of [[400, 300], [560, 300], [560, 420]]) { await p.click(at); await sleep(450); }
    await p.click([480, 360]); await sleep(450);
    await p.key('Backspace', 'Backspace', 8);
    await p.click([402, 302]);
    await sleep(200);
    const fig = await p.ev(`(() => { const l = planx.board.list(); return l.length === 1 ? [l[0].type, l[0].shape ?? '-', l[0].vx.length, l[0].x, l[0].y, l[0].w, l[0].h].join() : l.length; })()`);
    expect(fig, 'closed on the first corner (the fourth taken off): a figure of three').toBe('polygon,-,6,400,300,160,120');
    // A line: two corners and a double click on the last.
    await p.click([400, 500]); await sleep(450);
    await p.click([600, 560]); await p.click([600, 560]);
    await sleep(200);
    const line = await p.ev(`(() => { const i = planx.board.list().find((i) => i.type === 'ink'); return i ? [i.sharp, i.pts.length].join() : 'none'; })()`);
    expect(line, 'a straight line through two corners').toBe('true,4');
    // Esc lets one go.
    await p.click([700, 300]); await sleep(450);
    await p.click([760, 300]); await sleep(100);
    await p.key('Escape', 'Escape', 27);
    expect(await p.ev(`planx.board.list().length`), 'nothing more').toBe(2);
    expect(await p.ev(`planx.editor.tool`), 'still the pen').toBe('nib');
  },

  async 'the drawing button shows and brings back the tool used last; a highlighter line\'s opacity shown as it is'(p) {
    await p.ev(`planx.editor.setTool('marker')`);
    await p.ev(`planx.editor.setTool('select')`);
    await sleep(100);
    // (On the rail, or under its "more" button when the window is low.)
    if (!(await p.rect('.tools [data-key="draw"]'))) await p.click(await p.at('.tools:not(.labs-rail) > button[aria-label="Ещё"]'));
    expect(await p.ev(`document.querySelector('[data-key="draw"] .pi, [data-more-key="draw"] .pi').style.maskImage.includes('highlighter')`), 'the highlighter on the rail').toBe(true);
    await p.key('Escape', 'Escape', 27);
    expect(await p.ev(`localStorage.getItem('planx-last-draw')`), 'kept').toBe('marker');
    await p.ev(`planx.editor.setTool('marker')`);
    await p.drag([400, 300], [600, 380]);
    await sleep(100);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'ink')?.id`);
    await p.ev(`(() => { planx.editor.setTool('select'); planx.editor.setSelection(['${id}']); })()`);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label^="Цвет"]'));
    expect(await p.ev(`document.querySelector('.palette-pop input[type="range"]').value`), 'its real opacity').toBe('45');
    await p.ev(`localStorage.removeItem('planx-last-draw')`);
  },

  async '"Ластик кружком" takes off only what is under it, the rest left as lines'(p) {
    await p.ev(`(() => { localStorage.removeItem('planx-eraser'); const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('pen'); })()`);
    await p.drag([300, 300], [700, 300]);
    await sleep(100);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'ink').length`), 'a line').toBe(1);
    await p.ev(`planx.editor.setTool('eraser')`);
    await p.drag([500, 260], [500, 340]);
    await sleep(100);
    const left = await p.ev(`planx.board.list().filter((i) => i.type === 'ink').map((i) => i.x < 500 ? 'left' : 'right').sort().join()`);
    expect(left, 'cut in two where the eraser went').toBe('left,right');
    // Undone in one step: the line whole again.
    await p.key('z', 'KeyZ', 90, 4);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'ink').length`), 'one undo step').toBe(1);
  },

  async '"Перо": pressed and dragged, a smooth corner with handles; a double click on the figure shows its nodes, dragged to change it'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('nib'); })()`);
    await p.click([400, 300]); await sleep(450);
    // Pressed and dragged: smooth, its handles along the drag.
    await p.drag([600, 300], [600, 380]); await sleep(450);
    await p.click([500, 460]); await sleep(450);
    await p.click([401, 301]);
    await sleep(200);
    const fig = await p.ev(`(() => { const l = planx.board.list(); return l.length === 1 ? [l[0].type, l[0].vx.length, l[0].vh?.length].join() : l.length; })()`);
    expect(fig, 'a figure of three corners, with handles').toBe('polygon,6,12');
    // A double click on it: its nodes; a corner dragged changes it.
    await p.ev(`planx.editor.setTool('select')`);
    await p.click([480, 360]); await p.click([480, 360]);
    await sleep(200);
    expect(await p.ev(`(async () => (await import('/src/labs/paths.ts')).nodeEditing() === planx.board.list()[0].id)()`), 'its nodes shown').toBe(true);
    const before = await p.ev(`planx.board.list()[0].h`);
    await p.drag([500, 460], [500, 560]);
    await sleep(100);
    expect(await p.ev(`Math.round(planx.board.list()[0].h - ${before})`), 'taller by the corner dragged down').toBe(100);
    await p.key('z', 'KeyZ', 90, 4);
    expect(await p.ev(`Math.round(planx.board.list()[0].h)`), 'one undo step').toBe(Math.round(before));
    await p.key('Escape', 'Escape', 27);
    expect(await p.ev(`(async () => (await import('/src/labs/paths.ts')).nodeEditing())()`), 'done with Esc').toBe(null);
  },

  async '"Слои": a new layer, the picked items put in it, hidden by its tick (not seen, not picked); new items go in the layer picked'(p) {
    const ids = await stickers(p);
    await select(p, ids.a);
    await p.click(await p.at('.labs-rail button[aria-label="Слои"]'));
    const rows = () => p.ev(`[...document.querySelectorAll('.layers-pop .layer-row')].map((r) => r.querySelector('.layer-name').textContent + ':' + r.querySelector('i').textContent + (r.classList.contains('on') ? '*' : '')).join()`);
    expect(await rows(), 'one layer, the first').toBe('Слой 1:2*');
    await p.click(await p.at('.layers-pop .layers-add'));
    expect(await rows(), 'a new one, picked').toBe('Слой 1:2,Слой 2:0*');
    await p.click(await p.ev(`(() => { const r = document.querySelectorAll('.layers-pop .layer-here')[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await rows(), 'the sticker put in it').toBe('Слой 1:1,Слой 2:1*');
    await p.click(await p.ev(`(() => { const r = document.querySelectorAll('.layers-pop .layer-row input[type=checkbox]')[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`planx.editor.shown().map((i) => i.id).join() + ' | ' + planx.editor.selection.size`), 'hidden, and no longer picked').toBe(`${ids.c} | 0`);
    await p.ev(`planx.board.add(planx.editor.newItem('sticky', 0, 0, { id: 'n' }))`);
    expect(await p.ev(`planx.board.get('n').ly === planx.board.get('${ids.a}').ly && planx.editor.shown().length`), 'a new one in the picked layer, shown again').toBe(3);
    // Its bin: asked, then the layer gone with what it holds; one undo brings both back.
    await p.ev(`document.querySelectorAll('.layers-pop .layer-delete')[1].click()`);
    await sleep(150);
    expect(await p.ev(`document.querySelector('.confirm p')?.textContent`), 'asked first').toBe('Удалить «Слой 2» и всё, что в нём (2), у всех участников? Отменить можно через Ctrl+Z');
    await p.click(await p.at('.confirm .btn.primary'));
    expect(await p.ev(`planx.board.list().map((i) => i.id).join()`), 'it and what it held gone').toBe(ids.c);
    await p.key('z', 'KeyZ', 90, 4);
    expect(await p.ev(`(async () => planx.board.list().length + ' ' + (await import('/src/labs/layers.ts')).layersOf(planx.board).map((l) => l.name).join())()`), 'back with one undo').toBe('3 Слой 1,Слой 2');
    // The first one too; the last one gone, a new empty "Слой 1".
    const names = () => p.ev(`(async () => planx.board.list().length + ' ' + (await import('/src/labs/layers.ts')).layersOf(planx.board).map((l) => l.name).join())()`);
    await p.ev(`(async () => { const m = await import('/src/labs/layers.ts'); m.deleteLayer(planx.editor, 'base'); })()`);
    expect(await names(), 'the first gone with what it held').toBe('2 Слой 2');
    await p.ev(`(async () => { const m = await import('/src/labs/layers.ts'); m.deleteLayer(planx.editor, m.layersOf(planx.board)[0].id); })()`);
    expect(await names(), 'the last gone: an empty "Слой 1"').toBe('0 Слой 1');
    await p.ev(`planx.board.add(planx.editor.newItem('sticky', 0, 0, { id: 'm' }))`);
    expect(await p.ev(`(async () => (await import('/src/labs/layers.ts')).layerCounts(planx.board).get(planx.board.get('m').ly))()`), 'a new item in it').toBe(1);
  },

  async 'three dots at the right end of the bottom and the text panel open the right click\'s menu, the panel staying; answering up to its edge'(p) {
    const ids = await stickers(p);
    await select(p, ids.a);
    await sleep(300);
    const edge = (q) => p.ev(`(() => { const r = document.querySelector('${q}').getBoundingClientRect(); return !!document.elementFromPoint(r.right - 2, r.top + r.height / 2)?.closest('.item-menu'); })()`);
    const rows = () => p.ev(`[...document.querySelectorAll('.context-menu .menu-row')].map((b) => b.textContent).join()`);
    expect(await p.ev(`document.querySelector('.bar.panel .ib:not(.item-menu)').offsetWidth - document.querySelector('.bar.panel .item-menu').offsetWidth`), 'its highlight 6 narrower').toBe(6);
    // From the dots' middle to the panel's edge 6 less than from another button's to its right.
    expect(await p.ev(`(() => { const b = document.querySelector('.bar.panel .item-menu').getBoundingClientRect(), n = document.querySelector('.bar.panel').getBoundingClientRect(); return Math.round(n.right - (b.left + b.width / 2)); })()`), 'the panel 6 shorter past them').toBe(30);
    expect(await edge('.bar.panel'), 'answers at the panel\'s very edge').toBe(true);
    await p.click(await p.at('.bar.panel .item-menu'));
    expect((await rows()).includes('Параметры,'), 'the menu').toBe(true);
    expect((await rows()).endsWith('Удалить'), 'all of it').toBe(true);
    const menu = await p.rect('.context-menu'), bar = await p.rect('.bar.panel');
    expect(menu.b <= bar.t, 'above the panel').toBe(true);
    expect(menu.r, 'level with its right end').toBe(bar.r);
    expect(await p.ev(`document.querySelector('.bar.panel .item-menu').classList.contains('on')`), 'its button lit').toBe(true);
    await p.click(await p.at('.bar.panel .item-menu'));
    await sleep(150);
    expect(await rows(), 'pressed again: closed').toBe('');
    // Its rows do what they do from a right click.
    await p.click(await p.at('.bar.panel .item-menu'));
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Удалить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`!!planx.board.get('${ids.a}')`), 'deleted').toBe(false);
    // While typing: at the text panel's end, for what's typed in.
    await p.ev(`planx.editor.setSelection(['${ids.c}']); planx.editor.startEditing('${ids.c}')`);
    await sleep(400);
    expect(await edge('.tfmt'), 'answers at the text panel\'s very edge').toBe(true);
    await p.click(await p.at('.tfmt .item-menu'));
    await sleep(150);
    expect((await rows()).includes('Скопировать'), 'the menu').toBe(true);
    expect(await p.ev(`planx.editor.editingId`), 'still typing').toBe(ids.c);
    expect(!!(await p.rect('.tfmt:not(.leaving)')), 'the panel staying').toBe(true);
    await p.escape();
    await sleep(150);
    expect(await rows(), 'Esc: closed').toBe('');
    expect(await p.ev(`planx.editor.editingId`), 'and still typing').toBe(ids.c);
    expect(!!(await p.rect('.tfmt:not(.leaving)')), 'the panel too').toBe(true);
    // A row pressed does it, the typing over.
    await p.click(await p.at('.tfmt .item-menu'));
    await sleep(150);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Переместить вниз').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    expect(await rows(), 'done: closed').toBe('');
    expect(await p.ev(`planx.editor.editingId`), 'typing over').toBe(null);
    // A link alone: its own menu.
    await p.ev(`(() => { const e = planx.editor, b = planx.board; b.add(e.newItem('sticky', 200, 500, { id: 'z' })); b.addLink({ id: 'l', from: '${ids.c}', to: 'z' }); e.setSelection(['l']); })()`);
    await sleep(300);
    await p.click(await p.at('.bar.panel .item-menu'));
    expect(await rows(), 'a link\'s').toBe('Параметры,Удалить');
  },

  async '"Сплошная выбранная иконка": the tool that\'s on, white on blue, solid where there\'s a solid one; switched off, as it was'(p) {
    const on = () => p.ev(`(() => { const b = document.querySelector('.tools .fb.solid-on'); if (!b) return null; const i = getComputedStyle(b.querySelector('.pi')), f = getComputedStyle(b, '::before'); return [b.dataset.key, i.backgroundColor, f.backgroundColor, i.maskImage.includes('solid')].join(); })()`);
    await sleep(200);
    expect(await on(), 'the cursor: no solid one, in white').toBe('select,rgb(255, 255, 255),rgb(0, 128, 255),false');
    await p.ev(`planx.editor.setTool('sticky')`);
    await sleep(200);
    expect(await on(), 'a sticker: solid').toBe('sticky,rgb(255, 255, 255),rgb(0, 128, 255),true');
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('solidTool', false))()`);
    await sleep(200);
    expect(await on(), 'switched off').toBe(null);
    expect(await p.ev(`getComputedStyle(document.querySelector('.tools .fb.on'), '::before').backgroundColor`), 'the pale one back').toBe('rgba(75, 145, 255, 0.14)');
  },

  async '"История": a point set by hand, the board changed, gone back to it (asked, what it was kept as a point, one undo step); the switch is the board\'s'(p) {
    const ids = await stickers(p);
    await sleep(300);
    await p.click(await p.at('.labs-rail button[aria-label="История"]'));
    await sleep(300);
    expect(await p.ev(`document.querySelector('.history-list').textContent`), 'none yet').toBe('Точек пока нет.');
    expect(await p.ev(`document.querySelector('.history-pop .labs-seg .on').textContent`), 'by hand at first').toBe('Вручную');
    const kinds = () => p.ev(`[...document.querySelectorAll('.history-when i')].map((e) => e.textContent).join()`);
    await p.click(await p.at('.history-add'));
    await sleep(400);
    expect(await kinds(), 'a point').toBe('вручную');
    // Then the board's changed: something added, something gone, something moved, a new layer.
    await p.ev(`(async () => { const b = planx.board, e = planx.editor, l = await import('/src/labs/layers.ts'); b.add(e.newItem('sticky', 0, 0, { id: 'later' })); b.remove(['${ids.a}']); b.update('${ids.c}', { x: 5, text: 'Другое' }); l.addLayer(b); b.setTitle('Другая'); })()`);
    await sleep(300);
    // A press on its time: the board as it was, on the canvas, the real one left as it is.
    const real = () => p.ev(`planx.board.list().map((i) => i.text).sort().join('|')`);
    const onCanvas = () => p.ev(`planx.editor.shown().map((i) => i.text).sort().join('|')`);
    const was = await real(), cam0 = await p.ev(`planx.editor.cam`);
    await p.click(await p.at('.history-when'));
    await sleep(400);
    expect(await p.ev(`planx.editor.looking`), 'looking').toBe(true);
    expect(await onCanvas(), 'on the canvas, as it was').toBe('Купить молоко|Позвонить Ёжику');
    expect((await p.ev(`document.querySelector('.history-pill').textContent`)).startsWith('Как было: '), 'says so').toBe(true);
    expect(await p.ev(`getComputedStyle(document.querySelector('.tools')).visibility`), 'no tools').toBe('hidden');
    // Dragged, it moves; keys do nothing to it; the real board's as it is.
    const n = await p.ev(`planx.editor.cam.x`);
    await p.drag([700, 500], [760, 500]);
    expect(Math.round((await p.ev(`planx.editor.cam.x`)) - n), 'a drag moves the view').toBe(60);
    await p.key('a', 'KeyA', 65, 4);
    await p.key('Delete', 'Delete', 46);
    await p.key('z', 'KeyZ', 90, 4);
    expect(await onCanvas(), 'keys leave it').toBe('Купить молоко|Позвонить Ёжику');
    expect(await p.ev(`planx.editor.selection.size`), 'nothing picked').toBe(0);
    expect(await real(), 'the real board as it is').toBe(was);
    expect(await p.ev(`document.querySelector('.history-row').classList.contains('on')`), 'its row lit, the list still open').toBe(true);
    await p.escape();
    await sleep(200);
    expect(await p.ev(`planx.editor.looking`), 'Esc: over').toBe(false);
    expect(await onCanvas(), 'the real board back').toBe(was);
    expect((await p.ev(`planx.editor.cam.x`)), 'where it was').toBe(cam0.x);
    expect(await p.ev(`planx.editor.tool`), 'its tool').toBe('select');
    // Pressed again: off; going back from the bar, asked as ever.
    await p.click(await p.at('.history-when'));
    await sleep(300);
    await p.click(await p.at('.history-when'));
    await sleep(300);
    expect(await p.ev(`planx.editor.looking`), 'pressed again: over').toBe(false);
    await p.click(await p.at('.history-when'));
    await sleep(400);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.history-pill .btn')].find((b) => b.textContent === 'Откатиться').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    expect((await p.ev(`document.querySelector('.confirm p').textContent`)).startsWith('Вернуть доску к '), 'asked first').toBe(true);
    await p.click(await p.at('.confirm .btn.primary'));
    await sleep(700);
    const state = () => p.ev(`(async () => { const b = planx.board, l = await import('/src/labs/layers.ts'); return [b.list().map((i) => i.text).sort().join('|'), l.layersOf(b).length, b.meta.get('title') ?? ''].join(' ; '); })()`);
    expect(await state(), 'as it was').toBe('Купить молоко|Позвонить Ёжику ; 1 ; ');
    expect(await p.ev(`document.querySelector('.labs-toast')?.textContent?.startsWith('Доска возвращена')`), 'said so').toBe(true);
    expect(await p.ev(`(async () => (await (await fetch('/history/' + new URLSearchParams(location.search).get('board'))).json()).map((p) => p.kind).join())()`), 'what it was, kept').toBe('before,manual');
    await p.ev(`planx.editor.undo()`);
    await sleep(200);
    expect(await state(), 'one undo: back again').toBe('|Другое ; 2 ; Другая');
    // The switch, for the whole board; a point's bin.
    await p.click(await p.at('.labs-rail button[aria-label="История"]'));
    await sleep(100);
    if (!(await p.rect('.history-pop'))) { await p.click(await p.at('.labs-rail button[aria-label="История"]')); await sleep(300); }
    await p.click(await p.ev(`(() => { const r = document.querySelector('.history-pop .labs-seg button').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    expect(await p.ev(`planx.board.doc.getMap('labs').get('historyAuto')`), 'set on the board').toBe(true);
    expect(!!(await p.rect('.history-add')), 'no button then').toBe(false);
    await p.ev(`document.querySelector('.history-delete').click()`);
    await sleep(400);
    expect(await kinds(), 'taken off').toBe('вручную');
    await p.ev(`document.querySelector('.history-delete').click()`);
    await sleep(300);
  },

  async '"Связи инструментом": no dots on what\'s picked; «Связи» on the zoom bar (or C): the picked one\'s dots as ever, the pointer on a line or on something with lines lights them and frames what they join'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('linkTool', true))()`);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('sideTabs', false))()`);
    await sleep(100);
    const { a, c } = await stickers(p);
    const b = await p.ev(`(() => { const e = planx.editor, it = e.newItem('sticky', ...Object.values(e.toWorld(900, 250)), { text: 'Без линий' }); planx.board.add(it); return it.id; })()`);
    await p.ev(`(() => { const e = planx.editor; planx.board.add(e.newItem('mind', ...Object.values(e.toWorld(500, 600)), { id: 'm', text: 'Тема', w: 120, h: 50 })); })()`);
    const dot = (id) => p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), r = await import('/src/canvas/renderer.ts'), e = planx.editor, it = planx.board.get('${id}');
      const s = e.toScreen(g.sidePoint(it, 'right', r.dotGap(it, 'right') / e.cam.z)), b = e.canvas.getBoundingClientRect(); return [s.x + b.left, s.y + b.top]; })()`);
    const mid = (id) => p.ev(`(() => { const e = planx.editor, i = planx.board.get('${id}'), s = e.toScreen({ x: i.x + i.w / 2, y: i.y + i.h / 2 }), b = e.canvas.getBoundingClientRect(); return [s.x + b.left, s.y + b.top]; })()`);
    const links = () => p.ev(`planx.board.linkList().length`);
    // Off: picked, pulled from where its dot was, it's moved, not linked.
    await p.ev(`planx.editor.setSelection(['${a}'])`);
    await sleep(100);
    const d = await dot(a);
    await p.drag(d, [d[0] + 40, d[1]]);
    expect(await links(), 'no link from a picked one').toBe(0);
    await p.ev(`planx.board.update('${a}', { x: planx.board.get('${a}').x - 40 })`);
    // C: on, the cursor still the tool; the button lit.
    await p.key('c', 'KeyC', 67);
    await sleep(100);
    expect(await p.ev(`(() => { const b = document.querySelector('button[aria-label="Связи"]'); return [planx.editor.tool, !b || b.classList.contains('solid-on')].join(); })()`), 'on, the cursor kept, the switch on blue').toBe('select,true');
    // The picked one's dots as ever: a link from its right dot.
    await p.ev(`planx.editor.setSelection(['${a}'])`);
    await sleep(100);
    const from = await dot(a);
    await p.mouse('mouseMoved', from[0], from[1]);
    await sleep(100);
    await p.drag(from, await mid(c));
    expect(await links(), 'linked from the picked one').toBe(1);
    await p.ev(`planx.editor.setSelection([])`);
    // The pointer on the second: its line lit, what it joins framed; on the third (no lines), nothing.
    await p.mouse('mouseMoved', ...(await mid(c)));
    await sleep(100);
    expect(await p.ev(`(() => { const r = planx.editor.related; return r ? [r.links.size, [...r.items].sort().join()].join(' ') : 'none'; })()`), 'its line and what it joins').toBe(`1 ${[a, c].sort().join()}`);
    await p.mouse('mouseMoved', ...(await mid(b)));
    await sleep(100);
    expect(await p.ev(`planx.editor.related ? 'lit' : 'none'`), 'nothing lit off its lines').toBe('none');
    // The line clicked: picked, it and what it joins stay lit with the pointer elsewhere, till something else is.
    const line = await p.ev(`planx.board.linkList()[0].id`);
    await p.ev(`planx.editor.setSelection(['${line}'])`);
    await p.mouse('mouseMoved', 1000, 700);
    await sleep(100);
    const lit = () => p.ev(`(async () => { const m = await import('/src/labs/linkTool.ts'), e = planx.editor; const r = e.related ?? m.pickedRelated(e.shownLinks().filter((l) => e.selection.has(l.id))); return r ? [...r.items].sort().join() : 'none'; })()`);
    expect(await lit(), 'picked: kept lit').toBe([a, c].sort().join());
    await p.ev(`planx.editor.setSelection([])`);
    expect(await lit(), 'picked no more: away').toBe('none');
    // A mind map node keeps its buttons with it on.
    await p.mouse('mouseMoved', 560, 625);
    await sleep(100);
    expect(await p.ev(`planx.editor.plusNode()?.id ?? 'no buttons'`), 'the node\'s buttons').toBe('m');
    await p.key('c', 'KeyC', 67);
    await sleep(50);
    await p.ev(`(async () => { const l = await import('/src/labs/labs.ts'); l.setLab('linkTool', false); l.setLab('sideTabs', true); })()`);
  },

  async 'the dark theme in "Настройки", not on the zoom bar; the link dots\' switch there instead'(p) {
    expect(await p.ev(`!!document.querySelector('.bar.zoom [aria-label="Тёмная тема"], .bar.zoom [aria-label="Светлая тема"]')`), 'none on the bar').toBe(false);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('linkTool', true))()`);
    await sleep(100);
    expect(!!(await p.rect('.bar.zoom button[aria-label="Связи"]')), 'the dots\' switch on it').toBe(true);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('linkTool', false))()`);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    await p.ev(`[...document.querySelectorAll('.board-menu .menu-row')].find((r) => r.textContent.includes('Настройки')).click()`);
    await sleep(300);
    const flip = () => p.ev(`[...document.querySelectorAll('.settings-row')].find((r) => r.textContent.includes('Тёмная тема')).click()`);
    const was = await p.ev(`document.documentElement.dataset.theme`);
    await flip();
    await sleep(100);
    expect(await p.ev(`document.documentElement.dataset.theme`), 'the other theme').toBe(was === 'dark' ? 'light' : 'dark');
    await flip();
    await sleep(100);
    expect(await p.ev(`document.documentElement.dataset.theme`), 'back').toBe(was);
    await p.escape();
  },

  async '"Фон доски": dots in the board menu pick a double grid, a plain grid, ruled lines, dots or nothing on the background'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 100, y: 100, z: 1 }; e.camChanged(); })()`);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    const pixel = async (x, y) => { await sleep(150); return p.ev(`[...planx.editor.canvas.getContext('2d').getImageData(${x}, ${y}, 1, 1).data].slice(0, 3).join()`); };
    const pick = async (name) => p.ev(`document.querySelector('.size-dot[aria-label="${name}"]').click()`);
    const BG = '242,243,246';
    // By default the lines: one through the corner of the board's point (0, 0).
    expect(await p.ev(`document.querySelector('.size-dot[aria-label="Двойная клетка"]').getAttribute('aria-checked')`), 'lines first').toBe('true');
    expect(await pixel(100, 150) !== BG, 'a line').toBe(true);
    // A plain grid: lines down and across; ruled: across only.
    await pick('Клетка');
    expect(await pixel(100, 150) !== BG, 'a plain grid: a line down').toBe(true);
    await pick('Линейка');
    expect(await pixel(150, 100) !== BG, 'ruled: a line across').toBe(true);
    expect(await pixel(100, 150), 'ruled: none down').toBe(BG);
    await pick('Точки');
    expect(await pixel(100, 100) !== BG, 'a dot').toBe(true);
    expect(await pixel(100, 110), 'nothing between them').toBe(BG);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 100, y: 100, z: 0.02 }; e.camChanged(); })()`);
    expect(await pixel(100, 100) !== BG, 'zoomed far out, a dot').toBe(true);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 100, y: 100, z: 40 }; e.camChanged(); })()`);
    expect(await pixel(100, 100) !== BG, 'zoomed far in, a dot').toBe(true);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 100, y: 100, z: 1 }; e.camChanged(); })()`);
    await pick('Пусто');
    expect(await pixel(100, 100), 'no dot').toBe(BG);
    expect(await pixel(100, 150), 'no line').toBe(BG);
    await pick('Двойная клетка');
    await p.escape();
  },

  async '"Кроп картинки": edges cut it for good, the ball rounds it, Esc drops it all, a press off it finishes'(p) {
    await p.ev(`(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 400, 200);
      const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('image', 400, 200, { id: 'pic', w: 400, h: 200, src: c.toDataURL('image/png') })); e.setSelection(['pic']); })()`);
    await sleep(300);
    const scissors = async () => p.click(await p.at('button[aria-label="Кроп"]'));
    const pic = () => p.ev(`(() => { const i = planx.board.get('pic'); return [i.x, i.y, i.w, i.h, i.rad ?? 0].join(); })()`);
    const pixels = () => p.ev(`new Promise((ok) => { const m = new Image(); m.onload = () => ok(m.naturalWidth + 'x' + m.naturalHeight); m.src = planx.board.get('pic').src; })`);
    await scissors();
    expect(await p.ev(`document.querySelector('button[aria-label="Кроп"]').classList.contains('on')`), 'lit').toBe(true);
    // Left edge in by 100; nothing on the board yet; Esc: as it was.
    await p.drag([400, 300], [500, 300]);
    expect(await pic(), 'nothing changed yet').toBe('400,200,400,200,0');
    await p.escape();
    await sleep(100);
    expect(await pic(), 'dropped').toBe('400,200,400,200,0');
    expect(await p.ev(`[...planx.editor.selection].join()`), 'still picked').toBe('pic');
    // In again: the left edge and the bottom one, the press inside not moving it; Enter.
    await scissors();
    await p.drag([600, 300], [650, 330]);
    expect(await pic(), 'stays put').toBe('400,200,400,200,0');
    await p.drag([400, 300], [500, 300]);
    await p.drag([600, 400], [600, 350]);
    await p.key('Enter', 'Enter', 13);
    await sleep(150);
    expect(await pic(), 'cut').toBe('500,200,300,150,0');
    expect(await pixels(), 'its pixels too').toBe('300x150');
    expect(await p.ev(`[...planx.editor.selection].join()`), 'still picked').toBe('pic');
    // Not undone: a step after adding it undone, it's cut still.
    await p.ev(`(() => { const u = planx.board.undoManager; u.stopCapturing(); planx.board.update('pic', { fo: 0.9 }); u.undo(); })()`);
    expect(await pixels(), 'gone for good').toBe('300x150');
    // The ball, at the lower left corner: rounds it; can be set anew; a press off it finishes.
    await p.ev(`planx.editor.setSelection(['pic'])`);
    await sleep(100);
    await scissors();
    await p.drag([500, 350], [530, 320]);
    await p.mouse('mouseMoved', 1000, 650);
    await p.click([1000, 650]);
    expect((await pic()).split(',')[4], 'rounded').toBe('30');
    expect(await pixels(), 'its pixels as they were').toBe('300x150');
    await p.ev(`planx.editor.setSelection(['pic'])`);
    await sleep(100);
    await scissors();
    await p.drag([530, 320], [500, 350]);
    await scissors();
    expect((await pic()).split(',')[4], 'square again').toBe('0');
    // A game sticker has no crop button.
    await p.ev(`(() => { const e = planx.editor, d = e.newItem('image', 100, 100, { id: 'dood', w: 80, h: 80, doodle: 'x' }); planx.board.add(d); e.setSelection(['dood']); })()`);
    await sleep(150);
    expect(!!(await p.rect('button[aria-label="Кроп"]')), 'none on a game sticker').toBeFalsy();
  },

  async 'the selection panel comes only on letting go: of something pressed, moved or not, and of a box drawn'(p) {
    const { a } = await stickers(p);
    const bars = () => p.ev(`document.querySelectorAll('.bar.panel:not(.gone)').length`);
    const at = await p.ev(`(() => { const e = planx.editor, i = planx.board.get('${a}'), s = e.toScreen({ x: i.x + i.w / 2, y: i.y + i.h / 2 }); return [s.x, s.y]; })()`);
    for (const lab of [false, true]) {
      await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', ${lab}))()`);
      // Pressed, not moved.
      await p.ev(`planx.editor.setSelection([])`);
      await sleep(250);
      await p.mouse('mouseMoved', at[0], at[1]);
      await p.mouse('mousePressed', at[0], at[1]);
      await sleep(200);
      expect(await p.ev(`planx.editor.selection.size`), 'picked as it\'s pressed').toBe(1);
      expect(await bars(), 'no panel yet').toBe(0);
      await p.mouse('mouseReleased', at[0], at[1]);
      await sleep(250);
      expect(await bars(), 'one on letting go').toBe(1);
      // A box, over the two.
      await p.ev(`planx.editor.setSelection([])`);
      await sleep(250);
      await p.mouse('mouseMoved', 300, 150);
      await p.mouse('mousePressed', 300, 150);
      for (const [x, y] of [[500, 400], [700, 450], [900, 500]]) {
        await p.mouse('mouseMoved', x, y);
        await sleep(120);
        expect(await bars(), 'none while it\'s drawn').toBe(0);
      }
      expect(await p.ev(`planx.editor.selection.size`), 'what it takes in picked meanwhile').toBe(2);
      await p.mouse('mouseReleased', 900, 500);
      await sleep(250);
      expect(await bars(), 'one on letting go').toBe(1);
    }
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '"Форма в объектах": its two fields over it while picked, what\'s typed on the board at once; «Заполнить» keeps it without the fields, «Редактировать» brings them back'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.addForm({ x: 600, y: 400 }); })()`);
    await sleep(300);
    const form = () => p.ev(`(() => { const f = planx.board.list().find((i) => i.form); return { fv: f.fv, fd: !!f.fd, x: f.x, y: f.y, w: f.w, h: f.h }; })()`);
    const f0 = await form();
    expect(await p.ev(`document.querySelectorAll('.form-field').length`), 'two fields').toBe(2);
    const first = await p.rect('.form-field');
    expect(first.l, 'the first field over the form').toBe(f0.x + 16);
    await p.click([first.l + 20, first.t + 10]);
    await p.ev(`document.execCommand('insertText', false, 'Москва')`);
    expect((await form()).fv[0], 'on the board at once').toBe('Москва');
    // The button: its middle, under the fields.
    await p.click([f0.x + f0.w / 2, f0.y + f0.h - 16 - 20]);
    await sleep(100);
    expect((await form()).fd, 'filled').toBe(true);
    expect(await p.ev(`document.querySelectorAll('.form-field').length`), 'no fields once filled').toBe(0);
    await p.click([f0.x + f0.w / 2, f0.y + f0.h - 16 - 20]);
    await sleep(100);
    expect((await form()).fd, 'editing again').toBe(false);
    expect(await p.ev(`document.querySelector('.form-field').value`), 'the value in its field').toBe('Москва');
  },

  async '"Канбан в объектах": a task dragged in stands in the column it\'s let go over, under the one there; dragged out, it\'s free and the gap closes'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 0.6 }; e.camChanged(); e.addKanban({ x: 900, y: 400 });
      b.add(e.newItem('task', 100, 1100, { id: 't1', text: 'Первая' })); b.add(e.newItem('task', 500, 1100, { id: 't2', text: 'Вторая' })); e.setSelection([]); })()`);
    await sleep(200);
    const k = await p.ev(`(() => { const f = planx.board.list().find((i) => i.kb); return { id: f.id, x: f.x, y: f.y }; })()`);
    const at = (id) => p.ev(`(() => { const t = planx.board.get('${id}'); return { x: t.x, y: t.y, w: t.w, h: t.h }; })()`);
    const drag = async (id, wx, wy) => {
      const t = await at(id), z = 0.6, from = [(t.x + 40) * z, (t.y + 20) * z];
      await p.mouse('mousePressed', ...from);
      for (let s = 1; s <= 6; s++) await p.mouse('mouseMoved', from[0] + ((wx + 40) * z - from[0]) * s / 6, from[1] + ((wy + 20) * z - from[1]) * s / 6);
      await p.mouse('mouseReleased', (wx + 40) * z, (wy + 20) * z);
      await sleep(150);
    };
    // Into the first column (20 in, under its stage's pill, and the 56 header), then the second under it.
    await drag('t1', k.x + 40, k.y + 120);
    let t1 = await at('t1');
    expect(t1.x, 'in the first column').toBe(k.x + 20);
    expect(t1.y, 'at its top').toBe(k.y + 58 + 16);
    await drag('t2', k.x + 40, k.y + 200);
    expect((await at('t2')).y, 'under the first').toBe(k.y + 58 + 16 + t1.h + 12);
    // Out again: free where it's let go, the other up in its place.
    await drag('t1', k.x + 100, k.y + 900);
    expect((await at('t1')).y, 'free where let go').toBe(k.y + 900);
    expect((await at('t2')).y, 'the gap closed').toBe(k.y + 58 + 16);
  },

  async '"Титул в объектах": an icon, a title and a description, one item; one over a new kanban, its title and icon; its icon double clicked, another to take; its title typed longer or it narrower, its description pushed down'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.5 }; e.camChanged(); e.dropItem('header', { x: 400, y: 200 }); })()`);
    await sleep(300);
    const headers = () => p.ev(`planx.board.list().filter((i) => i.hd).map((h) => [h.icon, h.text, (h.desc ?? '-').split(',')[0]].join(' / '))`);
    expect((await headers()).join(), 'its parts').toBe('kanban / Заголовок / Здесь идет описание заголовка');
    await p.ev(`(() => { planx.editor.setSelection([]); planx.editor.addKanban({ x: 1200, y: 900 }); })()`);
    await sleep(300);
    expect((await headers())[1], 'over the kanban').toBe('kanban / Канбан / -');
    expect(await p.ev(`(() => { const l = planx.board.list(), k = l.find((i) => i.kb), h = l.filter((i) => i.hd)[1]; return [h.x === k.x, k.y - h.y - h.h, planx.editor.selection.has(k.id)].join(); })()`), 'over its left, 4 off; the kanban picked').toBe('true,4,true');
    // Tied to it: moved, copied and deleted with it, never picked (its kanban instead).
    expect(await p.ev(`(() => { const e = planx.editor, l = planx.board.list(), k = l.find((i) => i.kb), h = l.filter((i) => i.hd)[1]; const r = [h.tie === k.id, !e.selection.has(h.id), h.h <= 40]; e.setSelection([h.id]); r.push([...e.selection].join() === k.id, e.dragSet(planx.board.list()).has(h.id)); e.setSelection([k.id]); e.duplicate(); const l2 = planx.board.list(), k2 = l2.find((i) => i.kb && i.id !== k.id), h2 = l2.find((i) => i.tie && i.tie === k2?.id); r.push(!!h2); e.setSelection([h2.id]); e.deleteSelection(); r.push(!planx.board.get(k2.id)); return r.join(); })()`), 'tied: never picked, its kanban instead').toBe('true,true,true,true,true,true,true');
    // Moved by itself (aligned, say): its header after it, over its corner.
    await p.ev(`(() => { const k = planx.board.list().find((i) => i.kb); planx.board.update(k.id, { x: k.x - 70, y: k.y + 40 }); })()`);
    await sleep(200);
    expect(await p.ev(`(() => { const l = planx.board.list(), k = l.find((i) => i.kb), h = l.find((i) => i.tie === k.id); return [h.x - k.x, k.y - h.y - h.h].join(); })()`), 'its header after it').toBe('0,4');
    await p.ev(`(() => { planx.editor.setSelection([]); window.swapped = []; addEventListener('planx:swap', (e) => swapped.push(e.detail)); })()`);
    const h = await p.ev(`(() => { const h = planx.board.list().find((i) => i.hd); return { id: h.id, x: h.x, y: h.y, w: h.w, h: h.h }; })()`);
    const dbl = async (wx, wy) => {
      const s = await p.ev(`(() => { const s = planx.editor.toScreen({ x: ${wx}, y: ${wy} }); return [s.x, s.y]; })()`);
      for (const n of [1, 2]) {
        await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: s[0], y: s[1], button: 'left', clickCount: n });
        await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: s[0], y: s[1], button: 'left', clickCount: n });
        await sleep(60);
      }
      await sleep(300);
    };
    await dbl(h.x + 18, h.y + 18);
    expect(await p.ev(`swapped.join()`), 'its icon to swap').toBe(h.id);
    // Its icon first on its panel, a click there the same.
    await p.ev(`(() => { window.swapped = []; planx.editor.setSelection(['${h.id}']); })()`);
    await sleep(300);
    expect(await p.ev(`document.querySelector('.bar.panel button')?.title`), 'the flag first').toBe('Заменить');
    await p.click(await p.at('.bar.panel button[title="Заменить"]'));
    expect(await p.ev(`swapped.join()`), 'clicked: its icon to swap').toBe(h.id);
    // Its colours: its icon's and how opaque, no outline nor text.
    await p.click(await p.at('.bar.panel [data-key="colors"] button, .bar.panel button[aria-label="Цвет"]'));
    await sleep(200);
    expect(await p.ev(`[...document.querySelectorAll('.paint-target button')].map((b) => b.getAttribute('aria-label')).join() || 'none'`), 'its icon only, no switch').toBe('none');
    await p.escape();
    await p.escape();
    await p.ev(`planx.editor.setSelection([])`);
    await dbl(h.x + 80, h.y + 15);
    expect(await p.ev(`[planx.editor.editingId, planx.editor.editingCell].join()`), 'its title typed in').toBe(`${h.id},`);
    await p.ev(`(() => { const t = document.querySelector('.text-edit'); t.value = 'Очень длинный заголовок, который не поместится в одну строку и перейдёт на вторую'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await p.escape();
    await sleep(200);
    let taller = await p.ev(`planx.board.get('${h.id}').h`);
    expect(taller > h.h + 25, 'two lines of title: its description pushed down').toBe(true);
    await p.ev(`(async () => { const l = await import('/src/labs/header.ts'), it = planx.board.get('${h.id}'); window.descY = l.headerLayout(it).desc.y; })()`);
    expect(await p.ev('descY') > 60, 'the description under the second line').toBe(true);
    // Its description double clicked: typed in, not its title.
    await p.ev(`planx.editor.setSelection([])`);
    await dbl(h.x + 80, h.y + (await p.ev('descY')) + 10);
    expect(await p.ev(`[planx.editor.editingId, planx.editor.editingCell].join()`), 'its description typed in').toBe(`${h.id},0`);
    await p.ev(`(() => { const t = document.querySelector('.text-edit'); t.value = 'Новое описание'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await p.escape();
    await sleep(200);
    expect(await p.ev(`[planx.board.get('${h.id}').desc, planx.board.get('${h.id}').text.slice(0, 5)].join()`), 'the description changed, the title kept').toBe('Новое описание,Очень');
    taller = await p.ev(`planx.board.get('${h.id}').h`);
    // Stretched taller by its corner: kept so; pulled up past what's in it, no shorter than that.
    await p.ev(`planx.editor.setSelection(['${h.id}'])`);
    await sleep(200);
    const corner = async () => { const it = await p.ev(`(() => { const i = planx.board.get('${h.id}'), s = planx.editor.toScreen({ x: i.x + i.w, y: i.y + i.h }); return [s.x + 3, s.y + 3]; })()`); return it; };
    let c = await corner();
    await p.drag(c, [c[0], c[1] + 60]);
    expect(await p.ev(`planx.board.get('${h.id}').h`), 'taller').toBe(taller + 120);
    c = await corner();
    await p.drag(c, [c[0], c[1] - 300]);
    expect(await p.ev(`planx.board.get('${h.id}').h`), 'no shorter than what\'s in it').toBe(taller);
    // «Отвязать от объекта»: its icon, title and description, each its own, picked.
    await p.click(await p.at('.bar.panel button[title^="Отвязать от объекта"]'));
    await sleep(200);
    expect(await p.ev(`[!!planx.board.get('${h.id}'), [...planx.editor.selection].map((id) => planx.board.get(id).type).sort().join()].join(' ')`), 'its parts its own').toBe('false icon,text,text');
  },

  async '"Скрыть объект" and "Фрейм вокруг выделенного": hidden, not drawn but picked by a click or a box there; the frame tool with something picked, a frame round it'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('sticky', 300, 200, { id: 'h', w: 160, h: 160 })); e.setSelection(['h']); e.setHidden(true); e.setSelection([]); })()`);
    await sleep(200);
    expect(await p.ev(`(() => { const d = document.querySelector('canvas').getContext('2d').getImageData(380 * devicePixelRatio, 280 * devicePixelRatio, 1, 1).data; return d[2] > 200; })()`), 'not drawn: the board there').toBe(true);
    await p.click([380, 280]);
    expect(await p.ev(`[...planx.editor.selection].join()`), 'clicked there: picked').toBe('h');
    await p.ev(`planx.editor.setSelection([])`);
    await p.drag([250, 150], [500, 420]);
    expect(await p.ev(`[...planx.editor.selection].join()`), 'boxed: picked').toBe('h');
    await p.ev(`planx.editor.setHidden(false)`);
    expect(await p.ev(`planx.board.get('h').hid`), 'shown again').toBe(undefined);
    await p.ev(`planx.editor.setTool('frame')`);
    expect(await p.ev(`(() => { const f = planx.board.list().find((i) => i.type === 'frame'); return !!f && f.members.includes('h') && planx.editor.tool; })()`), 'a frame round it').toBe('select');
  },

  async '"Копия стрелками": Alt+arrow a copy that way, past what\'s there; a kanban card\'s in its column under it (the kanban growing) or in the next one'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 0.5 }; e.camChanged();
      b.add(e.newItem('sticky', 100, 100, { id: 's', w: 160, h: 160 })); b.add(e.newItem('sticky', 468, 100, { id: 'o', w: 160, h: 160 })); e.setSelection(['s']); })()`);
    await sleep(200);
    const alt = (key, vk) => p.key(key, key, vk, 1);
    const picked = () => p.ev(`(() => { const t = planx.board.get([...planx.editor.selection][0]); return t.id === 's' ? 'the same' : t.x + ',' + t.y; })()`);
    await alt('ArrowRight', 39);
    expect(await picked(), 'right of it, 24 off, picked').toBe('284,100');
    await alt('ArrowRight', 39);
    expect(await picked(), 'past the one there').toBe('652,100');
    await alt('ArrowDown', 40);
    expect(await picked(), 'under it').toBe('652,284');
    await p.ev(`(() => { const e = planx.editor, b = planx.board; b.replaceAll([], []); e.addKanban({ x: 1200, y: 1200 }); })()`);
    await sleep(100);
    const k = await p.ev(`(() => { const f = planx.board.list().find((i) => i.kb); return { id: f.id, h: f.h }; })()`);
    await p.ev(`(() => { const e = planx.editor, b = planx.board, f = b.get('${k.id}'); b.add(e.newItem('task', f.x + 40, f.y + 100, { id: 't', text: 'Задача' })); b.update(f.id, { members: ['t'] }); e.setSelection(['t']); })()`);
    await sleep(200);
    for (let i = 0; i < 4; i++) await alt('ArrowDown', 40);
    await sleep(300);
    const col = await p.ev(`(() => { const f = planx.board.get('${k.id}'); return f.members.map((id) => planx.board.get(id)).filter((c) => c.x === planx.board.get('t').x).length + ' ' + (f.h > ${k.h}); })()`);
    expect(col, 'five in its column, the kanban taller').toBe('5 true');
    await alt('ArrowRight', 39);
    await sleep(300);
    expect(await p.ev(`(() => { const f = planx.board.get('${k.id}'), t = planx.board.get([...planx.editor.selection][0]); return f.members.includes(t.id) && t.x > planx.board.get('t').x; })()`), 'one in the next column').toBe(true);
  },

  async '"Таймлайн растёт": a task on a timeline copied past its edge (Alt and an arrow, «Дублировать»), the timeline grown to take it in, it on it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.addTimeline({ x: 900, y: 500 }); const t = b.list().find((i) => i.tl);
      b.add(e.newItem('task', t.x + t.w - 320, t.y + t.h - 80, { id: 'a', text: 'Задача' })); e.settle(['a']); e.setSelection(['a']); })()`);
    await sleep(200);
    const tl = () => p.ev(`(() => { const t = planx.board.list().find((i) => i.tl); return { w: t.w, h: t.h, x: t.x, y: t.y, n: t.members.length }; })()`);
    const was = await tl();
    await p.ev(`planx.editor.duplicateArrow(1, 0)`);
    await sleep(200);
    let now = await tl();
    expect([now.w > was.w, now.n, now.x === was.x].join(), 'wider, the copy on it').toBe('true,2,true');
    const c = await p.ev(`(() => { const t = planx.board.list().find((i) => i.tl), c = planx.board.get([...planx.editor.selection][0]); return t.x + t.w - c.x - c.w; })()`);
    expect(c >= 24, 'room right of it').toBe(true);
    await p.ev(`planx.editor.duplicateArrow(0, 1)`);
    await sleep(200);
    now = await tl();
    expect([now.h > was.h, now.n].join(), 'taller, that copy on it too').toBe('true,3');
  },

  async '"Кучки": a kanban with its cards and header one pile: drawn together, a layer down all of it, hidden, aligned, copied and deleted whole'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.addKanban({ x: 900, y: 500 }); const k = b.list().find((i) => i.kb);
      b.add(e.newItem('task', k.x + 30, k.y + 80, { id: 'c', text: 'Карточка' })); e.settle(['c']);
      b.add(e.newItem('sticky', k.x + 200, k.y + 100, { id: 's', w: 160, h: 160 })); b.update('c', { z: b.maxZ() + 1 }); e.setSelection([]); })()`);
    await sleep(300);
    const order = () => p.ev(`(() => { const ids = planx.editor.shown().map((i) => i.id), k = planx.board.list().find((i) => i.kb && !i.dup); return { k: ids.indexOf(k.id), c: ids.indexOf('c'), s: ids.indexOf('s') }; })()`);
    let o = await order();
    expect(o.c === o.k + 1 || o.c > o.k, 'the card in it').toBe(true);
    expect(o.s > o.c, 'the sticker over all of it, not between').toBe(true);
    await p.ev(`(() => { planx.editor.setSelection(['s']); planx.editor.shiftZ(-1); })()`);
    o = await order();
    expect(o.s < o.k, 'a layer down: under all of it').toBe(true);
    const kid = await p.ev(`planx.board.list().find((i) => i.kb).id`);
    await p.ev(`(() => { const e = planx.editor; e.setSelection(['${kid}']); e.setHidden(true); })()`);
    expect(await p.ev(`planx.editor.shown().some((i) => i.id === 'c' || i.tie === '${kid}')`), 'hidden: its card and header too').toBe(false);
    await p.ev(`(() => { const e = planx.editor; e.setHidden(false); e.setSelection(['${kid}', 's']); })()`);
    const before = await p.ev(`planx.board.get('c').x - planx.board.get('${kid}').x`);
    await p.ev(`(async () => { (await import('/src/labs/align.ts')).alignItems(planx.editor, 'right'); })()`);
    await sleep(300);
    expect(await p.ev(`planx.board.get('c').x - planx.board.get('${kid}').x`), 'aligned: its card along').toBe(before);
    // Boxed whole: it, not what's in it; in part: what's in it.
    await p.ev(`(() => { const e = planx.editor, k = planx.board.get('${kid}'); e.cam = { x: 100 - k.x * 0.5, y: 150 - k.y * 0.5, z: 0.5 }; e.camChanged(); e.setSelection([]); })()`);
    await sleep(200);
    const kb = await p.ev(`(() => { const k = planx.board.get('${kid}'); return [k.w * 0.5, k.h * 0.5]; })()`);
    await p.drag([90, 140], [100 + kb[0] + 10, 150 + kb[1] + 10]);
    expect(await p.ev(`[planx.editor.selection.has('c'), planx.editor.selection.has('${kid}')].join()`), 'boxed whole: it, not its card').toBe('false,true');
    await p.ev(`planx.editor.setSelection([])`);
    await p.drag([90, 140], [100 + 200, 150 + 100]);
    expect(await p.ev(`[planx.editor.selection.has('c'), planx.editor.selection.has('${kid}')].join()`), 'boxed in part: its card, not it').toBe('true,false');
    await p.ev(`planx.editor.setSelection([])`);
    await p.drag([100 + kb[0] + 20, 150 + kb[1] + 20], [100 + kb[0] - 20, 150 + kb[1] - 20]);
    expect(await p.ev(`[planx.editor.selection.has('c'), planx.editor.selection.has('${kid}')].join()`), 'touched, nothing in it boxed: it').toBe('false,true');
    await p.ev(`(() => { const e = planx.editor; e.setSelection(['${kid}']); e.duplicate(); })()`);
    await sleep(300);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'task').length`), 'copied: its card too').toBe(2);
    await p.ev(`(() => { const e = planx.editor; e.setSelection(['${kid}']); e.deleteSelection(); })()`);
    await sleep(200);
    expect(await p.ev(`[!!planx.board.get('c'), planx.board.list().some((i) => i.tie === '${kid}')].join()`), 'deleted: its card and header too').toBe('false,false');
    // Two at the same height (a copy, say): a layer down, under the other all the same.
    await p.ev(`(() => { const e = planx.editor, b = planx.board; b.add(e.newItem('task', 3000, 0, { id: 'u', z: 50 })); b.add(e.newItem('task', 3100, 10, { id: 'v', z: 50 })); e.setSelection(['v']); e.shiftZ(-1); })()`);
    expect(await p.ev(`planx.editor.shown().filter((i) => i.id === 'u' || i.id === 'v').map((i) => i.id).join()`), 'the same height: apart').toBe('v,u');
  },

  async '"Заголовок задачи в три строки": a long title wraps, three lines at most, the header taller; «Заголовок в одну строку», one as before'(p) {
    await p.ev(`(() => { const e = planx.editor, long = 'Очень длинный заголовок задачи, который переносится на несколько строк и даже больше чем на три строки вот так';
      planx.board.add(e.newItem('task', 100, 100, { id: 'a', text: long })); planx.board.add(e.newItem('task', 100, 300, { id: 'b', text: 'Короткая' })); planx.board.add(e.newItem('task', 500, 300, { id: 'c', text: long, t1: true })); })()`);
    await sleep(300);
    expect(await p.ev(`['a', 'b', 'c'].map((id) => planx.board.get(id).h).join()`), 'three lines, one, one').toBe('93,52,52');
  },

  async '"Создать задачу на таймлайне": a new timeline twice as tall, «Создать задачи» on it from today; a click, two tasks there joined, the first typed in'(p) {
    await p.ev(`(() => { const e = planx.editor; e.addTimeline({ x: 0, y: 0 }); const t = planx.board.list().find((i) => i.tl); e.cam = { x: 600 - (t.x + t.w / 2) * 0.6, y: 400 - (t.y + t.h / 2) * 0.6, z: 0.6 }; e.camChanged(); e.setSelection([]); })()`);
    await sleep(300);
    const b = await p.ev(`(async () => { const k = await import('/src/labs/kanban.ts'), t = planx.board.list().find((i) => i.tl); const b = k.newCardBox(t, (id) => planx.board.get(id)); const s = planx.editor.toScreen({ x: b.x + b.w / 2, y: b.y + b.h / 2 }); return { ...b, sx: s.x, sy: s.y, th: t.h }; })()`);
    expect(b.th, 'twice as tall').toBe(380);
    await p.click([b.sx, b.sy]);
    await sleep(300);
    expect(await p.ev(`(() => { const t = planx.board.get(planx.editor.editingId), f = planx.board.list().find((i) => i.tl); return [t?.type, t?.x === ${b.x}, f.members.includes(t?.id)].join(); })()`), 'a task there, typed in').toBe('task,true,true');
    expect(await p.ev(`(() => { const t = planx.board.get(planx.editor.editingId), f = planx.board.list().find((i) => i.tl), n = planx.board.list().find((i) => i.type === 'task' && i.id !== t.id), l = planx.board.linkList()[0]; return [n?.text, Math.abs(n?.x - (t.x + t.w / 2)) <= 0.5, n?.y === t.y + t.h + Math.round(t.h * 2 / 3), f.members.includes(n?.id), l?.from === t.id && l?.to === n?.id].join(); })()`), 'a second one, named, joined').toBe('Вторая задача,true,true,true,true');
    await p.escape();
    await sleep(200);
    const b2 = await p.ev(`(async () => { const k = await import('/src/labs/kanban.ts'), t = planx.board.list().find((i) => i.tl); return k.newCardBox(t, (id) => planx.board.get(id)); })()`);
    expect(b2, 'gone with the first task').toBe(null);
  },

  async '"Канбан в объектах": «Создать задачу» under the first stage while it\'s empty: a click, a task there, typed in; gone with it'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.8 }; e.camChanged(); e.addKanban({ x: 700, y: 400 }); e.setSelection([]); })()`);
    await sleep(200);
    const box = async () => { const b = await p.ev(`(async () => { const k = await import('/src/labs/kanban.ts'), f = planx.board.list().find((i) => i.kb); return k.newCardBox(f, (id) => planx.board.get(id)); })()`); return b; };
    const b = await box();
    expect(b.h, 'as tall as a task').toBe(52);
    await p.click([(b.x + b.w / 2) * 0.8, (b.y + b.h / 2) * 0.8]);
    await sleep(200);
    expect(await p.ev(`(() => { const e = planx.editor, t = planx.board.get(e.editingId), f = planx.board.list().find((i) => i.kb); return [t?.type, t?.x === ${b.x} && t?.y === ${b.y}, f.members.includes(t?.id), [...e.selection].join() === t?.id].join(); })()`), 'a task there, in it, typed in').toBe('task,true,true,true');
    await p.ev(`(() => { const t = document.querySelector('.text-edit'); t.value = 'Первая'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await p.escape();
    await sleep(300);
    expect(await box(), 'gone with the first card').toBe(null);
  },

  async '"Канбан в объектах": its «+» adds a stage; a stage\'s pill opens its menu: renamed, recoloured, moved'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.6 }; e.camChanged(); e.addKanban({ x: 900, y: 500 }); e.setSelection([]); })()`);
    await sleep(200);
    const k = () => p.ev(`(() => { const f = planx.board.list().find((i) => i.kb); return { x: f.x, y: f.y, w: f.w, kb: f.kb }; })()`);
    let f = await k();
    // «+»: at the header's right end.
    const z = 0.6;
    await p.click([(f.x + f.w - 16 - 20 + 8) * z, (f.y + 28) * z]);
    await sleep(150);
    f = await k();
    expect(f.kb.length, 'a fifth stage').toBe(5);
    // The first pill.
    await p.click([(f.x + 16 + 20) * z, (f.y + 28) * z]);
    await sleep(200);
    expect(await p.ev(`!!document.querySelector('.stage-pop')`), 'its menu').toBe(true);
    await p.ev(`(() => { const i = document.querySelector('.stage-name'); i.select(); document.execCommand('insertText', false, 'Бэклог'); })()`);
    await p.click(await p.at('.stage-pop .sw[aria-label="Цвет purple"]'));
    await sleep(150);
    f = await k();
    expect(f.kb[0].n, 'renamed').toBe('Бэклог');
    expect(f.kb[0].c, 'recoloured').toBe('purple');
    await p.escape();
    await sleep(100);
    expect(await p.ev(`!!document.querySelector('.stage-pop:not(.gone)')`), 'Esc closes it').toBe(false);
    // Its pill dragged along the header into the next column: it goes there, no menu.
    const pill = [(f.x + 20 + 20) * z, (f.y + 28) * z];
    await p.mouse('mousePressed', ...pill);
    for (let s = 1; s <= 6; s++) await p.mouse('mouseMoved', pill[0] + s * 70, pill[1]);
    await p.mouse('mouseReleased', pill[0] + 420, pill[1]);
    await sleep(150);
    f = await k();
    expect(f.kb[1].n, 'moved right').toBe('Бэклог');
    expect(await p.ev(`!!document.querySelector('.stage-pop:not(.gone)')`), 'no menu once dragged').toBe(false);
    // The header right of a pill: the whole kanban dragged.
    const from = [(f.x + 20 + 250) * z, (f.y + 28) * z];
    await p.mouse('mousePressed', ...from);
    for (let s = 1; s <= 5; s++) await p.mouse('mouseMoved', from[0] + s * 10, from[1] + s * 10);
    await p.mouse('mouseReleased', from[0] + 50, from[1] + 50);
    await sleep(150);
    const moved = await k();
    expect(Math.round(moved.x - f.x), 'dragged by its stage').toBe(Math.round(50 / z));
    expect(await p.ev(`!!document.querySelector('.stage-pop:not(.gone)')`), 'no menu once dragged').toBe(false);
  },

  async '"Документ": a sheet of A4 from the rail, its text from the top; what doesn\'t fit on a page goes on, the pager under it turning them'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 40, y: 20, z: 0.6 }; e.camChanged(); e.dropItem('page', { x: 300, y: 380 }); })()`);
    await sleep(200);
    const it = await p.ev(`(() => { const f = planx.board.list().find((i) => i.type === 'page'); return { id: f.id, x: f.x, y: f.y, w: f.w, h: f.h }; })()`);
    expect(`${it.w}×${it.h}`, 'A4').toBe('794×1123');
    expect(await p.ev(`!!document.querySelector('.tools button[aria-label="Документ"]')`), 'its button on the rail').toBe(true);
    await p.ev(`(() => { planx.board.update('${it.id}', { text: Array.from({ length: 60 }, (_, i) => 'Строка номер ' + (i + 1) + ' в документе, довольно длинная, чтобы переноситься на следующую строку листа').join('\\n') }); planx.editor.setSelection([]); })()`);
    await sleep(200);
    const shown = () => p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'); const it = planx.board.get('${it.id}'); return [d.pageShown(it), d.pagesOf(it).length]; })()`);
    const [first, of] = await shown();
    expect(first, 'its first page').toBe(0);
    expect(of > 1, 'more than one page').toBe(true);
    await p.click([40 + (it.x + it.w / 2 + 44) * 0.6, 20 + (it.y + it.h + 22) * 0.6]);
    expect((await shown())[0], 'the next page').toBe(1);
    await p.click([40 + (it.x + it.w / 2 - 44) * 0.6, 20 + (it.y + it.h + 22) * 0.6]);
    expect((await shown())[0], 'back').toBe(0);
  },

  async '"Документ": typed in as it looks; words picked made bold or coloured on the text panel (those alone), a paragraph a heading, kept once done'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 40, y: 20, z: 0.8 }; e.camChanged(); e.dropItem('page', { x: 420, y: 500 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { planx.board.update('${id}', { text: 'Договор\\nПервое важное слово и обычный текст', rs: [{ s: 7, e: 8, h: 1 }] }); planx.editor.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    expect(await p.ev(`!!document.querySelector('.rich-edit')`), 'the field typed in as it looks').toBe(true);
    expect(await p.ev(`getComputedStyle(document.querySelector('.rich-edit > div')).fontWeight`), 'its heading bold as it\'s typed in').toBe('700');
    // Picks characters s…e of the n-th paragraph in the field.
    const pick = (n, s, e) => p.ev(`(() => { const d = document.querySelector('.rich-edit'); d.focus(); const para = d.children[${n}], w = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
      const at = (i) => { let t; while ((t = w.nextNode())) { if (i <= t.length) return [t, i]; i -= t.length; } };
      const a = at(${s}); const w2 = document.createTreeWalker(para, NodeFilter.SHOW_TEXT); let i = ${e}, t, b; while ((t = w2.nextNode())) { if (i <= t.length) { b = [t, i]; break; } i -= t.length; }
      const r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); })()`);
    await pick(1, 7, 13);
    await sleep(150);
    await p.click(await p.at('.tfmt button[aria-label="Жирный"]'));
    await sleep(150);
    expect(await p.ev(`getComputedStyle(document.querySelector('.rich-edit').children[1].querySelector('span, b') ?? document.body).fontWeight`), 'bold as it\'s typed in').toBe('700');
    await pick(1, 0, 6);
    await p.click(await p.at('.tfmt button[aria-label="Цвет текста"]'));
    await sleep(150);
    await p.click(await p.at('.params-colors button[aria-label="Цвет текста: red"]'));
    await sleep(150);
    // The first paragraph a heading 2 instead of 1, then done with it.
    await pick(0, 2, 2);
    await p.click(await p.at('.tfmt button[aria-label^="Стиль"]'));
    await sleep(150);
    await p.click(await p.at('.tf-menu .tf-item:nth-child(3)'));
    await sleep(150);
    await p.ev(`document.querySelector('.rich-edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(200);
    const it = await p.ev(`JSON.stringify({ text: planx.board.get('${id}').text, rs: planx.board.get('${id}').rs })`);
    expect(it, 'kept').toBe(JSON.stringify({ text: 'Договор\nПервое важное слово и обычный текст', rs: [{ s: 7, e: 8, h: 2 }, { s: 8, e: 14, c: 'red' }, { s: 15, e: 21, b: true }] }));
  },

  async '"Документ": a line picked given a size of its own, the others as they were'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 40, y: 20, z: 0.8 }; e.camChanged(); e.dropItem('page', { x: 420, y: 500 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { planx.board.update('${id}', { text: 'Один\\nДва\\nТри' }); planx.editor.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    // The second line picked.
    await p.ev(`(() => { const d = document.querySelector('.rich-edit'); d.focus(); const t = d.children[1].firstChild, r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 3); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); })()`);
    await sleep(150);
    await p.click(await p.at('.tfmt button[aria-label^="Размер"]'));
    await sleep(150);
    // (Its menu low on the screen here, 32 under the panel: pressed as it is.)
    await p.ev(`[...document.querySelectorAll('.tf-menu .tf-item.num')].find((x) => x.textContent === '32').click()`);
    await sleep(150);
    expect(await p.ev(`[...document.querySelector('.rich-edit').children].map((d) => getComputedStyle(d).fontSize).join()`), 'that line alone bigger as it\'s typed in').toBe('16px,32px,16px');
    await p.ev(`document.querySelector('.rich-edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(200);
    expect(await p.ev(`JSON.stringify([planx.board.get('${id}').fs ?? 16, planx.board.get('${id}').rs])`), 'kept: its own size on it alone').toBe(JSON.stringify([16, [{ s: 8, e: 9, z: 32 }]]));
  },

  async '"Документ": typed in with its second page shown: scrolled to where that page starts, not the top'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 40, y: 20, z: 0.8 }; e.camChanged(); e.dropItem('page', { x: 420, y: 500 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const r = await p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'), b = planx.board;
      b.update('${id}', { text: Array.from({ length: 80 }, (_, i) => 'Строка ' + (i + 1)).join('\\n') });
      const it = b.get('${id}'), first = d.docLines(it).find((l) => l.page === 1);
      d.showPage('${id}', 1); planx.editor.startEditing('${id}', null, 'end');
      await new Promise((r) => setTimeout(r, 400));
      const el = document.querySelector('.rich-edit'), top = el.getBoundingClientRect().top;
      const at = [...el.children].find((c) => c.getBoundingClientRect().bottom > top + 2);
      return [el.scrollTop > 0, at?.textContent === it.text.slice(first.s, first.e).trim()].join(); })()`);
    expect(r, 'scrolled to its second page\'s first line').toBe('true,true');
  },

  async '"Документ": typed in on its third page, that page\'s text alone picked and shown; a paragraph aligned right alone'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 40, y: 20, z: 0.5 }; e.camChanged(); e.dropItem('page', { x: 420, y: 420 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const r = await p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'), b = planx.board;
      b.update('${id}', { text: Array.from({ length: 120 }, (_, i) => 'Строка ' + (i + 1)).join('\\n') });
      const it = b.get('${id}'), on = d.docLines(it).filter((l) => l.page === 2);
      d.showPage('${id}', 2); planx.editor.startEditing('${id}');
      await new Promise((r) => setTimeout(r, 400));
      const el = document.querySelector('.rich-edit'), top = el.getBoundingClientRect().top;
      const at = [...el.children].find((c) => c.getBoundingClientRect().bottom > top + 2);
      const picked = getSelection().toString().replace(/\\n+/g, '\\n').trim(), want = it.text.slice(on[0].s, on[on.length - 1].e).trim();
      return [d.pageShown(it), at?.textContent === it.text.slice(on[0].s, on[0].e).trim(), picked === want].join(); })()`);
    expect(r, 'page 3: its first line at the top, its text alone picked').toBe('2,true,true');
    // A paragraph (its first) aligned right alone.
    await p.ev(`(() => { const d = document.querySelector('.rich-edit'), para = [...d.children].find((c) => c.getBoundingClientRect().top >= d.getBoundingClientRect().top), t = para.firstChild, r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 2); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); })()`);
    await sleep(150);
    await p.click(await p.at('.tfmt button[aria-label="Выравнивание"]'));
    await sleep(150);
    await p.ev(`document.querySelector('.tfmt button[aria-label="По правому краю"]').click()`);
    await sleep(150);
    expect(await p.ev(`(() => { const d = document.querySelector('.rich-edit'); return [...d.children].filter((c) => getComputedStyle(c).textAlign === 'right').length; })()`), 'that paragraph alone').toBe(1);
    await p.ev(`document.querySelector('.rich-edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(200);
    expect(await p.ev(`(planx.board.get('${id}').rs ?? []).filter((r) => r.a === 'right').length`), 'kept on it alone').toBe(1);
  },

  async '"Документ": every kind of thing in it, in several fonts and sizes: typed in and done with, unchanged; its lines broken and placed in the field as on the sheet'(p) {
    const LONG = 'Это длинная строка текста, которая точно переносится на следующую строку при обычной ширине листа А4, и ещё немного слов.';
    const doc = () => {
      const paras = [
        ['Заголовок первый', { h: 1 }], ['Подзаголовок второго уровня', { h: 2 }], [LONG, {}], ['пункт списка ' + LONG, { l: 'bullet' }],
        ['вложенный пункт', { l: 'bullet', d: 1 }], ['номер один', { l: 'number' }], ['номер два', { l: 'number' }], ['дело сделать', { l: 'todo' }],
        ['дело сделано', { l: 'done' }], ['цитата ' + LONG, { k: 'quote' }], ['', { k: 'hr' }], ['const a = 1;', { k: 'code' }], ['  return a;', { k: 'code' }],
        ['Мелкий заголовок', { h: 5 }], ['По центру', { a: 'center' }], ['Свой размер', { z: 24 }], ['Последняя строка с кодом run() внутри.', {}],
      ];
      const text = paras.map((p) => p[0]).join('\n');
      let rs = [], at = 0;
      paras.forEach(([t, k]) => { const e = at + t.length; for (const [key, v] of Object.entries(k)) rs.push({ s: e, e: e + 1, [key]: v }); at = e + 1; });
      const i = text.indexOf('run()'); rs.push({ s: i, e: i + 5, m: true });
      const j = text.indexOf('длинная'); rs.push({ s: j, e: j + 7, b: true });
      const k2 = text.indexOf('строка текста'); rs.push({ s: k2, e: k2 + 6, i: true });
      return { text, rs };
    };

    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 500, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const d = doc();
    for (const [ff, fs] of [[undefined, 16], ['serif', 12], ['mono', 16], ['hand', 12], ['montserrat', 22]]) {
      await p.ev(`(async () => { const t = await import('/src/model/textLinks.ts'); const d = ${JSON.stringify(d)};
        let rs; for (const r of d.rs) { const { s, e, ...k } = r; for (const [key, v] of Object.entries(k)) rs = t.setRun(rs, s, e, key, true, v); }
        planx.board.update('${id}', { text: d.text, rs, ff: ${JSON.stringify(ff ?? null)} ?? undefined, fs: ${fs} }); const it = planx.board.get('${id}'); const e = planx.editor; e.cam = { x: 100 - it.x, y: 60 - it.y, z: 1 }; e.camChanged(); e.setSelection([]); })()`);
      await sleep(250);
      const before = await p.ev(`JSON.stringify([planx.board.get('${id}').text, planx.board.get('${id}').rs])`);
      await p.ev(`planx.editor.startEditing('${id}', null, 'end')`);
      await sleep(350);
      // Lines per paragraph: on the sheet (docLines) and in the field (its rects, one per line).
      const cmp = await p.ev(`(async () => { const dp = await import('/src/labs/docPage.ts'), it = planx.board.get('${id}'), el = document.querySelector('.rich-edit');
        const sheet = {}; let at = 0; const paras = it.text.split('\\n'), starts = paras.map((q) => { const s = at; at += q.length + 1; return s; });
        for (const l of dp.docLines(it)) { const pi = starts.findLastIndex((s) => s <= l.s); sheet[pi] = (sheet[pi] ?? 0) + 1; }
        const field = {}; [...el.children].forEach((c, pi) => { if (!c.textContent) { field[pi] = 1; return; } const r = document.createRange(); r.selectNodeContents(c); const bs = [...r.getClientRects()].filter((q) => q.width > 0.5).map((q) => q.top + q.height / 2).sort((a, b) => a - b); let n = 0, last = -1e9; for (const b of bs) { if (b - last > 8) n++; last = b; } field[pi] = n; });
        const diff = Object.keys(sheet).filter((k) => sheet[k] !== field[k]).map((k) => k + ':' + sheet[k] + '/' + field[k] + ' ' + paras[k].slice(0, 20));
        // Heights: the field's paragraphs' tops vs the sheet's lines'.
        const top0 = el.getBoundingClientRect().top, z = planx.editor.cam.z, lines = dp.docLines(it);
        const off = [...el.children].map((c, pi) => { const l = lines.find((x) => x.s === starts[pi] || (x.s >= starts[pi] && x.s <= starts[pi] + paras[pi].length)); return l ? Math.round((c.getBoundingClientRect().top - top0) / z - l.y) : null; });
        return JSON.stringify({ diff, off: off.filter((o) => o !== null && Math.abs(o) > 2).length ? off : 'ok' }); })()`);
      await p.key('Escape', 'Escape', 27);
      await sleep(250);
      const after = await p.ev(`JSON.stringify([planx.board.get('${id}').text, planx.board.get('${id}').rs])`);
      expect(after, `${ff ?? 'onest'} ${fs}: typed in and done with, unchanged`).toBe(before);
      expect(cmp, `${ff ?? 'onest'} ${fs}: its lines in the field as on the sheet`).toBe(JSON.stringify({ diff: [], off: 'ok' }));
    }
  },

  async '"Документ": pasted from Google Docs, Word, Notion and a site: what a document has kept, their fonts, sizes and black or grey text colours left out, nothing bold that isn\'t'(p) {
    const SAMPLES = {
      gdocs: `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;text-decoration:none;">Обычный текст из гугл доков </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:700;">жирный</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;"> и </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#ff0000;font-weight:400;font-style:italic;">красный курсив</span></p><h2 dir="ltr"><span style="font-size:16pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;">Заголовок два</span></h2><ul><li dir="ltr"><p dir="ltr"><span style="font-size:11pt;font-family:Arial;color:#000000;">пункт</span></p></li></ul></b>`,
      word: `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><p class=MsoNormal><span style='font-size:12.0pt;font-family:"Times New Roman",serif;color:black'>Абзац из Word <b>жирно</b></span></p><p class=MsoNormal><span style='font-size:14.0pt;font-family:"Calibri",sans-serif'>Второй абзац</span></p></body></html>`,
      notion: `<h1>Notion заголовок</h1><p>Текст с <code>inline code</code> и <a href="https://x.y">ссылкой</a></p><ul><li>раз<ul><li>вложенный</li></ul></li><li>два</li></ul><blockquote>цитата</blockquote><pre><code>line1\n  line2</code></pre><ul><li><input type="checkbox" checked>сделано</li></ul><hr><p>конец</p>`,
      site: `<div style="font-family: Georgia; font-size: 20px; color: rgb(51, 51, 51)"><p>Статья с сайта <strong>важно</strong> <em>курсив</em></p><table><tr><td>a</td><td>b</td></tr></table><img src="x.png"><p>после картинки</p></div>`,
    };
    const WANT = {"gdocs": ["Начало\nОбычный текст из гугл доков жирный и красный курсив\nЗаголовок два\nпункт", [{"s": 35, "e": 41, "b": true}, {"s": 44, "e": 58, "i": true, "c": "#FF0000"}, {"s": 72, "e": 73, "h": 2}, {"s": 78, "e": 79, "l": "bullet"}]], "word": ["Начало\nАбзац из Word жирно\nВторой абзац", [{"s": 21, "e": 26, "b": true}]], "site": ["Начало\nСтатья с сайта важно курсив\na b\nпосле картинки", [{"s": 22, "e": 27, "b": true}, {"s": 28, "e": 34, "i": true}]]};

    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    for (const [name, html] of Object.entries(SAMPLES)) {
      await p.ev(`(() => { planx.board.update('${id}', { text: 'Начало', rs: undefined }); const it = planx.board.get('${id}'); const e = planx.editor; e.cam = { x: 150 - (it.x + 100), y: 110 - (it.y + 60), z: 1 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
      await sleep(350);
      await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
      await p.ev(`(() => { const dt = new DataTransfer(); dt.setData('text/html', ${JSON.stringify(html)}); dt.setData('text/plain', 'x'); document.querySelector('.rich-edit').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
      await sleep(150);
      const fieldFonts = await p.ev(`[...new Set([...document.querySelectorAll('.rich-edit *')].map((e) => e.style.fontFamily).filter(Boolean))].join(' | ')`);
      await p.key('Escape', 'Escape', 27);
      await sleep(250);
      const it = await p.ev(`(() => { const i = planx.board.get('${id}'); return { text: i.text, rs: i.rs }; })()`);
      expect(fieldFonts, `${name}: no fonts of its own in the field (but code's)`).toBe(name === 'notion' ? '"JetBrains Mono", ui-monospace, monospace' : '');
      if (WANT[name]) expect(JSON.stringify([it.text, it.rs]), `${name}: its text and styles`).toBe(JSON.stringify(WANT[name]));
    }
  },

  async '"Документ": of two pages, typed on past the first one\'s end: the next page shown, the caret in sight'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.6 }; e.camChanged(); e.dropItem('page', { x: 400, y: 400 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'); planx.board.update('${id}', { text: Array.from({ length: 60 }, (_, i) => 'Строка ' + (i + 1)).join('\\n') }); const it = planx.board.get('${id}'); const e = planx.editor; e.cam = { x: 100 - it.x * 0.6, y: 40 - it.y * 0.6, z: 0.6 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    // the caret at the end of the last line of page 1
    const info = await p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'), it = planx.board.get('${id}'); const l = d.docLines(it).filter((x) => x.page === 0).pop(); return [l.e, d.pagesOf(it).length, d.pageShown(it)]; })()`);
    expect(info[1], 'two pages').toBe(2);
    // reopen on page 0 with caret on page 1's last line
    await p.key('Escape', 'Escape', 27); await sleep(200);
    await p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'); d.showPage('${id}', 0); planx.editor.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);

    const caret = await p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'), it = planx.board.get('${id}'); const l = d.docLines(it).filter((x) => x.page === 0).pop(); const el = document.querySelector('.rich-edit'); let left = l.e; let node = null, off = 0; for (const c of el.children) { const n = c.textContent.length; if (left <= n) { node = c.firstChild ?? c; off = left; break; } left -= n + 1; } const r = document.createRange(); r.setStart(node, off); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return el.scrollTop; })()`);
    expect(caret, 'on its first page').toBe(0);
    for (let k = 0; k < 4; k++) { await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' }); await sleep(60); }
    await p.cdp('Input.insertText', { text: 'НОВОЕ' });
    await sleep(200);
    expect(await p.ev(`(() => { const el = document.querySelector('.rich-edit'), r = getSelection().getRangeAt(0).getBoundingClientRect(), f = el.getBoundingClientRect(); return r.top >= f.top && r.bottom <= f.bottom; })()`), 'the caret in sight: typed on past the page\'s end, on the next page').toBe(true);
    expect(await p.ev(`(async () => (await import('/src/labs/docPage.ts')).pageShown(planx.board.get('${id}')))()`), 'its pager turned with it').toBe(1);
    await p.key('Escape', 'Escape', 27);
  },

  async '"Документ": a link in it blue as it\'s typed in, on its word still once something\'s typed before it'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { planx.board.update('${id}', { text: 'Смотри сайт тут и дальше\\nВторая', links: [{ s: 12, e: 15, url: 'https://example.com' }] }); const it = planx.board.get('${id}'); const e = planx.editor; e.cam = { x: 150 - (it.x + 100), y: 110 - (it.y + 60), z: 1 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    expect(await p.ev(`document.querySelector('.rich-edit [data-link]')?.textContent`), 'its link blue in the field').toBe('тут');
    // type at start of the doc
    await p.ev(`(() => { const d = document.querySelector('.rich-edit'); const r = document.createRange(); r.setStart(d.children[0].firstChild, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
    await p.cdp('Input.insertText', { text: 'Ну, ' });
    await p.key('Escape', 'Escape', 27);
    await sleep(300);
    expect(await p.ev(`JSON.stringify([planx.board.get('${id}').text, planx.board.get('${id}').links, planx.board.get('${id}').rs ?? null])`), 'typed before it: the link on its word still, no colour of its own')
      .toBe(JSON.stringify(['Ну, Смотри сайт тут и дальше\nВторая', [{ s: 16, e: 19, url: 'https://example.com' }], null]));
  },

  async '"Документ": a document\'s text pasted into another (its field\'s HTML): its headings, lists, checklists, quotes, code, dividers and colours, all as they were'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const src = { text: 'Заголовок\nпункт\nвложенный\nсделано\nцитата\nconst a = 1;\n\nвызов run() красным', rs: [
      { s: 9, e: 10, h: 2 }, { s: 15, e: 16, l: 'bullet' }, { s: 25, e: 26, l: 'bullet', d: 1 }, { s: 33, e: 34, l: 'done' }, { s: 40, e: 41, k: 'quote' }, { s: 53, e: 54, k: 'code' }, { s: 54, e: 55, k: 'hr' },
      { s: 61, e: 66, m: true }, { s: 67, e: 74, c: 'red' }] };
    const html = await p.ev(`(async () => (await import('/src/labs/richDoc.ts')).toHtml({ ...${JSON.stringify(src)}, fs: 16 }))()`);
    await p.ev(`(() => { planx.board.update('${id}', { text: 'X', rs: undefined }); const it = planx.board.get('${id}'); const e = planx.editor; e.cam = { x: 150 - (it.x + 100), y: 110 - (it.y + 60), z: 1 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(350);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
    await p.ev(`(() => { const dt = new DataTransfer(); dt.setData('text/html', ${JSON.stringify(html)}); dt.setData('text/plain', 'x'); document.querySelector('.rich-edit').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    await sleep(150);
    await p.key('Escape', 'Escape', 27);
    await sleep(250);
    const got = await p.ev(`(() => { const i = planx.board.get('${id}'); return { text: i.text, rs: i.rs }; })()`);
    const shift = (r) => ({ ...r, s: r.s + 2, e: r.e + 2 });
    expect(JSON.stringify([got.text, got.rs]), 'all it was, as it was').toBe(JSON.stringify(['X\n' + src.text, src.rs.map(shift)]));
  },

  async '"Документ": a hundred pages at most (not ten); its pager\'s number clicked, a page to go to'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.5 }; e.camChanged(); e.dropItem('page', { x: 400, y: 300 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const para = 'Это обычный абзац текста документа, достаточно длинный, чтобы переноситься на две или три строки при обычной ширине листа.';
    await p.ev(`(() => { planx.board.update('${id}', { text: Array.from({ length: 1600 }, (_, i) => (i % 20 === 0 ? 'Глава ' + i : ${JSON.stringify(para)})).join('\\n') }); planx.editor.setSelection([]); })()`);
    await sleep(500);
    expect(await p.ev(`(async () => (await import('/src/labs/docPage.ts')).pagesOf(planx.board.get('${id}')).length)()`) > 50, 'past ten pages, all of it').toBe(true);
    // its number clicked: a page asked for, 57, shown
    const num = await p.ev(`(() => { const it = planx.board.get('${id}'), s = planx.editor.toScreen({ x: it.x + it.w / 2, y: it.y + it.h + 22 }); return [s.x, s.y]; })()`);
    await p.click(num);
    await sleep(300);
    expect(await p.ev(`document.querySelector('.confirm-input')?.value ?? null`), 'its number clicked: a page asked for').toBe('1');
    await p.ev(`(() => { const i = document.querySelector('.confirm-input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '57'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(100);
    await p.key('Enter', 'Enter', 13);
    await sleep(300);
    expect(await p.ev(`(async () => (await import('/src/labs/docPage.ts')).pageShown(planx.board.get('${id}')))()`), 'that page shown').toBe(56);
  },

  async '"Документ": a selection dragged leftward past the text\'s edge, into the margin: picked to that line\'s start, not the lines over it'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const long = 'Длинный абзац текста, который переносится на несколько строк, чтобы проверить выделение по видимой строке, а не по абзацу целиком, и ещё немного слов сверху.';
    await p.ev(`(() => { const it = planx.board.get('${id}'); planx.board.update('${id}', { text: ${JSON.stringify(`Первая строка\n${long}`)} }); const e = planx.editor; e.cam = { x: 150 - (it.x + 100) * 0.6, y: 110 - (it.y + 60) * 0.6, z: 0.6 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    // From its last line's end, leftward, past the field's left edge on the same line.
    for (const dx of [30, 80]) {
      await p.ev(`getSelection().collapseToEnd()`);
      const pts = await p.ev(`(() => { const el = document.querySelector('.rich-edit'), r = document.createRange(); r.selectNodeContents(el.lastElementChild); const rects = [...r.getClientRects()].filter((b) => b.width > 4), b = rects[rects.length - 1], f = el.getBoundingClientRect();
        return [[b.right - 1, b.top + b.height / 2], [f.left - ${dx}, b.top + b.height / 2]]; })()`);
      // (Every selection there was as it was dragged, kept: none with the lines over it, even for a moment.)
      await p.ev(`(() => { window.__picks = []; window.__on = true; const f = () => { window.__picks.push(getSelection().toString()); if (window.__on) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
      await p.drag(pts[0], pts[1], { steps: 25 });
      await sleep(100);
      expect(await p.ev(`getSelection().toString().replace(/[.]$/, '')`), `that line alone picked (${dx} past the edge)`).toBe('немного слов сверху');
      expect(await p.ev(`(() => { window.__on = false; return window.__picks.filter((t) => t.includes('и ещё')).length; })()`), 'never the line over it as it was dragged (in any frame)').toBe(0);
    }
    await p.key('Escape', 'Escape', 27);
  },

  async '"Документ": typed in on a page, a selection dragged past its top: not scrolled past that page, picked from its first line'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 40, y: 20, z: 0.5 }; e.camChanged(); e.dropItem('page', { x: 420, y: 420 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'), b = planx.board;
      b.update('${id}', { text: Array.from({ length: 120 }, (_, i) => 'Строка ' + (i + 1)).join('\\n') });
      d.showPage('${id}', 2); planx.editor.startEditing('${id}'); })()`);
    await sleep(500);
    const st = () => p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'), it = planx.board.get('${id}'), first = d.docLines(it).find((l) => l.page === 2), el = document.querySelector('.rich-edit');
      return [Math.round(el.scrollTop), getSelection().toString().startsWith(it.text.slice(first.s, first.e))].join(); })()`);
    const before = (await st()).split(',')[0];
    const mid = await p.ev(`(() => { const el = document.querySelector('.rich-edit'), top = el.getBoundingClientRect().top, c = [...el.children].filter((x) => x.getBoundingClientRect().top > top + 60)[0], r = c.getBoundingClientRect(); return [r.x + 10, r.y + 4]; })()`);
    await p.mouse('mouseMoved', mid[0], mid[1]);
    await p.mouse('mousePressed', mid[0], mid[1]);
    for (let y = mid[1]; y > 20; y -= 30) { await p.mouse('mouseMoved', mid[0], y); await sleep(40); }
    for (let k = 0; k < 15; k++) { await p.mouse('mouseMoved', mid[0], 10); await sleep(60); }
    await p.mouse('mouseReleased', mid[0], 10);
    await sleep(200);
    expect(await st(), 'not scrolled, picked from its first line').toBe(`${before},true`);
  },

  async '"Документ": pasted with its styling (bold, italic, headings; fonts and sizes left out), lines as paragraphs of their own, a piece of a line into the line'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { planx.board.update('${id}', { text: 'Было' }); planx.editor.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    const paste = (html, text) => p.ev(`(() => { const dt = new DataTransfer(); dt.setData('text/html', ${JSON.stringify(html)}); dt.setData('text/plain', ${JSON.stringify(text)}); document.querySelector('.rich-edit').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    await paste('<meta charset="utf-8"><div data-h="0"><span style="font-weight:700; font-family: Onest; font-size: 16px;">Жирная строка</span></div><div data-h="0" style="font-weight: 400;">Обычная строка</div>', 'Жирная строка\nОбычная строка');
    await paste('<h2 style="font-family: Times">Заголовок с сайта</h2><p style="font-size: 30px; background: yellow">Абзац <em>курсивом</em></p>', '');
    await paste('<span style="font-weight:700">вставка в строку</span>', 'вставка в строку');
    await sleep(100);
    await p.ev(`document.querySelector('.rich-edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(200);
    expect(await p.ev(`planx.board.get('${id}').text`), 'its text').toBe('Было\nЖирная строка\nОбычная строка\nЗаголовок с сайта\nАбзац курсивомвставка в строку');
    expect(await p.ev(`planx.board.list().length`), 'nothing pasted on the board besides').toBe(1);
    expect(await p.ev(`JSON.stringify(planx.board.get('${id}').rs)`), 'its styles').toBe(JSON.stringify([{ s: 5, e: 18, b: true }, { s: 51, e: 52, h: 2 }, { s: 58, e: 66, i: true }, { s: 66, e: 82, b: true }]));
  },

  async '"Документ": a numbered list by the text panel\'s list, going on with Enter, ended by Enter in an empty item'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { const it = planx.board.get('${id}'); planx.board.update('${id}', { text: 'Шаги' }); const e = planx.editor; e.cam = { x: 150 - (it.x + 100), y: 110 - (it.y + 60), z: 1 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    const key = async (k, code, text) => { await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: k === 'Enter' ? 13 : 0, text }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };
    await key('Enter', 'Enter', '\r');
    await p.cdp('Input.insertText', { text: 'первый шаг' });
    await p.click(await p.at('.tfmt button[aria-label="Список"]'));
    await sleep(150);
    await p.click(await p.at('.tf-row button[aria-label="Нумерованный список"]'));
    await sleep(150);
    await key('Enter', 'Enter', '\r');
    await p.cdp('Input.insertText', { text: 'второй шаг' });
    await key('Enter', 'Enter', '\r');
    await key('Enter', 'Enter', '\r');
    await p.cdp('Input.insertText', { text: 'После списка.' });
    await key('Escape', 'Escape');
    await sleep(300);
    expect(await p.ev(`planx.board.get('${id}').text`), 'its text').toBe('Шаги\nпервый шаг\nвторой шаг\nПосле списка.');
    expect(await p.ev(`JSON.stringify(planx.board.get('${id}').rs)`), 'two items in the list').toBe(JSON.stringify([{ s: 15, e: 16, l: 'number' }, { s: 26, e: 27, l: 'number' }]));
  },

  async '"Markdown в документе": a quote, a checklist, a divider, a heading 4 and code typed as Markdown; the box clicked on the page ticked; the panel\'s menus'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { const it = planx.board.get('${id}'); planx.board.update('${id}', { text: 'Заметки' }); const e = planx.editor; e.cam = { x: 150 - (it.x + 100), y: 110 - (it.y + 60), z: 1 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    const key = async (k, code, vk, text) => { await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); await sleep(60); };
    const enter = () => key('Enter', 'Enter', 13, '\r'), space = () => key(' ', 'Space', 32, ' '), type = (text) => p.cdp('Input.insertText', { text });
    await enter();
    await type('>'); await space(); await type('Цитата');
    await enter(); await enter();
    await type('[]'); await space(); await type('купить хлеб');
    // («---» as the Mac joins its dashes: a divider at once.)
    await enter(); await type('–-');
    await type('####'); await space(); await type('Мелкий');
    await enter(); await type('вызов `run()'); await key('`', 'Backquote', 192, '`'); await type(' и дальше');
    await sleep(100);
    expect(await p.ev(`[...document.querySelector('.rich-edit').children].map((d) => [d.dataset.k ?? '', d.dataset.l ?? '', d.dataset.h].join(':')).join(' ')`), 'its paragraphs as typed in')
      .toBe('::0 quote::0 :todo:0 hr::0 ::4 ::0');
    // «Код» on what's picked, lit; again, plain text again.
    await p.ev(`(() => { const d = document.querySelector('.rich-edit'); d.focus(); const t = d.children[5].firstChild, r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 5); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); })()`);
    await sleep(150);
    await p.click(await p.at('.tfmt button[aria-label="Код"]'));
    await sleep(150);
    expect(await p.ev(`document.querySelector('.tfmt button[aria-label="Код"]').classList.contains('on')`), 'lit on code picked').toBe(true);
    await p.click(await p.at('.tfmt button[aria-label="Код"]'));
    await sleep(150);
    expect(await p.ev(`document.querySelector('.rich-edit').children[5].querySelectorAll('span').length`), 'pressed again: plain text again, the rest code as it was').toBe(1);
    // The panel: headings to six, a quote and a divider in «Стиль», a checklist in the lists, code lit.
    await p.click(await p.at('.tfmt button[aria-label^="Стиль"]'));
    await sleep(150);
    expect(await p.ev(`[...document.querySelectorAll('.tf-menu .tf-item')].map((b) => b.textContent).join()`), 'its style menu').toBe('Обычный,Заголовок 1,Заголовок 2,Заголовок 3,Заголовок 4,Заголовок 5,Заголовок 6,Цитата,Блок кода,Разделитель,Таблица');
    await p.click(await p.at('.tfmt button[aria-label^="Стиль"]'));
    await key('Escape', 'Escape', 27);
    await sleep(300);
    const it = await p.ev(`planx.board.get('${id}')`);
    expect(it.text, 'its text').toBe('Заметки\nЦитата\nкупить хлеб\n\nМелкий\nвызов run() и дальше');
    const at = (w) => it.text.indexOf(w), end = (w) => at(w) + w.length;
    expect(JSON.stringify(it.rs), 'kept: a quote, a checklist\'s item, a divider, a heading 4, code on run() alone').toBe(JSON.stringify([
      { s: end('Цитата'), e: end('Цитата') + 1, k: 'quote' }, { s: end('хлеб'), e: end('хлеб') + 1, l: 'todo' }, { s: end('хлеб') + 1, e: end('хлеб') + 2, k: 'hr' },
      { s: end('Мелкий'), e: end('Мелкий') + 1, h: 4 }, { s: at('run()'), e: end('run()'), m: true }]));
    // Its box clicked on the page: ticked.
    await p.ev(`planx.editor.setSelection([])`);
    const box = await p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'), it = planx.board.get('${id}'), l = d.docLines(it).find((x) => x.box), P = (await import('/src/model/types.ts')).PAGE;
      const s = planx.editor.toScreen({ x: it.x + P.LEFT + l.indent - d.LIST_IN + 4 + 6, y: it.y + P.TOP + l.y + l.size * d.DOC_LINE / 2 }); return [s.x, s.y]; })()`);
    await p.click(box);
    await sleep(150);
    expect(await p.ev(`(async () => (await import('/src/model/textLinks.ts')).paraAt(planx.board.get('${id}').text, planx.board.get('${id}').rs, ${at('купить')}, 'l'))()`), 'ticked by a click on its box').toBe('done');
    const md = await p.ev(`(async () => (await import('/src/labs/docExport.ts')).docMarkdown(planx.board.get('${id}')))()`);
    expect(md, 'as Markdown').toBe('Заметки\n\n> Цитата\n\n- [x] купить хлеб\n\n---\n\n#### Мелкий\n\nвызов `run()` и дальше\n');
  },

  async '"Файлы в документ": .md, .txt, .html and .rtf dropped on the board, each a document side by side, to be typed in'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.25 }; e.camChanged(); })()`);
    await p.ev(`(() => {
      const files = [
        new File(['# Заметка\\n\\n- [ ] купить\\n- **важно**\\n'], 'note.md', { type: 'text/markdown' }),
        new File(['Первая строка\\r\\nВторая строка\\r\\n'], 'plain.txt', { type: 'text/plain' }),
        new File(['<h2>Страница</h2><p>Текст <b>жирный</b></p>'], 'page.html', { type: 'text/html' }),
        new File([new Uint8Array([...String.raw\`{\\rtf1\\ansi\\ansicpg1251 {\\fonttbl\\f0 Helvetica;}\\pard \\'cf\\'f0\\'e8\\b \\'e2\\'e5\\'f2\\b0\\par}\`].map((c) => c.charCodeAt(0)))], 'doc.rtf', { type: 'application/rtf' }),
      ];
      const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f));
      document.querySelector('.board-canvas').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
    })()`);
    await sleep(600);
    const docs = await p.ev(`JSON.stringify(planx.board.list().filter((i) => i.type === 'page').sort((a, b) => a.x - b.x).map((i) => [i.text, i.rs ?? null]))`);
    expect(docs, 'each a document of what it says').toBe(JSON.stringify([
      ['Заметка\nкупить\nважно', [{ s: 7, e: 8, h: 1 }, { s: 14, e: 15, l: 'todo' }, { s: 15, e: 20, b: true }, { s: 20, e: 21, l: 'bullet' }]],
      ['Первая строка\nВторая строка', null],
      ['Страница\nТекст жирный', [{ s: 8, e: 9, h: 2 }, { s: 15, e: 21, b: true }]],
      ['Привет', [{ s: 3, e: 6, b: true }]]]));
    expect(await p.ev(`planx.editor.selection.size`), 'all four picked').toBe(4);
  },

  async '"Поля документа": the margins out by the panel\'s button, the left one dragged by its triangle a whole millimetre at a time, the text and its field narrower'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.6 }; e.camChanged(); e.dropItem('page', { x: 500, y: 420 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { planx.board.update('${id}', { text: 'Слово '.repeat(300) }); const it = planx.board.get('${id}'); const e = planx.editor; e.cam = { x: 150 - it.x * 0.6, y: 90 - it.y * 0.6, z: 0.6 }; e.camChanged(); e.setSelection(['${id}']); })()`);
    await sleep(400);
    const lines = () => p.ev(`(async () => (await import('/src/labs/docPage.ts')).docLines(planx.board.get('${id}')).length)()`);
    const before = await lines();
    await p.click(await p.at('button[aria-label="Поля"]'));
    await sleep(300);
    expect(await p.ev(`document.querySelector('button[aria-label="Поля"]').classList.contains('on')`), 'its button lit').toBe(true);
    const tri = await p.ev(`(() => { const it = planx.board.get('${id}'), s = planx.editor.toScreen({ x: it.x + 113, y: it.y }); return [s.x, s.y - 4]; })()`);
    await p.drag(tri, [tri[0] + 60, tri[1]], { steps: 10 });
    const pm = await p.ev(`planx.board.get('${id}').pm`), mm = 794 / 210;
    expect(pm.slice(0, 3).join(), 'the others as they were').toBe('76,57,76');
    expect(pm[3] > 113 + 80 && Math.abs(pm[3] / mm - Math.round(pm[3] / mm)) < 0.01, `the left one further in, in whole millimetres (${pm[3]})`).toBe(true);
    expect((await lines()) > before, 'the text narrower: more lines').toBe(true);
    await p.ev(`planx.editor.startEditing('${id}', null, 'end')`);
    await sleep(400);
    expect(await p.ev(`Math.round(parseFloat(document.querySelector('.rich-edit').style.width))`), 'its field as narrow').toBe(Math.round(794 - 57 - pm[3]));
    await p.key('Escape', 'Escape', 27);
  },

  async '"Таблица в документе": the text over it taken out, its empty line gone by Backspace: the table at the top'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.6 }; e.camChanged(); e.dropItem('page', { x: 400, y: 400 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const tid = await p.ev(`(async () => { const o = await import('/src/labs/docObjects.ts'), b = planx.board, e = planx.editor;
      const t = e.newItem('table', 0, 0, { cols: [200, 200, 200], rows: [40, 40, 40], cells: Array(9).fill(''), w: 600, h: 120, inDoc: '${id}' });
      e.addItem(t);
      const r = o.withObject({ text: 'Текст\\nПосле', rs: undefined, links: undefined }, t.id, 0);
      b.update('${id}', { text: r.text, rs: r.rs });
      e.startEditing('${id}', null, 'end');
      return t.id; })()`);
    await sleep(400);
    // «Текст» picked and taken out, then Backspace in its line, empty.
    await p.ev(`(() => { const d = document.querySelector('.rich-edit'); d.focus(); const t = d.children[0].firstChild, r = document.createRange(); r.setStart(t, 0); r.setEnd(t, t.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
    await p.key('Backspace', 'Backspace', 8);
    await sleep(100);
    expect(await p.ev(`[...document.querySelector('.rich-edit').children].map((c) => c.dataset.o ? 'T' : c.textContent || '_').join()`), 'an empty line over it').toBe('_,T,После');
    await p.key('Backspace', 'Backspace', 8);
    await sleep(100);
    expect(await p.ev(`[...document.querySelector('.rich-edit').children].map((c) => c.dataset.o ? 'T' : c.textContent || '_').join()`), 'that line gone: the table first').toBe('T,После');
    await p.cdp('Input.insertText', { text: '!' });
    await p.key('Escape', 'Escape', 27);
    await sleep(300);
    const doc = await p.ev(`planx.board.get('${id}')`);
    expect(JSON.stringify([doc.text, doc.rs.filter((r) => r.o).map((r) => r.s)]), 'kept so: its place first, typed on after it').toBe(JSON.stringify(['\n!После', [0]]));
    expect(await p.ev(`(async () => (await import('/src/labs/docObjects.ts')).slotOf(planx.board.get('${id}'), '${tid}').y - planx.board.get('${id}').y)()`), 'at the top of the text').toBe(76 + 8);
  },

  async '"Таблица в документе": its document in a frame, the frame dragged: the table along with it all the way'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.4 }; e.camChanged(); e.dropItem('page', { x: 500, y: 400 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const tid = await p.ev(`(async () => { const o = await import('/src/labs/docObjects.ts'), b = planx.board, e = planx.editor;
      const t = e.newItem('table', 0, 0, { cols: [200, 200, 200], rows: [40, 40, 40], cells: Array(9).fill(''), w: 600, h: 120, inDoc: '${id}' });
      e.addItem(t);
      const r = o.withObject({ text: 'Один\\nДва', rs: undefined, links: undefined }, t.id, 0);
      b.update('${id}', { text: r.text, rs: r.rs }); e.setSelection(['${id}']); e.frameSelection(); return t.id; })()`);
    await sleep(300);
    await p.key('Escape', 'Escape', 27);
    const fid = await p.ev(`planx.board.list().find((i) => i.type === 'frame')?.id`);
    await p.ev(`planx.editor.setSelection([])`);
    const f = await p.ev(`(() => { const f = planx.board.get('${fid}'), s = planx.editor.toScreen({ x: f.x + 12, y: f.y + 12 }); return [s.x, s.y]; })()`);
    const pos = () => p.ev(`JSON.stringify([planx.board.get('${fid}').x, planx.board.get('${id}').x, planx.board.get('${tid}').x])`);
    const was = JSON.parse(await pos());
    await p.mouse('mouseMoved', f[0], f[1]);
    await p.mouse('mousePressed', f[0], f[1]);
    for (let k = 1; k <= 10; k++) { await p.mouse('mouseMoved', f[0] + k * 8, f[1] + k * 3); await sleep(30); }
    const now = JSON.parse(await pos());
    expect(now[2] - was[2], 'the table along with its document as the frame is dragged').toBe(now[1] - was[1]);
    expect(now[1] - was[1] > 0, 'moved').toBe(true);
    await p.mouse('mouseReleased', f[0] + 80, f[1] + 30);
    await sleep(300);

  },

  async '"Таблица в документе": dragged onto a sheet, in its text (the text after it lower by its height), moved with it, dragged off out of it; one put in by «Стиль», gone with its place; as Markdown'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.5 }; e.camChanged(); })()`);
    await p.ev(`(() => { const e = planx.editor; e.dropItem('page', { x: 400, y: 400 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { planx.board.update('${id}', { text: 'Один\\nДва\\nТри' }); planx.editor.setSelection([]); planx.editor.dropItem('table', { x: 1000, y: 300 }); planx.editor.setSelection([]); })()`);
    await sleep(200);
    const T = async () => p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'), b = planx.board, doc = b.get('${id}'), t = b.list().find((i) => i.type === 'table');
      return { doc: { x: doc.x, y: doc.y, text: doc.text, rs: doc.rs }, t: t && { id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, inDoc: t.inDoc ?? null }, lines: d.docLines(doc).map((l) => [l.s, l.y, l.o ?? '']) }; })()`);
    const before = await T();
    // Its top a little under the first line's middle: in after it.
    const scr = (x, y) => p.ev(`(() => { const s = planx.editor.toScreen({ x: ${x}, y: ${y} }); return [s.x, s.y]; })()`);
    const from = await scr(before.t.x + 20, before.t.y + 5), to = await scr(before.doc.x + 80 + 20, before.doc.y + 80 + 5 + 22);
    await p.drag(from, to);
    await sleep(200);
    const ins = await T();
    expect(ins.t.inDoc, 'in the document').toBe(id);
    expect(ins.doc.text, 'a paragraph of its own after the first').toBe('Один\n\nДва\nТри');
    expect(JSON.stringify(ins.doc.rs), 'that paragraph its place').toBe(JSON.stringify([{ s: 5, e: 6, o: ins.t.id }]));
    expect(ins.t.w <= 794 - 80 - 60 + 1, 'as wide as the text at most').toBe(true);
    const slot = ins.lines.find((l) => l[2]), two = ins.lines.find((l) => l[0] === 6);
    const P = await p.ev(`(async () => (await import('/src/model/types.ts')).PAGE)()`);
    expect(JSON.stringify([ins.t.x - ins.doc.x, Math.round(ins.t.y - ins.doc.y - slot[1])]), 'standing in its place').toBe(JSON.stringify([P.LEFT, P.TOP + 8]));
    expect(Math.round(two[1] - slot[1]), 'the text after it lower by its height').toBe(Math.round(ins.t.h + 16));
    // The sheet moved: the table with it.
    await p.ev(`planx.board.update('${id}', { x: ${ins.doc.x + 100} })`);
    await sleep(100);
    expect((await T()).t.x - ins.t.x, 'moved with it').toBe(100);
    // Dragged off: out of its text, its own again.
    const now = await T();
    await p.drag(await scr(now.t.x + 20, now.t.y + 5), await scr(now.doc.x + 1100, now.doc.y + 200));
    await sleep(200);
    const off = await T();
    expect(JSON.stringify([off.t.inDoc, off.doc.text, off.doc.rs ?? null]), 'out of it').toBe(JSON.stringify([null, 'Один\nДва\nТри', null]));
    // «Стиль» → «Таблица» as it's typed in: a new one in its text; its place taken out, the table gone.
    await p.ev(`(() => { const b = planx.board; b.remove([b.list().find((i) => i.type === 'table').id]); const it = b.get('${id}'); const e = planx.editor; e.cam = { x: 150 - (it.x + 100), y: 110 - (it.y + 60), z: 1 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    await p.click(await p.at('.tfmt button[aria-label^="Стиль"]'));
    await sleep(150);
    await p.ev(`[...document.querySelectorAll('.tf-menu .tf-item')].find((b) => b.textContent === 'Таблица').click()`);
    await sleep(200);
    expect(await p.ev(`!!document.querySelector('.rich-edit .rich-obj')`), 'its picture in the field').toBe(true);
    await p.cdp('Input.insertText', { text: 'Под таблицей' });
    await p.key('Escape', 'Escape', 27);
    await sleep(300);
    const made = await T();
    expect(JSON.stringify([made.t?.inDoc, made.doc.text]), 'in its text, after the last paragraph, typed on under it').toBe(JSON.stringify([id, 'Один\nДва\nТри\n\nПод таблицей']));
    await p.ev(`(() => { const b = planx.board, t = b.list().find((i) => i.type === 'table'); b.update(t.id, { cells: ['Имя', 'Роль', 'Срок', 'Аня', 'Дизайн', 'май', '', '', ''] }); })()`);
    const md = await p.ev(`(async () => (await import('/src/labs/docExport.ts')).docMarkdown(planx.board.get('${id}')))()`);
    expect(md, 'as Markdown').toBe('Один\n\nДва\n\nТри\n\n| Имя | Роль | Срок |\n| --- | --- | --- |\n| Аня | Дизайн | май |\n|  |  |  |\n\nПод таблицей\n');
    await p.ev(`planx.editor.startEditing('${id}', null, 'end')`);
    await sleep(400);
    await p.ev(`document.querySelector('.rich-edit .rich-obj').remove()`);
    await p.key('Escape', 'Escape', 27);
    await sleep(300);
    expect(await p.ev(`planx.board.list().some((i) => i.type === 'table')`), 'its place taken out: gone').toBe(false);
  },

  async '"Таблица в документе": no wider than its text, no taller than a page; typed over with its page picked, kept'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.5 }; e.camChanged(); e.dropItem('page', { x: 400, y: 400 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const tid = await p.ev(`(async () => { const o = await import('/src/labs/docObjects.ts'), b = planx.board, e = planx.editor;
      const t = e.newItem('table', 0, 0, { cols: [200, 200, 200], rows: [40, 40, 40], cells: Array(9).fill(''), w: 600, h: 120, inDoc: '${id}' });
      e.addItem(t);
      const r = o.withObject({ text: 'Начало\\nКонец', rs: undefined, links: undefined }, t.id, 0);
      b.update('${id}', { text: r.text, rs: r.rs });
      e.setSelection([t.id]);
      return t.id; })()`);
    await sleep(200);
    const max = await p.ev(`(async () => (await import('/src/labs/docObjects.ts')).DOC_OBJ_MAX)()`);
    const size = () => p.ev(`(() => { const t = planx.board.get('${tid}'); return { w: t.w, h: t.h, n: t.cols.length, m: t.rows.length }; })()`);
    for (let i = 0; i < 3; i++) await p.ev(`planx.editor.changeTable('col', 1)`);
    const wide = await size();
    expect(wide.n, 'columns added').toBe(6);
    expect(wide.w <= max.w + 0.5, `no wider than its text (${wide.w} ≤ ${max.w})`).toBe(true);
    for (let i = 0; i < 40; i++) await p.ev(`planx.editor.changeTable('row', 1)`);
    const tall = await size(), room = await p.ev(`(async () => (await import('/src/labs/docObjects.ts')).roomFor(planx.board.get('${tid}')).h)()`);
    // (Under the line over it: as far as the page's bottom, not on to the next page.)
    expect(room < max.h && tall.h <= room + 0.5 && tall.h + 40 > room, `rows added as long as it stays on its page (${tall.h} ≤ ${room})`).toBe(true);
    expect(await p.ev(`(async () => (await import('/src/labs/docObjects.ts')).slotOf(planx.board.get('${id}'), '${tid}').page)()`), 'on its page still').toBe(0);
    // Its page picked (as a double click opens it) and typed over: the text new, the table still there.
    await p.ev(`(() => { planx.board.update('${tid}', { rows: [40, 40, 40], h: 120, cells: Array(18).fill('') }); planx.editor.startEditing('${id}', null, 'all'); })()`);
    await sleep(400);
    await p.cdp('Input.insertText', { text: 'Новый' });
    await p.key('Escape', 'Escape', 27);
    await sleep(300);
    expect(JSON.stringify([await p.ev(`!!planx.board.get('${tid}')`), await p.ev(`planx.board.get('${id}').text`), await p.ev(`planx.board.get('${tid}').inDoc`)]), 'typed over: the table kept, after what\'s typed')
      .toBe(JSON.stringify([true, 'Новый\n', id]));
    // Its page picked again (a double click), Backspace: the text gone, the table kept.
    await p.ev(`planx.editor.startEditing('${id}', null, 'all')`);
    await sleep(400);
    await p.key('Backspace', 'Backspace', 8);
    await p.key('Escape', 'Escape', 27);
    await sleep(300);
    expect(JSON.stringify([await p.ev(`!!planx.board.get('${tid}')`), await p.ev(`planx.board.get('${id}').rs.filter((r) => r.o).length`)]), 'taken out: the table kept, in its text').toBe(JSON.stringify([true, 1]));
  },

  async '"Таблица в документе": typed on under one last in the text (its place not copied by Enter), places copied before cleaned up; made a page tall, its page shown'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.5 }; e.camChanged(); e.dropItem('page', { x: 400, y: 400 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    // (Its place three times over, as Enter by its picture made it before.)
    const tid = await p.ev(`(async () => { const b = planx.board, e = planx.editor;
      const t = e.newItem('table', 0, 0, { cols: [200, 200, 200], rows: [40, 40, 40], cells: Array(9).fill(''), w: 600, h: 120, inDoc: '${id}' });
      e.addItem(t);
      b.update('${id}', { text: 'Начало\\n\\n\\n', rs: [{ s: 7, e: 9, o: t.id }, { s: 10, e: 11, o: t.id }] });
      e.setSelection([]);
      return t.id; })()`);
    await sleep(200);
    const lines = () => p.ev(`(async () => (await import('/src/labs/docPage.ts')).docLines(planx.board.get('${id}')).filter((l) => l.o).length)()`);
    expect(await lines(), 'its place copied: room for it once').toBe(1);
    // Double-clicked under its text: typed on at the end, on a line under the table.
    const at = await p.ev(`(() => { const t = planx.board.get('${tid}'), s = planx.editor.toScreen({ x: t.x + 100, y: t.y + t.h + 120 }); return [s.x, s.y]; })()`);
    for (const c of [1, 2]) {
      await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'left', clickCount: c });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'left', clickCount: c });
      await sleep(40);
    }
    await sleep(500);
    await p.cdp('Input.insertText', { text: 'Под' });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
    await p.cdp('Input.insertText', { text: 'ещё' });
    await sleep(100);
    expect(await p.ev(`document.querySelectorAll('.rich-edit [data-o]').length`), 'one picture, its place not copied').toBe(1);
    await p.key('Escape', 'Escape', 27);
    await sleep(300);
    const doc = await p.ev(`planx.board.get('${id}')`);
    expect(JSON.stringify([doc.text.split('\n').filter(Boolean), doc.rs.filter((r) => r.o).length]), 'typed under it; its place once').toBe(JSON.stringify([['Начало', 'Под', 'ещё'], 1]));
    // Made as tall as a page: on to the next, that page shown.
    await p.ev(`(async () => { const o = await import('/src/labs/docObjects.ts'); planx.board.update('${tid}', { rows: [o.DOC_OBJ_MAX.h - 80, 40, 40], h: o.DOC_OBJ_MAX.h }); })()`);
    await sleep(300);
    expect(await p.ev(`(async () => { const d = await import('/src/labs/docPage.ts'); return [d.pageShown(planx.board.get('${id}')), planx.editor.shown().some((i) => i.id === '${tid}')].join(); })()`), 'its page shown, it in sight').toBe('1,true');
  },

  async '"Markdown в документе": plain text in Markdown pasted: its headings, lists, checklists, code and bold as what they mark; Cmd+Shift+V, as it is'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    const md = '## Итоги\n\n- **сделали** прототип\n- [ ] проверить `api`\n\n> важно';
    const paste = () => p.ev(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(md)}); document.querySelector('.rich-edit').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    await p.ev(`(() => { planx.board.update('${id}', { text: 'Начало', rs: undefined }); const it = planx.board.get('${id}'); const e = planx.editor; e.cam = { x: 150 - (it.x + 100), y: 110 - (it.y + 60), z: 1 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(350);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
    await paste();
    await sleep(150);
    await p.key('Escape', 'Escape', 27);
    await sleep(250);
    const it = await p.ev(`planx.board.get('${id}')`);
    expect(it.text, 'its text, the marks taken out').toBe('Начало\nИтоги\nсделали прототип\nпроверить api\nважно');
    expect(JSON.stringify(it.rs), 'what they marked').toBe(JSON.stringify([{ s: 12, e: 13, h: 2 }, { s: 13, e: 20, b: true }, { s: 29, e: 30, l: 'bullet' }, { s: 40, e: 43, m: true }, { s: 43, e: 44, l: 'todo' }, { s: 49, e: 50, k: 'quote' }]));
  },

  async '"Markdown в документе": Backspace at the start of an item of a list in a list: one shallower, then out of the list'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { planx.board.update('${id}', { text: 'один\\nдва', rs: [{ s: 4, e: 5, l: 'bullet' }, { s: 8, e: 9, l: 'bullet', d: 2 }] }); const it = planx.board.get('${id}'); const e = planx.editor; e.cam = { x: 150 - (it.x + 100), y: 110 - (it.y + 60), z: 1 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(350);
    await p.ev(`(() => { const d = document.querySelector('.rich-edit'), r = document.createRange(); r.setStart(d.children[1].firstChild, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
    const st = () => p.ev(`(() => { const c = document.querySelector('.rich-edit').children[1]; return (c.dataset.l ?? '-') + ':' + (c.dataset.d ?? 0); })()`);
    const seen = [];
    for (let k = 0; k < 3; k++) { await p.key('Backspace', 'Backspace', 8); seen.push(await st()); }
    expect(seen.join(' '), 'two deep, one deep, then out').toBe('bullet:1 bullet:0 -:0');
    await p.key('Escape', 'Escape', 27);
  },

  async '"Markdown в документе": a list in a list by Tab (numbered at its depth), out by Shift+Tab and Enter; a block of code by «```», Tab two spaces in it, out by Enter'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('page', { x: 600, y: 600 }); })()`);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'page').id`);
    await p.ev(`(() => { const it = planx.board.get('${id}'); planx.board.update('${id}', { text: 'План' }); const e = planx.editor; e.cam = { x: 150 - (it.x + 100), y: 110 - (it.y + 60), z: 1 }; e.camChanged(); e.startEditing('${id}', null, 'end'); })()`);
    await sleep(400);
    const key = async (k, code, vk, text, modifiers = 0) => { await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text, modifiers }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers }); await sleep(60); };
    const enter = () => key('Enter', 'Enter', 13, '\r'), space = () => key(' ', 'Space', 32, ' '), type = (text) => p.cdp('Input.insertText', { text });
    const tab = (shift) => key('Tab', 'Tab', 9, undefined, shift ? 8 : 0);
    await enter(); await type('1.'); await space(); await type('Первый');
    await enter(); await tab(); await type('под ним');
    await enter(); await type('ещё');
    await enter(); await tab(true); await type('Второй');
    await enter(); await tab(); await type('снова');
    // (Enter in an empty item of a list in a list: one shallower; again, out of the list.)
    await enter(); await enter(); await enter();
    await type('```'); await type('if (a) {'); await enter(); await tab(); await type('go();'); await enter(); await enter();
    await type('После.');
    await sleep(100);
    expect(await p.ev(`[...document.querySelector('.rich-edit').children].map((d) => [d.dataset.k ?? '', d.dataset.l ?? '', d.dataset.d ?? '', d.dataset.m ?? ''].join(':')).join(' ')`), 'its paragraphs as typed in')
      .toBe('::: :number::1. :number:1:1. :number:1:2. :number::2. :number:1:1. code::: code::: :::');
    await key('Escape', 'Escape', 27);
    await sleep(300);
    expect(await p.ev(`planx.board.get('${id}').text`), 'its text').toBe('План\nПервый\nпод ним\nещё\nВторой\nснова\nif (a) {\n  go();\nПосле.');
    const md = await p.ev(`(async () => (await import('/src/labs/docExport.ts')).docMarkdown(planx.board.get('${id}')))()`);
    expect(md, 'as Markdown').toBe('План\n\n1. Первый\n    1. под ним\n    2. ещё\n2. Второй\n    1. снова\n\n```\nif (a) {\n  go();\n```\n\nПосле.\n');
  },

  async '"Голосование в объектах": set up in its fields, started, an answer clicked voted for (the shares shown), clicked again unvoted'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.addPoll({ x: 600, y: 360 }); })()`);
    await sleep(300);
    const poll = () => p.ev(`(() => { const f = planx.board.list().find((i) => i.poll); return { ...f, votes: Object.keys(f).filter((k) => k.startsWith('pv:')).map((k) => f[k]) }; })()`);
    expect(await p.ev(`document.querySelectorAll('.form-field').length`), 'the question and two answers').toBe(3);
    const type = async (i, text) => { const r = await p.ev(`(() => { const b = document.querySelectorAll('.form-field')[${i}].getBoundingClientRect(); return [b.left + 20, b.top + 10]; })()`); await p.click(r); await p.ev(`document.execCommand('insertText', false, ${JSON.stringify(text)})`); };
    await type(0, 'Тренировка в 10:00 с тренером?');
    await type(1, 'буду');
    await type(2, 'не смогу');
    let it = await poll();
    expect(it.pq, 'the question').toBe('Тренировка в 10:00 с тренером?');
    expect(JSON.stringify(it.po), 'the answers').toBe(JSON.stringify(['буду', 'не смогу']));
    // «Запустить»: the last 40 above its bottom room.
    await p.click([it.x + it.w / 2, it.y + it.h - 20 - 20]);
    await sleep(150);
    it = await poll();
    expect(it.pd, 'started').toBe(undefined);
    expect(await p.ev(`document.querySelectorAll('.form-field').length`), 'no fields once started').toBe(0);
    // The first answer's row: under the question's line.
    const row = (i) => [it.x + it.w / 2, it.y + 20 + 24 + 16 + i * 54 + 22];
    await p.click(row(0));
    await sleep(100);
    expect(JSON.stringify((await poll()).votes), 'voted').toBe(JSON.stringify([[0]]));
    await p.click(row(1));
    await sleep(100);
    expect(JSON.stringify((await poll()).votes), 'both').toBe(JSON.stringify([[0, 1]]));
    await p.click(row(0));
    await p.click(row(1));
    await sleep(100);
    expect(JSON.stringify((await poll()).votes), 'unvoted').toBe(JSON.stringify([]));
  },

  async '"Перестроение панели": off at first; on, picking something else, near or far, the same panel over it is by it at once (its buttons kept, a copy of it quickly fading out where it was)'(p) {
    expect(await p.ev(`(async () => (await import('/src/labs/labs.ts')).labOn('panelGlide'))()`), 'off at first').toBe(false);
    await p.ev(`(async () => { const l = await import('/src/labs/labs.ts'); l.setLab('panelOver', true); l.setLab('panelGlide', true); })()`);
    // a and b 60 apart; c 260 under a.
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 300, 300, { id: 'a', w: 240, h: 140 })); b.add(e.newItem('rect', 600, 300, { id: 'b', w: 240, h: 140 }));
      b.add(e.newItem('rect', 300, 700, { id: 'c', w: 240, h: 100 })); })()`);
    const ghosts = () => p.ev(`document.querySelectorAll('.panel-over.gone').length`);
    const mid = async () => { const r = await p.rect('.panel-over:not(.gone)'); return Math.round((r.l + r.r) / 2); };
    await p.click([420, 370]);
    await sleep(500);
    expect(await mid(), 'over a').toBe(420);
    // (Marked, to tell it's the same one after; its first button too.)
    await p.ev(`(() => { const o = document.querySelector('.panel-over:not(.gone)'); o.dataset.was = '1'; o.querySelectorAll(':scope > button').forEach((b) => { b.dataset.was = '1'; }); })()`);
    await p.mouse('mousePressed', 720, 370);
    await p.mouse('mouseReleased', 720, 370);
    await sleep(30);
    // A copy of it where it was fading out quickly, it by the new one at once, not gliding.
    expect(await ghosts(), 'a copy fading out where it was').toBe(1);
    expect(await mid(), 'over b').toBe(720);
    await sleep(150);
    expect(await ghosts(), 'gone quickly').toBe(0);
    const kept = `(() => { const o = document.querySelector('.panel-over[data-was]'), all = o ? o.querySelectorAll(':scope > button') : []; return all.length > 0 && [...all].every((b) => b.dataset.was); })()`;
    expect(await p.ev(kept), 'the same panel, its buttons kept').toBe(true);
    // Far, the same.
    await p.mouse('mousePressed', 420, 750);
    await sleep(30);
    expect(await ghosts(), 'far: none yet as it\'s pressed').toBe(0);
    await p.mouse('mouseReleased', 420, 750);
    await sleep(30);
    expect((await p.rect('.panel-over:not(.gone)')).b < 700, 'far: over c').toBe(true);
    expect(await p.ev(kept), 'far: the same panel').toBe(true);
    await p.ev(`(async () => { const l = await import('/src/labs/labs.ts'); l.setLab('panelOver', false); l.setLab('panelGlide', false); })()`);
  },

  async '"Панель над элементом": a cell picked, typed in: the panel over the table turning into the text panel from where it stands, not from one left at the bottom'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await sleep(200);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('table', { x: 640, y: 450 }); e.setSelection([]); })()`);
    await sleep(300);
    const cell = (i) => p.ev(`(async () => { const m = await import('/src/model/table.ts'), e = planx.editor, t = planx.board.list().find((i) => i.type === 'table'), r = m.cellRect(t, ${i}), s = e.toScreen({ x: r.x + 20, y: r.y + r.h / 2 }); return [s.x, s.y]; })()`);
    await p.click(await cell(5)); await sleep(300);
    await p.click(await cell(6)); await sleep(400);
    // (A selection panel at the bottom too, first in the page, as there may be one.)
    await p.ev(`(() => { const d = document.createElement('div'); d.className = 'bar panel'; Object.assign(d.style, { position: 'fixed', left: '40px', top: '700px', width: '300px', height: '44px' }); document.body.prepend(d); })()`);
    await p.ev(`(() => { window.__fr = []; window.__on = true; const f = () => { const s = document.querySelector('.panel-shell'); if (s) window.__fr.push(Math.round(s.getBoundingClientRect().top)); if (window.__on) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
    const top = await p.ev(`Math.round(document.querySelector('.bar.panel.panel-over').getBoundingClientRect().top)`);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, text: 'a' });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await sleep(600);
    const fr = await p.ev(`(() => { window.__on = false; return window.__fr; })()`);
    expect(fr.length > 0, 'turned into the text panel').toBe(true);
    expect(Math.max(...fr) <= Math.max(top, fr[fr.length - 1]) + 2, `from the panel over the table (its top ${top}), never lower`).toBe(true);
  },

  async '"Панель над элементом": the selection panel over what\'s picked, not at the bottom; under it near the top, what opens from it opening down; staying by it while it\'s moved or the board is; at the bottom for what\'s picked big or partly off the screen'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); b.add(e.newItem('rect', 480, 300, { id: 'a', w: 240, h: 140 })); e.setSelection(['a']); })()`);
    await sleep(400);
    const over = await p.rect('.panel-over'), under = await p.rect('.bar.panel:not(.panel-over)');
    expect(over.b < 300, 'over the item').toBe(true);
    expect(Math.round((over.l + over.r) / 2), 'in the middle of it').toBe(600);
    expect(!!under, 'not at the bottom too').toBe(false);
    // It works the same: a button there does what it does below.
    await p.click(await p.at('.panel-over button[aria-label^="Дублировать"]'));
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'rect').length`), 'duplicated').toBe(2);
    await p.ev(`(() => { const e = planx.editor, b = planx.board; b.remove(b.list().filter((i) => i.id !== 'a').map((i) => i.id)); e.setSelection(['a']); e.cam = { x: 0, y: -290, z: 1 }; e.camChanged(); })()`);
    await sleep(300);
    const near = await p.rect('.panel-over');
    expect(near.t > 150, 'near the top: under the item').toBe(true);
    expect(await p.ev(`document.querySelector('.panel-over').classList.contains('opens-down')`), 'opening down').toBe(true);
    await p.click(await p.at('.panel-over button[aria-label="Цвет"]'));
    await sleep(200);
    expect((await p.rect('.panel-over .op-pop')).t > near.b, 'its palette below it').toBe(true);
    await p.click(await p.at('.panel-over button[aria-label="Цвет"]'));
    await sleep(100);
    // Dragged, it's away; let go, it's by it again.
    await p.mouse('mouseMoved', 600, 80);
    await p.mouse('mousePressed', 600, 80);
    await p.mouse('mouseMoved', 640, 90);
    await p.mouse('mouseMoved', 660, 95);
    await sleep(100);
    expect(!!(await p.rect('.panel-over:not(.gone)')), 'while it moves: away').toBe(false);
    await p.mouse('mouseReleased', 660, 95);
    await sleep(200);
    expect(!!(await p.rect('.panel-over:not(.gone)')), 'let go: there again').toBe(true);
    // The board moved: it stays, by the item.
    const was = await p.rect('.panel-over:not(.gone)');
    await p.ev(`(() => { const e = planx.editor; e.cam = { ...e.cam, x: e.cam.x + 20 }; e.camChanged(); })()`);
    await sleep(60);
    expect(Math.round((await p.rect('.panel-over:not(.gone)')).l - was.l), 'the board moving: along with it').toBe(20);
    // Big: over it all the same, with room there.
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.update('a', { x: 100, y: 200, w: 900, h: 500 }); e.setSelection([]); })()`);
    await sleep(50);
    await p.ev(`planx.editor.setSelection(['a'])`);
    await sleep(400);
    expect([!!(await p.rect('.panel-over:not(.gone)')), !!(await p.rect('.bar.panel:not(.panel-over, .gone)'))].join(), 'big: over it').toBe('true,false');
    expect((await p.rect('.panel-over:not(.gone)')).b < 200, 'above its top').toBe(true);
    // Its top off the screen: under it, not at the bottom of the screen.
    await p.ev(`(() => { const e = planx.editor; planx.board.update('a', { x: 300, y: -100, w: 240, h: 300 }); e.setSelection([]); })()`);
    await sleep(50);
    await p.ev(`planx.editor.setSelection(['a'])`);
    await sleep(300);
    const below = await p.rect('.panel-over:not(.gone)');
    expect(!!below && below.t > 200 && below.t < 260, 'under it').toBe(true);
    // With the handles of «Авторасположение» up: still over them.
    await p.ev(`(async () => { const e = planx.editor, b = planx.board; b.update('a', { x: 400, y: 300 }); b.add(e.newItem('rect', 700, 300, { id: 'c', w: 100, h: 100 })); e.setSelection(['a', 'c']); })()`);
    await sleep(300);
    expect(!!(await p.rect('.panel-over:not(.gone)')), 'two picked: over them').toBe(true);
    await p.ev(`(async () => { (await import('/src/labs/tidy.ts')).startTidy(planx.editor); })()`);
    await sleep(300);
    expect([!!(await p.rect('.panel-over:not(.gone)')), !!(await p.rect('.bar.panel:not(.panel-over, .gone)'))].join(), 'laid out: still over them').toBe('true,false');
    // Switched off, only the one at the bottom.
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
    await sleep(150);
    expect(await p.ev(`document.querySelectorAll('.bar.panel').length`), 'switched off').toBe(1);
  },

  async '"Кнопка T": the selection panel turns into the text panel, a press on the board turns it back'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('sticky', 500, 300, { id: 's', text: 'Привет' })); e.setSelection(['s']); })()`);
    await sleep(400);
    // (What goes on in between, as it happens.)
    await p.ev(`(() => { window.seen = []; new MutationObserver((rs) => { for (const r of rs) for (const n of r.addedNodes) if (n.classList?.contains('panel-shell')) window.seen.push(n.style.width); }).observe(document.body, { childList: true }); })()`);
    const from = await p.rect('.panel-over');
    await p.click(await p.at('.panel-over button[aria-label="Текст и шрифт"]'));
    await sleep(50);
    expect(await p.ev(`window.seen.join()`), 'a body going from one to the other, from the panel\'s width').toBe(`${from.w}px`);
    await sleep(700);
    expect([!!(await p.rect('.tfmt:not(.leaving)')), !!(await p.rect('.panel-over:not(.gone)'))].join(), 'the text panel instead').toBe('true,false');
    const to = await p.rect('.tfmt:not(.leaving)');
    expect(`${to.t} ${to.b}`, 'standing where the panel stood, as high').toBe(`${from.t} ${from.b}`);
    expect(!!(await p.rect('.panel-shell')), 'the body gone once there').toBe(false);
    await p.click(await p.at('.tfmt button[aria-label="Жирный"]'));
    expect(await p.ev(`planx.board.get('s').fw`), 'its text bold').toBe(700);
    // Its arrow takes it back: what was on the text panel doesn't show again as it goes.
    await p.ev(`(() => { window.shown = 0; const t0 = performance.now(); const f = () => { if (document.querySelector('.panel-shell') && [...document.querySelectorAll('.tfmt')].some((e) => +getComputedStyle(e).opacity > 0.05)) window.shown++; if (performance.now() - t0 < 600) requestAnimationFrame(f); }; setTimeout(() => requestAnimationFrame(f), 170); })()`);
    await p.click(await p.at('.tfmt button[aria-label="Назад"]'));
    await sleep(700);
    expect([!!(await p.rect('.tfmt:not(.leaving)')), !!(await p.rect('.panel-over:not(.gone)'))].join(), 'back by its arrow').toBe('false,true');
    expect(await p.ev(`window.shown`), 'the text panel unseen while the body narrows').toBe(0);
    await p.click(await p.at('.panel-over button[aria-label="Текст и шрифт"]'));
    await sleep(700);
    // (Off its text, near its corner: on its text, a second click types in it.)
    const s = await p.ev(`planx.editor.toScreen({ x: 510, y: 310 })`);
    await p.click([s.x, s.y]);
    await sleep(700);
    expect([!!(await p.rect('.tfmt:not(.leaving)')), !!(await p.rect('.panel-over:not(.gone)'))].join(), 'back to the selection panel').toBe('false,true');
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '"Узел на линии": a shape dragged onto a picked line\'s middle becomes a part of it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 200, 300, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('sticky', 800, 300, { id: 'c', w: 100, h: 100 }));
      b.add(e.newItem('rect', 450, 600, { id: 'r', w: 100, h: 60, text: 'Узел' }));
      b.addLink({ id: 'l', from: 'a', to: 'c', style: 'straight', color: 'red', heads: 'both' }); e.setSelection(['l']); })()`);
    await sleep(300);
    const m = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), l = planx.board.getLink('l'); const s = g.linkShape(l, (id) => planx.board.get(id)); const q = g.linkHandles(l, s).middles[0].p; return planx.editor.toScreen(q); })()`);
    // The shape's middle at (500, 630): taken from there to the line's middle circle.
    await p.drag([500, 630], [m.x, m.y], { steps: 16 });
    await sleep(200);
    const out = await p.ev(`(() => { const b = planx.board, r = b.get('r'), ls = b.linkList();
      return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, joint: !!r.joint, old: !!b.getLink('l'), ls: ls.map((l) => l.from + '>' + l.to + ':' + (l.heads ?? 'end') + ':' + l.color).sort().join(' ') }; })()`);
    expect(`${out.cx},${out.cy}`, 'in the middle of the line').toBe(`${(await p.ev(`planx.editor.toWorld(${m.x}, ${m.y}).x`))},${(await p.ev(`planx.editor.toWorld(${m.x}, ${m.y}).y`))}`);
    expect(`${out.joint} ${out.old} ${out.ls}`, 'the line made two through it, as it looked').toBe('true false a>r:start:red r>c:end:red');
    // Moved, the line goes along.
    await p.ev(`planx.board.update('r', { y: 100 })`);
    const ends = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), l = planx.board.linkList().find((l) => l.to === 'r'); return g.linkShape(l, (id) => planx.board.get(id)).pts.at(-1); })()`);
    expect(ends.y < 200, 'the line to it follows it').toBe(true);
    // Taken away, the line is one again, as it was.
    await p.ev(`(() => { planx.editor.setSelection(['r']); planx.editor.deleteSelection(); })()`);
    expect(await p.ev(`planx.board.linkList().map((l) => l.from + '>' + l.to + ':' + (l.heads ?? 'end') + ':' + l.color + ':' + l.style).join()`), 'one again').toBe('a>c:both:red:straight');
  },

  async '"Узел на линии": a task dragged by its header onto a picked line\'s middle goes into it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 100, 300, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('sticky', 1000, 300, { id: 'c', w: 100, h: 100 }));
      b.add(e.newItem('task', 350, 600, { id: 'r', w: 293, h: 52, text: 'Узел' }));
      b.addLink({ id: 'l', from: 'a', to: 'c', style: 'straight' }); e.setSelection(['l']); })()`);
    await sleep(300);
    const m = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), l = planx.board.getLink('l'); const s = g.linkShape(l, (id) => planx.board.get(id)); const q = g.linkHandles(l, s).middles[0].p; return planx.editor.toScreen(q); })()`);
    await p.drag([350 + 220, 626], [m.x, m.y], { steps: 16 });
    await sleep(200);
    const out = await p.ev(`(() => { const b = planx.board, r = b.get('r'); return [!!r.joint, b.linkList().map((l) => l.from + '>' + l.to).sort().join(' ')].join(); })()`);
    expect(out, 'in the line').toBe('true,a>r r>c');
  },
  async '"Узел на линии": dragged with Cmd, what\'s in a line comes out of it, the line one again'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 200, 300, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('sticky', 800, 300, { id: 'c', w: 100, h: 100 }));
      b.add(e.newItem('rect', 500, 320, { id: 'r', w: 100, h: 60, text: 'Узел', joint: true }));
      b.addLink({ id: 'l1', from: 'a', to: 'r', style: 'straight', color: 'red', heads: 'start' }); b.addLink({ id: 'l2', from: 'r', to: 'c', style: 'straight', color: 'red' }); e.setSelection([]); })()`);
    await sleep(200);
    // Without Cmd: it moves, the line with it.
    await p.drag([550, 350], [550, 300]);
    expect(await p.ev(`planx.board.linkList().length + ' ' + !!planx.board.get('r').joint`), 'still in it').toBe('2 true');
    // With it: out, the line one again as it was; where it's let go.
    await p.drag([550, 300], [550, 550], { modifiers: 4 });
    const out = await p.ev(`(() => { const b = planx.board, r = b.get('r'); return [!!r.joint, r.y, b.linkList().map((l) => l.from + '>' + l.to + ':' + (l.heads ?? 'end') + ':' + l.color).join()].join(' '); })()`);
    expect(out, 'out, one line again').toBe('false 520 a>c:both:red');
    // Cmd pressed on the way: out then.
    await p.ev(`(() => { const b = planx.board; b.remove(b.linkList().map((l) => l.id)); b.update('r', { x: 500, y: 320, joint: true });
      b.addLink({ id: 'l1', from: 'a', to: 'r', style: 'straight' }); b.addLink({ id: 'l2', from: 'r', to: 'c', style: 'straight' }); planx.editor.setSelection([]); })()`);
    await sleep(100);
    await p.mouse('mouseMoved', 550, 350);
    await p.mouse('mousePressed', 550, 350);
    for (let y = 360; y <= 420; y += 10) { await p.mouse('mouseMoved', 550, y); await sleep(25); }
    for (let y = 430; y <= 500; y += 10) { await p.mouse('mouseMoved', 550, y, 4); await sleep(25); }
    await p.mouse('mouseReleased', 550, 500);
    await sleep(200);
    expect(await p.ev(`!!planx.board.get('r').joint + ' ' + planx.board.linkList().map((l) => l.from + '>' + l.to).join()`), 'Cmd on the way: out').toBe('false a>c');
    // Not put in, but with two lines out of it (arrows at the others): one line between them, both ends arrowed.
    await p.ev(`(() => { const b = planx.board; b.remove(b.linkList().map((l) => l.id)); b.update('r', { x: 500, y: 320 });
      b.addLink({ id: 'l1', from: 'r', to: 'a', style: 'straight' }); b.addLink({ id: 'l2', from: 'r', to: 'c', style: 'straight' }); planx.editor.setSelection([]); })()`);
    await sleep(100);
    await p.drag([550, 350], [550, 550], { modifiers: 4 });
    expect(await p.ev(`planx.board.linkList().map((l) => l.from + '>' + l.to + ':' + (l.heads ?? 'end')).join()`), 'two out of it: one, arrowed both ways').toBe('a>c:both');
  },

  async '"Узел на линии": a sticker dragged off the rail onto a picked line\'s middle goes into it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 200, 300, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('rect', 900, 300, { id: 'c', w: 100, h: 100 }));
      b.addLink({ id: 'l', from: 'a', to: 'c', style: 'straight' }); e.setSelection(['l']); })()`);
    await sleep(300);
    const m = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), l = planx.board.getLink('l'); const q = g.linkHandles(l, g.linkShape(l, (id) => planx.board.get(id))).middles[0].p, s = planx.editor.toScreen(q), c = planx.editor.canvas.getBoundingClientRect(); return [s.x + c.left, s.y + c.top]; })()`);
    await carry(p, await p.at('.tools [data-key="sticky"]'), [[m[0] - 100, m[1] + 100], m]);
    const st = await p.ev(`(() => { const s = planx.board.list().find((i) => i.type === 'sticky'); return { joint: !!s?.joint, ls: planx.board.linkList().map((l) => l.from + '>' + l.to).sort().join() , s: s?.id }; })()`);
    expect(`${st.joint} ${st.ls}`, 'in the line').toBe(`true ${[`a>${st.s}`, `${st.s}>c`].sort().join()}`);
  },

  async '"Перестановка в таблице": the big plus away while the cell it stands on is picked, back as another is'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.dropItem('table', { x: 640, y: 420 }); })()`);
    await sleep(300);
    const plusSp = await p.ev(`(() => { const e = planx.editor, t = planx.board.list().find((i) => i.type === 'table'), s = e.toScreen({ x: t.x + t.w / 2, y: t.y + t.h }); return { x: s.x, y: s.y - 14 }; })()`);
    const plus = () => p.ev(`(async () => (await import('/src/labs/tableMove.ts')).tablePlusAt(planx.editor, ${JSON.stringify(plusSp)}))()`);
    expect(await plus(), 'out').toBe('row');
    const cellUnder = await p.ev(`(async () => { const m = await import('/src/model/table.ts'), e = planx.editor, t = planx.board.list().find((i) => i.type === 'table'); return m.cellAt(t, e.toWorld(${plusSp.x}, ${plusSp.y})); })()`);
    const click = async (i) => p.click(await p.ev(`(async () => { const m = await import('/src/model/table.ts'), e = planx.editor, t = planx.board.list().find((i) => i.type === 'table'), r = m.cellRect(t, ${i}), s = e.toScreen({ x: r.x + 12, y: r.y + r.h / 2 }); return [s.x, s.y]; })()`));
    await click(cellUnder);
    await sleep(300);
    expect(await p.ev(`planx.editor.cells.join()`), 'that cell picked').toBe(String(cellUnder));
    expect(await plus(), 'away over it').toBe(null);
    // (A fresh table's four columns: the plus on the line between two, on the one beside it in part.)
    await click(cellUnder - 1);
    await sleep(300);
    expect(await p.ev(`planx.editor.cells.join()`), 'the one beside it picked').toBe(String(cellUnder - 1));
    expect(await plus(), 'away over that one too, standing on it in part').toBe(null);
    await click(0);
    await sleep(300);
    expect(await plus(), 'back with another cell picked').toBe('row');
  },

  async '"Перестановка в таблице": a table dropped on the board has its pills out at once'(p) {
    await p.ev(`planx.editor.dropItem('table', { x: 500, y: 350 })`);
    await sleep(100);
    expect(await p.ev(`(async () => { const t = planx.board.list().find((i) => i.type === 'table'); return (await import('/src/labs/tableMove.ts')).gripsOn(t.id); })()`), 'pills out').toBe(true);
    // Its plus at the bottom, over the line down its middle: the plus lit, not the line.
    const t = await p.ev(`planx.board.list().find((i) => i.type === 'table')`);
    const c = await p.ev(`(() => { const s = planx.editor.toScreen({ x: ${t.x + t.w / 2}, y: ${t.y + t.h} }), r = planx.editor.canvas.getBoundingClientRect(); return [s.x + r.left, s.y + r.top - 14]; })()`);
    await p.mouse('mouseMoved', c[0], c[1] - 20);
    await p.mouse('mouseMoved', ...c);
    await sleep(700);
    expect(await p.ev(`planx.editor.hotLine`), 'no line lit').toBe(null);
    // Made with the tool, a click on the board: the same.
    await p.ev(`planx.editor.setTool('table')`);
    await p.click([800, 150]);
    await sleep(100);
    expect(await p.ev(`(async () => { const s = planx.editor.selectedItems()[0]; return [s.type, (await import('/src/labs/tableMove.ts')).gripsOn(s.id), planx.editor.editingId].join(); })()`), 'made with the tool: pills out, no cell open').toBe('table,true,');
  },

  async '"Таблица помнит формат": the next empty cell goes on aligned as the last one was set'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      planx.board.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill('') })); e.setSelection(['t']); e.startEditing('t', 0); })()`);
    await sleep(300);
    await p.ev(`planx.editor.setTextStyle({ ta: 'right' })`);
    await sleep(100);
    await p.key('Tab', 'Tab', 9);
    await sleep(300);
    const t = await p.ev(`planx.board.get('t')`);
    expect(`${await p.ev('planx.editor.editingCell')} ${t.cellFmt?.[1]?.ta}`, 'the next cell right-aligned').toBe('1 right');
    expect(await p.ev(`!!document.querySelector('.tfmt')`), 'the text panel up').toBe(true);
  },

  async '"Удаление строк и столбцов": Delete takes a whole column\'s text, then the column'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      planx.board.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }));
      e.setSelection(['t']); e.cells = [1, 4, 7]; e.emit(); })()`);
    await sleep(200);
    await p.key('Delete', 'Delete', 46);
    let t = await p.ev(`planx.board.get('t')`);
    expect(`${t.cells.join('')} ${t.cols.length}`, 'first its text').toBe('acdfgi 3');
    await p.key('Delete', 'Delete', 46);
    t = await p.ev(`planx.board.get('t')`);
    expect(`${t.cells.join('')} ${t.cols.length} ${t.w}`, 'then the column').toBe('acdfgi 2 240');
    expect(!!(await p.ev(`planx.board.get('t')`)), 'the table stays').toBe(true);
  },

  async 'with no room over the panel over what\'s picked, its palette opens down'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('rect', 480, 170, { id: 'a', w: 240, h: 140 })); e.setSelection(['a']); })()`);
    await sleep(400);
    const bar = await p.rect('.panel-over');
    expect(bar.b < 170, 'the panel over it').toBe(true);
    await p.click(await p.at('.panel-over button[aria-label="Цвет"]'));
    await sleep(300);
    expect((await p.rect('.panel-over .op-pop')).t > bar.b, 'its palette under it').toBe(true);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async 'by the bottom of the window, the text panel\'s colours open up, clear of it'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('sticky', 500, 720, { id: 's', w: 120, h: 60, text: 'Низ' })); e.setSelection(['s']); })()`);
    await sleep(400);
    await p.click(await p.at('.panel-over button[aria-label="Текст и шрифт"]'));
    await sleep(700);
    await p.click(await p.at('.tfmt button[aria-label="Цвет текста"]'));
    await sleep(300);
    const m = await p.rect('.tfmt .tf-menu'), t = await p.rect('.tfmt');
    expect(`${m.b <= t.t} ${m.b <= 800}`, 'over the panel, on the screen').toBe('true true');
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async 'typing in a mind map node, its panel follows it, one panel only'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('mind', 400, 300, { id: 'm', text: 'Т', w: 120, h: 50 })); e.setSelection(['m']); })()`);
    await sleep(400);
    await p.ev(`planx.editor.startEditing('m')`);
    await sleep(300);
    for (const ch of 'ема очень длинная') { await p.cdp('Input.insertText', { text: ch }); await sleep(40); }
    await sleep(300);
    expect(await p.ev(`document.querySelectorAll('.panel-over:not(.gone)').length`), 'one panel').toBe(1);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '"Кнопка T": what comes in on the panel only fades in, it doesn\'t slide'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('sticky', 500, 300, { id: 's', text: 'Привет' })); e.setSelection(['s']); })()`);
    await sleep(400);
    // Each frame: whatever's showing and shifted from its place.
    const watch = (sel) => p.ev(`(() => { window.slid = []; const t0 = performance.now(); const f = () => { for (const e of document.querySelectorAll('${sel}:not(.gone):not(.leaving)')) { const cs = getComputedStyle(e); if (+cs.opacity > 0 && cs.transform !== 'none') window.slid.push(cs.transform); } if (performance.now() - t0 < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
    await watch('.tfmt');
    await p.click(await p.at('.panel-over button[aria-label="Текст и шрифт"]'));
    await sleep(700);
    expect(await p.ev('window.slid.length'), 'the text panel, no slide').toBe(0);
    await watch('.panel-over');
    await p.click(await p.at('.tfmt button[aria-label="Назад"]'));
    await sleep(700);
    expect(await p.ev('window.slid.length'), 'the panel back, no slide').toBe(0);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '"Кнопка T" on a mind map node: its text formatted from the text panel'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('mind', 400, 300, { id: 'm', text: 'Тема', w: 160, h: 60 })); e.setSelection(['m']); })()`);
    await sleep(400);
    await p.click(await p.at('.bar.panel button[aria-label="Текст и шрифт"]'));
    await sleep(700);
    await p.click(await p.at('.tfmt button[aria-label="Курсив"]'));
    expect(await p.ev(`planx.board.get('m').fi`), 'its text in italics').toBe(true);
  },

  async '"Перестановка в таблице": a double click on a table, a cell or a line, puts the pills out, only those of the column and row under the pointer; typing in a cell too'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill('') })); e.setSelection([]); })()`);
    await sleep(300);
    const on = () => p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`);
    // Which pills the pointer finds over each column's top and by each row.
    const pills = () => p.ev(`(async () => { const m = await import('/src/labs/tableMove.ts'), e = planx.editor;
      return [[360, 291], [480, 291], [600, 291], [291, 320], [291, 360], [291, 400]].map(([x, y]) => { const g = m.gripAt(e, { x, y }); return g ? g.axis + g.index : '-'; }).join(); })()`);
    const dbl = async ([x, y]) => { await p.mouse('mouseMoved', x, y); for (let i = 0; i < 2; i++) { await p.mouse('mousePressed', x, y); await p.mouse('mouseReleased', x, y); await sleep(60); } await sleep(250); };
    // On the line between the first two columns.
    await dbl([420, 330]);
    expect(await on(), 'out').toBe(true);
    await p.mouse('mouseMoved', 480, 360);
    await sleep(100);
    expect(await pills(), 'the middle column\'s and row\'s only').toBe('-,col1,-,-,row1,-');
    // Pluses on the lines either side of them, just inside: one pressed puts one in there.
    const plusesAt = (pts) => p.ev(`(async () => { const m = await import('/src/labs/tableMove.ts'); return ${JSON.stringify(pts)}.map(([x, y]) => m.tablePlusAt(planx.editor, { x, y }) ?? '-').join(); })()`);
    expect(await plusesAt([[420, 314], [540, 314], [660, 314], [314, 340], [314, 380], [314, 420]]), 'after the column and under the row under the pointer').toBe('-,col@2,-,-,row@2,-');
    // Gone on a little past its line into the next column, it stays, to be pressed.
    await p.mouse('mouseMoved', 540, 330);
    await p.mouse('mouseMoved', 551, 316);
    await sleep(50);
    expect(await plusesAt([[551, 316]]), 'kept, near it').toBe('col@2');
    expect(await plusesAt([[660, 314], [314, 340]]), 'lit, the only column\'s out; the row\'s stays').toBe('-,row@1');
    expect(await pills(), 'the pills as before it, no other column\'s').toBe('-,col1,-,row0,-,-');
    // None on the top or left edge, wherever the pointer is.
    await p.mouse('mouseMoved', 291, 360);
    await sleep(50);
    expect(await plusesAt([[300, 314], [314, 300]]), 'none at the top left').toBe('-,-');
    await p.click([540, 314]);
    const t = await p.ev(`planx.board.get('t')`);
    expect(`${t.cols.length} ${t.w}`, 'a column put in').toBe('4 480');
    await p.mouse('mouseMoved', 600, 400);
    await sleep(100);
    expect(await pills(), 'others as it moves').toBe('-,-,col2,-,-,row2');
    // Off it: none; a click elsewhere puts them away.
    await p.mouse('mouseMoved', 900, 600);
    await sleep(100);
    expect(await pills(), 'none').toBe('-,-,-,-,-,-');
    await p.click([900, 600]);
    expect(await on(), 'away').toBe(false);
    // Typing in a cell: theirs, under the pointer.
    await p.ev(`(() => { const e = planx.editor; e.setSelection(['t']); e.startEditing('t', 4); })()`);
    await sleep(300);
    await p.mouse('mouseMoved', 480, 360);
    await sleep(100);
    expect(await pills(), 'typing, the pointer over the text').toBe('-,col1,-,-,row1,-');
    await p.ev(`planx.editor.stopEditing()`);
    await sleep(100);
    expect(await pills(), 'typing done: no pills').toBe('-,-,-,-,-,-');
  },

  async '"Перестановка в таблице": a column dragged by its pill takes its cells along'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 120, cols: [100, 120, 140], rows: [40, 40, 40], cells: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] })); e.setSelection(['t']); })()`);
    await sleep(300);
    // No pills till they're put out.
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'no pills at first').toBe(false);
    await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).toggleGrips(planx.editor))()`);
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'put out').toBe(true);
    // The first column's pill, on the top edge over its middle, to the last column.
    await p.mouse('mouseMoved', 350, 300);
    await p.drag([350, 297], [640, 307]);
    await sleep(100);
    let t = await p.ev(`planx.board.get('t')`);
    expect(t.cells.join(''), 'the column went last').toBe('bcaefdhig');
    expect(t.cols.join(), 'its width with it').toBe('120,140,100');
    expect(t.x, 'the table stayed').toBe(300);
    // A row's pill, on the left edge.
    await p.drag([300, 400], [310, 305]);
    t = await p.ev(`planx.board.get('t')`);
    expect(t.cells.join(''), 'the last row went first').toBe('higbcaefd');
    // Dragged off the table: taken away.
    await p.drag([297, 360], [297, 700]);
    t = await p.ev(`planx.board.get('t')`);
    expect(t.cells.join(''), 'the middle row gone').toBe('higefd');
    expect(t.h, 'the table shorter').toBe(80);
    // Picked again: no pills, till a second click on it.
    await p.ev(`(() => { planx.editor.setSelection([]); })()`);
    await sleep(50);
    await p.ev(`planx.editor.setSelection(['t'])`);
    await sleep(50);
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'away once something else was picked').toBe(false);
    // Taken and dragged, it only moves.
    await p.drag([500, 330], [520, 340]);
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'not out by a drag').toBe(false);
    await p.ev(`planx.board.update('t', { x: 300, y: 300 })`);
    await p.click([500, 330]);
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'out by a second click').toBe(true);
    // Along the way it moves, just past the table's edge is enough; across, 44 isn't reached by 30.
    await p.drag([360, 293], [360, 260]);
    expect((await p.ev(`planx.board.get('t')`)).cols.length, '30 off its side: kept').toBe(3);
    await p.drag([360, 293], [670, 300]);
    expect((await p.ev(`planx.board.get('t')`)).cols.length, 'just past the right edge: gone').toBe(2);
    // The plus inside by the right edge: a column more.
    const t2 = await p.ev(`planx.board.get('t')`), c = await p.ev(`planx.editor.toScreen({ x: ${t2.x + t2.w}, y: ${t2.y + t2.h / 2} })`);
    await p.click([c.x - 14, c.y]);
    await p.click([c.x - 14, c.y]);
    expect((await p.ev(`planx.board.get('t')`)).cols.length, 'the plus where it was: pressed twice, two columns more').toBe(4);
  },

  async 'a locked sticker is neither moved nor deleted, until unlocked'(p) {
    const ids = await stickers(p);
    await select(p, ids.a);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label^="Закрепить"]'));
    const x = await p.ev(`planx.board.get('${ids.a}').x`);
    await p.key('ArrowRight', 'ArrowRight', 39);
    await p.key('Delete', 'Delete', 46);
    expect(await p.ev(`planx.board.get('${ids.a}')?.x`), 'not moved or deleted').toBe(x);
    const at = await p.ev(`(() => { const it = planx.board.get('${ids.a}'), s = planx.editor.toScreen({ x: it.x + 50, y: it.y + 50 }); return [s.x, s.y]; })()`);
    await p.drag(at, [at[0] + 120, at[1] + 60]);
    expect(await p.ev(`planx.board.get('${ids.a}').x`), 'not dragged').toBe(x);
    await select(p, ids.a);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label="Открепить"]'));
    await p.key('Delete', 'Delete', 46);
    expect(await p.ev(`!!planx.board.get('${ids.a}')`), 'deleted once unlocked').toBeFalsy();
  },

  async 'what\'s in a locked frame (a timeline, a group) is neither dragged nor deleted'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('frame', 200, 150, { id: 'f', w: 500, h: 400, members: ['s'], lock: true }));
      b.add(e.newItem('sticky', 300, 250, { id: 's', w: 100, h: 100 })); e.setSelection([]); })()`);
    await sleep(300);
    await p.drag([350, 300], [500, 400]);
    expect(await p.ev(`planx.board.get('s').x`), 'not dragged').toBe(300);
    await p.key('Delete', 'Delete', 46);
    expect(await p.ev(`!!planx.board.get('s')`), 'not deleted').toBe(true);
  },

  async 'a reaction goes on from the panel, shows under the sticker and comes off with a click there'(p) {
    const ids = await stickers(p);
    await select(p, ids.c);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label="Реакция"]'));
    await p.click(await p.at('.react-pop .react-btn'));
    expect(await p.ev(`Object.keys(planx.board.get('${ids.c}').rx).join()`), 'a like on it').toBe('emoji-27');
    expect(await p.ev(`planx.board.get('${ids.c}').rx['emoji-27'].length`), 'one like').toBe(1);
    await p.escape();
    const pill = await p.ev(`(() => { const it = planx.board.get('${ids.c}'), s = planx.editor.toScreen({ x: it.x, y: it.y + it.h }); return [s.x + 20, s.y + 18]; })()`);
    await p.click(pill);
    expect(await p.ev(`planx.board.get('${ids.c}').rx`), 'taken off').toBe(undefined);
  },

  async 'Ctrl+F finds a sticker by its text and goes to it'(p) {
    const ids = await stickers(p);
    await p.ev(`planx.editor.cam = { x: 3000, y: 3000, z: 1 }; planx.editor.camChanged()`);
    await p.key('f', 'KeyF', 70, 2);
    expect(await p.ev(`document.activeElement?.id`), 'the field takes the keys').toBe('labs-search');
    await p.cdp('Input.insertText', { text: 'еж' });
    await sleep(200);
    expect(await p.ev(`document.querySelectorAll('.search-list li').length`), 'one found').toBe(1);
    await p.key('Enter', 'Enter', 13);
    await sleep(600);
    expect(await p.ev(`planx.editor.getUI().selection[0]`), 'picked').toBe(ids.c);
    const s = await p.ev(`(() => { const it = planx.board.get('${ids.c}'); return planx.editor.toScreen({ x: it.x + it.w / 2, y: it.y + it.h / 2 }); })()`);
    expect(s.x, 'in the middle of the screen').toBeNear(600, 2);
  },

  async 'the export popup shows a preview and the picture size'(p) {
    await stickers(p);
    await p.click(await p.at('.labs-rail button[aria-label="Экспорт в PNG"]'));
    expect(await p.ev(`document.querySelector('.export-preview img')?.naturalWidth > 0`), 'a preview').toBeTruthy();
    const size = await p.ev(`document.querySelector('.export-pop .muted').textContent`);
    expect(/^\d+ × \d+ пикселей$/.test(size), `size "${size}"`).toBeTruthy();
  },

  async 'the timer starts from its popup, pauses and goes away'(p) {
    await p.click(await p.at('.labs-rail button[aria-label="Общий таймер"]'));
    await p.click(await p.at('.timer-presets .btn'));
    expect(await p.ev(`document.querySelector('.timer-clock')?.textContent`), 'a minute').toBe('1:00');
    await p.click(await p.at('.timer-pill button[aria-label="Пауза"]'));
    expect(!!(await p.rect('.timer-pill.paused')), 'paused').toBeTruthy();
    await p.click(await p.at('.timer-pill button[aria-label="Убрать таймер"]'));
    expect(!!(await p.rect('.timer-pill')), 'gone').toBeFalsy();
  },

  async '? opens the help, and the laser draws without touching the board'(p) {
    await p.key('?', 'Slash', 191, 8);
    expect(!!(await p.rect('.help')), 'the help, with the keys').toBeTruthy();
    await p.escape();
    await sleep(250);
    expect(!!(await p.rect('.help')), 'closed').toBeFalsy();
    // In a small window what's in it scrolls inside: the popup itself stays, and its glass with it.
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 420, deviceScaleFactor: 1, mobile: false });
    await p.key('?', 'Slash', 191, 8);
    const small = await p.ev(`(() => { const h = document.querySelector('.help:not(.gone)'), b = h.querySelector('.help-body'); return [h.scrollHeight <= h.clientHeight, b.scrollHeight > b.clientHeight].join(); })()`);
    expect(small, 'scrolls inside, not itself').toBe('true,true');
    await p.escape();
    await sleep(250);
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
    const ids = await stickers(p);
    await p.key('k', 'KeyK', 75);
    const at = await p.ev(`(() => { const it = planx.board.get('${ids.a}'), s = planx.editor.toScreen({ x: it.x + 50, y: it.y + 50 }); return [s.x, s.y]; })()`);
    const x = await p.ev(`planx.board.get('${ids.a}').x`);
    await p.drag(at, [at[0] + 200, at[1] + 100]);
    expect(await p.ev(`planx.board.get('${ids.a}').x`), 'the sticker stays').toBe(x);
    expect(await p.ev(`planx.board.list().length`), 'nothing drawn on the board').toBe(2);
  },

  async 'their rail is the tool rail\'s kind: same buttons, rearranged by holding, moved by its top edge'(p) {
    const size = (q) => p.ev(`(() => { const e = document.querySelector('${q}'); const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
    expect((await size('.labs-rail .fb')).join(), 'a button as big as the tool rail\'s').toBe((await size('.tools:not(.labs-rail) .fb')).join());
    expect((await size('.labs-rail'))[0], 'as wide').toBe((await size('.tools:not(.labs-rail)'))[0]);
    expect((await p.rect('.labs-rail')).r, 'at the right edge').toBe(1200 - 12);
    const keys = () => p.ev(`[...document.querySelectorAll('.labs-rail > [data-key]')].map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.key, Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })`);
    const k0 = await keys();
    expect(k0.map((k) => k[0]).join(), 'in order').toBe('export,pdf,search,layers,history,timer,laser,follow,codeBlock');
    // Brought to the fourth one's middle, it passes the two before that, as on the tool rail.
    await carry(p, k0[0].slice(1), [k0[3].slice(1)]);
    const k1 = (await keys()).map((k) => k[0]);
    expect(k1.indexOf('export'), 'export moved down two places').toBe(2);
    expect(await p.ev(`!!document.querySelector('.export-pop')`), 'and that was no click').toBeFalsy();
    const r0 = await p.rect('.labs-rail');
    await p.dragEdge('.labs-rail', 'top', 0, -120);
    const r1 = await p.rect('.labs-rail');
    expect(r1.t, 'moved up').toBeNear(r0.t - 120, 2);
    expect(r1.r, 'still at the right edge').toBe(1200 - 12);
    // The tool rail doesn't go over it.
    await p.dragEdge('.tools', 'top', 1000, 0);
    expect((await p.rect('.tools')).l, 'the tool rail stays at the left').toBe(12);
    await p.reload();
    expect((await keys()).map((k) => k[0]).join(), 'its order kept after a reload').toBe(k1.join());
  },

  async '"Текст не слипается": text typed onto a second line pushes the text just under it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 250);
      const t1 = e.newItem('text', x, y, { id: 't1', w: 160, text: 'Первая' }), t2 = e.newItem('text', x, y, { id: 't2', w: 160, text: 'Вторая' }), t3 = e.newItem('text', x + 400, y, { id: 't3', w: 160, text: 'Сбоку' });
      b.add(t1); b.add({ ...t2, y: y + t1.h + 10 }); b.add({ ...t3, y: y + t1.h + 10 }); e.setSelection([]); })()`);
    const before = await p.ev(`['t1', 't2', 't3'].map((id) => { const i = planx.board.get(id); return { y: i.y, h: i.h }; })`);
    await p.ev(`planx.editor.startEditing('t1', null, 'end')`);
    await sleep(200);
    await p.cdp('Input.insertText', { text: ' и ещё много слов, чтобы перенестись' });
    await sleep(300);
    const after = await p.ev(`['t1', 't2', 't3'].map((id) => { const i = planx.board.get(id); return { y: i.y, h: i.h }; })`);
    const grew = after[0].h - before[0].h;
    expect(grew > 0, 'the first is taller').toBe(true);
    expect(after[1].y - before[1].y, 'the one under it pushed as much').toBe(grew);
    expect(after[2].y, 'the one off to the side stays').toBe(before[2].y);
  },

  async '"Текст не слипается" in an instance: the copy grows as it is typed in and pushes the one under it there only'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
      b.transact(() => {
        b.add(e.newItem('frame', X - 1500, Y, { id: 'source', comp: true, text: 'К', w: 300, h: 200, members: ['t1', 't2'], z: 0 }));
        b.add(e.newItem('text', X - 1460, Y + 40, { id: 't1', w: 200, text: 'Заголовок' }));
        b.add(e.newItem('text', X - 1460, Y + 76, { id: 't2', w: 200, text: 'Подпись' }));
        b.add(e.newItem('frame', X, Y, { id: 'instance', inst: 'source', w: 300, h: 200, members: [], z: 0 }));
      }); e.setSelection([]); })()`);
    await sleep(300);
    const y0 = await p.ev(`planx.board.get('instance~t2').y`), h0 = await p.ev(`planx.board.get('instance~t1').h`);
    await p.ev(`planx.editor.startEditing('instance~t1', null, 'end')`);
    await sleep(200);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await p.cdp('Input.insertText', { text: 'вторая строка' });
    await sleep(300);
    const grew = (await p.ev(`planx.board.get('instance~t1').h`)) - h0;
    expect(grew > 0, 'taller while typing').toBe(true);
    expect((await p.ev(`planx.board.get('instance~t2').y`)) - y0, 'the one under it pushed while typing').toBe(grew);
    await p.ev('planx.editor.stopEditing()');
    await sleep(300);
    const end = await p.ev(`(() => { const b = planx.board; return { h: b.get('instance~t1').h, y: b.get('instance~t2').y, src: b.get('t2').y, text: b.get('instance~t1').text }; })()`);
    expect(end.text, 'the new text kept').toBe('Заголовок\nвторая строка');
    expect(end.h - h0, 'still taller').toBe(grew);
    expect(end.y - y0, 'still pushed').toBe(grew);
    // The component moved on: the copy goes along, still pushed as far.
    const s0 = await p.ev(`planx.board.get('t2').y`);
    await p.ev(`planx.board.update('t2', { text: 'Новая подпись' })`);
    await sleep(300);
    expect((await p.ev(`planx.board.get('instance~t2').y`)) - y0, 'pushed as far after the component changed').toBe(grew);
    expect(await p.ev(`planx.board.get('t2').y`), 'the component itself not pushed').toBe(s0);
  },

  async '"Авторасположение": a gap\'s pill under the pointer takes its colour and grows smoothly, twice as thick, 1.3 times as long, its line a tenth longer; and goes back so; it answers further off but over an item'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => { b.add(e.newItem('rect', 300, 300, { id: 'a', w: 200, h: 200 })); b.add(e.newItem('rect', 560, 300, { id: 'c', w: 200, h: 200 })); }); e.setSelection(['a', 'c']); })()`);
    await sleep(300);
    // (In the alignment's menu, several picked.)
    await p.click(await p.at('.bar.panel button[aria-label="Выравнивание"]'));
    await p.click(await p.at('.align-pop button[aria-label="Авторасположение по горизонтали"]'));
    await sleep(200);
    const m = await p.ev(`(() => { const a = planx.board.get('a'), c = planx.board.get('c'), s = planx.editor.toScreen({ x: (a.x + a.w + c.x) / 2, y: (a.y + a.y + a.h) / 2 }); return [Math.round(s.x), Math.round(s.y)]; })()`);
    // How many solid red dots across its middle and along it just off its middle line.
    const size = () => p.ev(`(() => { const k = devicePixelRatio, c = document.querySelector('canvas').getContext('2d'), red = (x, y) => { const d = c.getImageData(x * k, y * k, 1, 1).data; return d[0] > 200 && d[1] < 110 && d[2] < 110; };
      let across = 0, along = 0; for (let i = -14; i <= 14; i++) { if (red(${m[0]} + i, ${m[1]})) across++; if (red(${m[0]} + 3, ${m[1]} + i)) along++; } return [across, along]; })()`);
    const rest = await size();
    expect(rest[1], 'at rest: 3 off its middle is off it').toBe(0);
    await p.mouse('mouseMoved', m[0], m[1] + 40);
    await sleep(40);
    const mid = await size();
    await sleep(350);
    const big = await size();
    expect(big[0] > mid[0], `grows little by little: ${mid[0]} on the way to ${big[0]}`).toBe(true);
    expect(big[0], 'twice as thick, filled').toBeNear(9, 2);
    expect(big[1], '1.3 times as long (21, its round ends taking 3 here; 16 long would read 13)').toBeNear(18, 1);
    // Its line, a tenth longer than the 200 it runs (dots of it, its colour, past the top end).
    const beyond = () => p.ev(`(() => { const k = devicePixelRatio, c = document.querySelector('canvas').getContext('2d'); let n = 0; for (let i = 3; i <= 14; i++) { const d = c.getImageData(${m[0]} * k, (${m[1]} - 100 - i) * k, 1, 1).data; if (d[0] > d[1] + 30) n++; } return n; })()`);
    expect(await beyond(), 'its line, 10 further at each end').toBeNear(8, 2);
    await p.mouse('mouseMoved', 900, 700);
    await sleep(40);
    const back = await size();
    await sleep(350);
    expect(back[0] > rest[0], `goes back little by little: ${back[0]} on the way to ${rest[0]}`).toBe(true);
    expect((await size()).join(), 'as it was').toBe(rest.join());
    expect(await beyond(), 'its line, back').toBe(0);
    // It answers 12 either side of its line (the gap made wide enough to look), but 6 over an item there.
    await p.drag(m, [m[0] + 40, m[1]]);
    await sleep(200);
    const wide = await p.ev(`(() => { const a = planx.board.get('a'), c = planx.board.get('c'), s = planx.editor.toScreen({ x: (a.x + a.w + c.x) / 2, y: a.y + a.h / 2 }); return [s.x, s.y, c.x - a.x - a.w]; })()`);
    expect(wide[2] >= 30, `the gap wide: ${wide[2]}`).toBe(true);
    const at = (dx) => p.ev(`(async () => (await import('/src/labs/tidy.ts')).gapAt(planx.editor, { x: ${wide[0]} + ${dx}, y: ${wide[1]} }))()`);
    expect(await at(10), '10 off: answers').toBe('col');
    expect(await at(14), '14 off: no').toBe(null);
    await p.ev(`(() => { const e = planx.editor, w = e.toWorld(${wide[0]} + 8, ${wide[1]} - 20); planx.board.add(e.newItem('sticky', w.x, w.y, { id: 'over', w: 40, h: 40 })); })()`);
    await sleep(100);
    expect(await at(10), 'an item under the pointer, 10 off: no').toBe(null);
    expect(await at(5), 'nearer than 6: still').toBe('col');
  },

  async '"Авторасположение" lined up meanwhile («Выравнивание»): kept so as its gaps change'(p) {
    await p.ev(`(async () => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => { b.add(e.newItem('rect', 300, 100, { id: 'a', w: 100, h: 80 })); b.add(e.newItem('rect', 300, 300, { id: 'c', w: 240, h: 80 })); b.add(e.newItem('rect', 300, 500, { id: 'd', w: 160, h: 80 })); });
      e.setSelection(['a', 'c', 'd']); const t = await import('/src/labs/tidy.ts'); t.startTidy(e, 'col'); (await import('/src/labs/align.ts')).alignItems(e, 'center'); t.setGaps(e, 60, 60); })()`);
    await sleep(200);
    const mids = await p.ev(`['a', 'c', 'd'].map((k) => { const i = planx.board.get(k); return i.x + i.w / 2; }).join()`);
    expect(mids, 'centred still').toBe('420,420,420');
    expect(await p.ev(`planx.board.get('c').y - (planx.board.get('a').y + 80)`), 'the new gap').toBe(60);
  },

  async '"Авторасположение" on one mind map node lays out what grows from it as a mind map does; one Ctrl+Z puts it back'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 200, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        b.add(e.newItem('mind', 430, 390, { id: 'a', w: 100, h: 40, parent: 'r', text: 'А' }));
        b.add(e.newItem('mind', 370, 170, { id: 'b', w: 100, h: 40, parent: 'r', text: 'Б' }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Авторасположение"]'));
    await sleep(100);
    const at = () => p.ev(`['a', 'b'].map((k) => { const i = planx.board.get(k); return i.x + ',' + i.y; }).join(' ')`);
    expect(await p.ev(`(() => { const [r, a, b] = ['r', 'a', 'b'].map((k) => planx.board.get(k));
      return [a.x === b.x && a.x === r.x + r.w + 60, a.y - b.y - b.h === 16, Math.abs(b.y + a.y + a.h - (2 * r.y + r.h)) <= 1].join(); })()`), 'b above a, 60 off, 16 apart, centred (to a pixel, rounded)').toBe('true,true,true');
    await p.ev('planx.editor.undo()');
    expect(await at(), 'back').toBe('430,390 370,170');
  },

  async '"Авторасположение" on a mind map node: its handles stretch the gaps as they came out, in proportion'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [k, y] of [['a', 200], ['b', 400]]) {
          b.add(e.newItem('mind', 300, y, { id: k, w: 100, h: 40, parent: 'r', text: k }));
          for (const i of [0, 1]) b.add(e.newItem('mind', 500, y + i * 60, { id: k + i, w: 100, h: 40, parent: k, text: k + i }));
        }
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    await sleep(100);
    const xs = () => p.ev(`['r', 'a', 'a0'].map((k) => planx.board.get(k)).map((i) => i.x + ',' + i.w)`);
    const ys = () => p.ev(`['a0', 'a1', 'b0', 'b1'].map((k) => planx.board.get(k).y)`), h = await p.ev(`planx.board.get('a0').h`);
    const gaps = (y) => [y[1] - y[0] - h, y[2] - y[1] - h, y[3] - y[2] - h];
    const y = await ys(), g0 = gaps(y);
    // The fullest level's widest gap (the cousins'): its handle dragged 40 down.
    const mid = await p.ev(`(() => { const a = planx.board.get('a1'), s = planx.editor.toScreen({ x: a.x + a.w / 2, y: a.y + a.h + ${g0[1]} / 2 }); return [s.x, s.y]; })()`);
    await p.drag(mid, [mid[0], mid[1] + 40]);
    await sleep(200);
    const z = await ys(), k = (g0[1] + 40) / g0[1];
    expect(gaps(z).map((v) => Math.round(v)).join(), 'gaps along times k').toBe(g0.map((v) => Math.round(v * k)).join());
    expect(Math.round((z[0] + z[3]) / 2), 'centred where it was').toBe(Math.round((y[0] + y[3]) / 2));
    // The gap out from the node to its branches: dragged 30 right, every gap out grows in proportion.
    const [r, a] = (await xs()).map((s) => s.split(',').map(Number));
    const out = await p.ev(`(() => { const r = planx.board.get('r'), kids = ['a', 'b'].map((k) => planx.board.get(k)), lo = Math.min(...kids.map((k) => k.y)), hi = Math.max(...kids.map((k) => k.y + k.h));
      const s = planx.editor.toScreen({ x: (r.x + r.w + kids[0].x) / 2, y: lo + Math.max(24, (hi - lo) / 4) / 2 }); return [s.x, s.y]; })()`);
    const gx = a[0] - r[0] - r[1];
    await p.drag(out, [out[0] + 30, out[1]]);
    await sleep(200);
    const [, a2, c2] = (await xs()).map((s) => s.split(',').map(Number)), kx = (gx + 30) / gx;
    expect(Math.round(a2[0] - r[0] - r[1]), 'first gap out').toBe(Math.round(gx * kx));
    expect(Math.round(c2[0] - a2[0] - a2[1]), 'next gap out, in proportion').toBe(Math.round(gx * kx));
  },

  async '"Авторасположение" on a mind map node: the lines are all as long, a quarter of the longest level, whatever the size of the nodes; the ones along a level from the nodes\' left edge'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [id, y] of [['a', 200], ['c', 300], ['d', 400], ['f', 500]]) b.add(e.newItem('mind', 300, y, { id, w: 500, h: 40, parent: 'r', text: id }));
        b.add(e.newItem('mind', 900, 200, { id: 'g', w: 100, h: 40, parent: 'a', text: 'g' }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    await sleep(200);
    const g = await p.ev(`(() => { const [r, a, c, f, l] = ['r', 'a', 'c', 'f', 'g'].map((k) => planx.board.get(k)); return { x: a.x, y: (a.y + a.h + c.y) / 2, top: a.y, outX: (r.x + r.w + a.x) / 2, leafX: (a.x + a.w + l.x) / 2, leafTop: l.y, long: (f.y + f.h - a.y) / 4 }; })()`);
    const at = (x, y) => p.ev(`(async () => { const h = (await import('/src/labs/tidyMind.ts')).mindGapAt(planx.editor, planx.editor.toScreen({ x: ${x}, y: ${y} })); return h ? h.axis + ' ' + h.out : null; })()`);
    expect(await at(g.x + 2, g.y), 'along: from the left edge').toBe('row false');
    expect(await at(g.x + g.long - 2, g.y), 'to a quarter of the level').toBe('row false');
    expect(await at(g.x + g.long + 4, g.y), 'no further').toBe(null);
    expect(await at(g.x - 4, g.y), 'nor before it').toBe(null);
    expect(await at(g.outX, g.top + g.long - 2), 'out: as long').toBe('col true');
    expect(await at(g.outX, g.top + g.long + 4), 'and no further').toBe(null);
    expect(await at(g.leafX, g.leafTop + g.long - 2), 'out to a level of one node: as long too').toBe('col true');
    expect(await at(g.leafX, g.leafTop + g.long + 4), 'and no further').toBe(null);
    // Stretched far apart, they stay that long.
    const was = await p.ev(`planx.editor.toScreen({ x: ${g.outX}, y: ${g.top + 10} })`);
    await p.drag([was.x, was.y], [was.x + 150, was.y]);
    await sleep(200);
    const far = await p.ev(`(() => { const [r, a, c] = ['r', 'a', 'c'].map((k) => planx.board.get(k)); return { top: a.y, outX: (r.x + r.w + a.x) / 2, x: a.x, y: (a.y + a.h + c.y) / 2 }; })()`);
    expect(far.x > g.x + 100, 'stretched out').toBe(true);
    expect(await at(far.outX, far.top + g.long - 2), 'out, stretched: as long').toBe('col true');
    expect(await at(far.outX, far.top + g.long + 4), 'not longer').toBe(null);
  },

  async '"Авторасположение" on a mind map node: a line along a level stops short of the line across the next gap, not crossing it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 40, 300, { id: 'r', w: 60, h: 40, text: 'Ц' }));
        for (let i = 0; i < 10; i++) b.add(e.newItem('mind', 200, 40 + i * 60, { id: 'k' + i, w: 60, h: 40, parent: 'r', text: 'к' }));
        b.add(e.newItem('mind', 500, 40, { id: 'g', w: 60, h: 40, parent: 'k0', text: 'л' }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    await sleep(200);
    const g = await p.ev(`(() => { const [a, c, l] = ['k0', 'k1', 'g'].map((k) => planx.board.get(k)); return { x: a.x, y: (a.y + a.h + c.y) / 2, next: (a.x + a.w + l.x) / 2 }; })()`);
    const at = (x) => p.ev(`(async () => { const h = (await import('/src/labs/tidyMind.ts')).mindGapAt(planx.editor, planx.editor.toScreen({ x: ${x}, y: ${g.y} })); return h ? h.axis + ' ' + h.out : null; })()`);
    expect(await at(g.next - 10), 'up to 8 short of the next line').toBe('row false');
    expect((await at(g.next - 4)) === 'row false', 'no nearer').toBe(false);
    expect((await at(g.next + 4)) === 'row false', 'nor past it').toBe(false);
  },

  async '"Авторасположение" on a mind map node: no "+" buttons meanwhile; picked again, an ordinary node; pressed again untouched, all as it was'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [k, y] of [['a', 200], ['b', 400]]) b.add(e.newItem('mind', 300, y, { id: k, w: 100, h: 40, parent: 'r', text: k }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    const held = () => p.ev(`(async () => (await import('/src/labs/tidyMind.ts')).holds(planx.editor))()`);
    expect(await held(), 'handles').toBe(true);
    expect(await p.ev('planx.editor.plusFade()'), 'no "+" buttons').toBe(0);
    // Stretched by the first level's handle.
    await p.ev(`(async () => { const m = await import('/src/labs/tidyMind.ts'); m.dragMindGap(planx.editor, { axis: 'row', gap: 16, level: 0, out: false, sign: 1, way: 'right' }, 1, 16); })()`);
    const ay = await p.ev(`planx.board.get('a').y`);
    await p.ev(`planx.editor.setSelection([])`);
    await sleep(100);
    const r = await p.ev(`(() => { const r = planx.board.get('r'), s = planx.editor.toScreen({ x: r.x + r.w / 2, y: r.y + r.h / 2 }); return [s.x, s.y]; })()`);
    await p.click(r);
    await sleep(300);
    await p.ev('planx.editor.stopEditing()');
    await sleep(100);
    expect(await held(), 'picked again: an ordinary node').toBe(false);
    await p.ev(`planx.editor.tidyMind('r')`);
    expect(await held() + ' ' + await p.ev(`planx.board.get('a').y`), 'pressed again: handles and stretch as they were').toBe('true ' + ay);
    // Moved by hand: pressed again, laid out afresh with the stretch of the last time; it jumps back.
    const by = await p.ev(`planx.board.get('b').y`);
    await p.ev(`planx.board.update('b', { y: 900 })`);
    await p.ev(`planx.editor.tidyMind('r')`);
    expect(await p.ev(`planx.board.get('b').y`), 'back where it was').toBe(by);
  },

  async '"Авторасположение" on a mind map node: the first handles set every level, the others only their own'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [k, y] of [['a', 200], ['b', 400]]) {
          b.add(e.newItem('mind', 300, y, { id: k, w: 100, h: 40, parent: 'r', text: k }));
          for (const i of [0, 1]) b.add(e.newItem('mind', 500, y + i * 60, { id: k + i, w: 100, h: 40, parent: k, text: k + i }));
        }
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    const g = () => p.ev(`(() => { const b = (k) => planx.board.get(k);
      return { k: b('b').y - b('a').y - b('a').h, g: b('a1').y - b('a0').y - b('a0').h, ok: b('a').x - b('r').x - b('r').w, og: b('a0').x - b('a').x - b('a').w }; })()`);
    const drag = (h, d) => p.ev(`(async () => { const m = await import('/src/labs/tidyMind.ts'); const h = ${JSON.stringify(h)}; m.dragMindGap(planx.editor, h, m.mindStretch(h), ${d}); })()`);
    const g0 = await g();
    await drag({ axis: 'row', gap: g0.g, level: 1, out: false, sign: 1, way: 'right' }, g0.g);
    let g1 = await g();
    expect([g1.k, g1.g].join(), 'the grandchildren\'s own: theirs alone').toBe([g0.k, 2 * g0.g].join());
    await drag({ axis: 'row', gap: g0.k, level: 0, out: false, sign: 1, way: 'right' }, g0.k);
    g1 = await g();
    expect([g1.k, g1.g].join(), 'the children\'s: every level').toBe([2 * g0.k, 4 * g0.g].join());
    await drag({ axis: 'col', gap: g0.og, level: 1, out: true, sign: 1, way: 'right' }, g0.og);
    g1 = await g();
    expect([g1.ok, g1.og].join(), 'out to the grandchildren: that gap alone').toBe([g0.ok, 2 * g0.og].join());
    await drag({ axis: 'col', gap: g0.ok, level: 0, out: true, sign: 1, way: 'right' }, g0.ok);
    g1 = await g();
    expect([g1.ok, g1.og].join(), 'out from the node: every gap out').toBe([2 * g0.ok, 4 * g0.og].join());
  },

  async '"Авторасположение" on a mind map node: a branch moved by hand brings a note at the bottom, its button undoes it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [k, y] of [['a', 200], ['b', 400]]) b.add(e.newItem('mind', 300, y, { id: k, w: 100, h: 40, parent: 'r', text: k }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    await p.ev(`planx.editor.setSelection([])`);
    const at = await p.ev(`(() => { const a = planx.board.get('a'); return [a.x, a.y]; })()`);
    const from = await p.ev(`(() => { const a = planx.board.get('a'), s = planx.editor.toScreen({ x: a.x + 4, y: a.y + 4 }); return [s.x, s.y]; })()`);
    await p.drag(from, [from[0] + 80, from[1] + 60]);
    await sleep(200);
    expect(await p.ev(`document.querySelector('.toast.bottom span')?.textContent`), 'the note').toBe('Вы подвинули элемент: авторасположение выключено');
    await p.click(await p.at('.toast.bottom button'));
    await sleep(200);
    expect((await p.ev(`(() => { const a = planx.board.get('a'); return [a.x, a.y]; })()`)).join(), 'moved back').toBe(at.join());
    expect(await p.ev(`(async () => (await import('/src/labs/tidyMind.ts')).mindTidyKept(planx.editor, 'r'))()`), 'its layout kept').toBe(true);
  },

  async '"Авторасположение" of instances picked by a box: laid out by what they show, its handles there, a gap that can go below nothing'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
      b.transact(() => {
        b.add(e.newItem('frame', X - 1500, Y, { id: 'source', comp: true, text: 'К', w: 200, h: 200, members: ['a'], z: 0 }));
        b.add(e.newItem('sticky', X - 1460, Y + 40, { id: 'a', w: 120, h: 120, z: 1 }));
        b.add(e.newItem('frame', X, Y, { id: 'i1', inst: 'source', w: 200, h: 200, members: [], z: 0 }));
        b.add(e.newItem('frame', X + 300, Y + 30, { id: 'i2', inst: 'source', w: 200, h: 200, members: [], z: 0 }));
      }); e.setSelection([]); })()`);
    await sleep(300);
    await p.drag([250, 200], [800, 560]);
    expect((await p.ev(`[...planx.editor.selection].filter((id) => !id.includes('~')).sort().join()`)), 'both picked').toBe('i1,i2');
    await p.click(await p.at('.bar.panel button[aria-label="Выравнивание"]'));
    await p.click(await p.at('.align-pop button[aria-label="Авторасположение по горизонтали"]'));
    await sleep(200);
    const gap = () => p.ev(`planx.board.get('i2~a').x - (planx.board.get('i1~a').x + planx.board.get('i1~a').w)`);
    expect(await gap(), 'what they show 24 apart').toBe(24);
    const line = await p.ev(`(() => { const a = planx.board.get('i1~a'), s = planx.editor.toScreen({ x: a.x + a.w + 12, y: a.y + a.h / 2 }); return [s.x, s.y]; })()`);
    const before = await p.ev(`(() => { const c = document.querySelector('canvas'), x = c.getContext('2d').getImageData(${line[0]} * devicePixelRatio, ${line[1]} * devicePixelRatio, 1, 1).data; return [...x].join(); })()`);
    expect(before !== '240,240,240,255', 'its handle drawn').toBe(true);
    await p.drag(line, [line[0] - 60, line[1]]);
    expect(await gap(), 'overlapping now').toBe(-36);
  },

  async '"Клик сквозь": slow clicks on the item picked go down through what lies there, round to the top again'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
      b.add(e.newItem('rect', X, Y, { id: 'low', w: 200, h: 200, z: 1 }));
      b.add(e.newItem('sticky', X + 40, Y + 40, { id: 'top', w: 120, h: 120, z: 2 }));
      e.setSelection([]); })()`);
    const sel = () => p.ev(`[...planx.editor.selection].join()`);
    await p.click([400, 350]);
    expect(await sel(), 'the top one first').toBe('top');
    await sleep(450);
    await p.click([400, 350]);
    expect(await sel(), 'a slow click: the one under it').toBe('low');
    await sleep(450);
    await p.click([400, 350]);
    expect(await sel(), 'past the lowest, the top again').toBe('top');
    // A drag of the one picked still moves it.
    await sleep(450);
    await p.drag([400, 350], [440, 350]);
    expect(await sel(), 'dragged, still picked').toBe('top');
    expect(await p.ev(`planx.board.get('top').x - planx.board.get('low').x`), 'moved').toBe(80);
  },

  async '"Несколько сразу": two picked share the text panel (by the T, one panel at a time), and one corner scales them both'(p) {
    // (Off at first: turned on.)
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('multi', true))()`);
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
      b.add(e.newItem('sticky', X, Y, { id: 's1', w: 100, h: 100, text: 'Один' }));
      b.add(e.newItem('sticky', X + 150, Y, { id: 's2', w: 100, h: 100, text: 'Два' }));
      e.setSelection(['s1', 's2']); })()`);
    await sleep(900);
    // One panel: the text panel they share only by its T.
    expect(await p.ev(`!!document.querySelector('.tfmt')`), 'no text panel by itself').toBe(false);
    await p.click(await p.at('.bar.panel button[aria-label="Текст и шрифт"]'));
    await sleep(400);
    await p.click(await p.at('.tfmt button[aria-label="Жирный"]'));
    expect(await p.ev(`[planx.board.get('s1').fw, planx.board.get('s2').fw].join()`), 'both bold').toBe('700,700');
    // The corner: just past the lower right of the two (at 300 + 250, 250 + 100 on the screen).
    await p.drag([553, 353], [803, 453]);
    const r = await p.ev(`['s1', 's2'].map((id) => { const i = planx.board.get(id); return [i.w, i.fs]; }).join(' ')`);
    expect(r, 'both twice as big, text too').toBe('200,64 200,64');
    expect(await p.ev(`planx.board.get('s2').x - planx.board.get('s1').x`), 'twice as far apart').toBe(300);
    await p.key('z', 'KeyZ', 90, 4);
    await sleep(200);
    expect(await p.ev(`planx.board.get('s1').w`), 'undone in one step').toBe(100);
  },

  async '"Ссылка в тексте": the chain on the text panel sets an address, the text goes blue, Cmd+click opens it'(p) {
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 250); planx.board.add(e.newItem('sticky', x, y, { id: 'st', w: 150, h: 150, text: 'Сайт' })); e.setSelection(['st']); e.startEditing('st'); })()`);
    await sleep(300);
    // Typed in, done: its panel's there by the T ("Кнопка T").
    await p.ev('planx.editor.stopEditing()');
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Текст и шрифт"]'));
    await sleep(700);
    await p.click(await p.at('.tfmt button[aria-label="Ссылка"]'));
    await sleep(200);
    expect(await p.ev(`document.activeElement?.getAttribute('aria-label')`), 'its field ready').toBe('Адрес ссылки');
    await p.cdp('Input.insertText', { text: 'example.com' });
    await p.key('Enter', 'Enter', 13);
    await sleep(200);
    const st = await p.ev(`(() => { const s = planx.board.get('st'); return s.url + ' ' + s.tc; })()`);
    expect(st, 'an address a browser opens, blue text').toBe('https://example.com blue');
    await p.ev(`window.opened = null; window.open = (u) => { window.opened = u; return null; }`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 375, y: 325, button: 'left', buttons: 1, clickCount: 1, modifiers: 4 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 375, y: 325, button: 'left', buttons: 0, clickCount: 1, modifiers: 4 });
    await sleep(200);
    expect(await p.ev('window.opened'), 'Cmd+click opens it').toBe('https://example.com');
  },

  async 'the board menu starts with "Поделиться", which copies the board\'s address'(p) {
    await p.ev(`window.copied = null; navigator.clipboard.writeText = async (t) => { window.copied = t; }`);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    expect(await p.ev(`document.querySelector('.board-menu .menu-row span').textContent`), 'first in the menu').toBe('Поделиться');
    await p.click(await p.at('.board-menu .menu-row'));
    await sleep(200);
    expect(await p.ev(`window.copied?.includes('?board=')`), 'the board\'s address copied').toBe(true);
  },

  async '"Текст не слипается": Tab goes round the text items going together, Shift+Tab back'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 200);
      b.add(e.newItem('text', x, y, { id: 'a', w: 200, h: 26, text: 'Первый' }));
      b.add(e.newItem('text', x, y + 36, { id: 'b', w: 200, h: 26, text: 'Второй' }));
      b.add(e.newItem('text', x, y + 72, { id: 'c', w: 200, h: 26, text: 'Третий' }));
      b.add(e.newItem('text', x, y + 200, { id: 'far', w: 200, h: 26, text: 'Далеко' }));
      e.setSelection(['a']); e.startEditing('a', null, 'end'); })()`);
    await sleep(200);
    const at = () => p.ev('planx.editor.editingId');
    await p.key('Tab', 'Tab', 9); await sleep(100);
    expect(await at(), 'the next').toBe('b');
    await p.key('Tab', 'Tab', 9); await sleep(100);
    await p.key('Tab', 'Tab', 9); await sleep(100);
    expect(await at(), 'round to the top, not the far one').toBe('a');
    await p.key('Tab', 'Tab', 9, 8); await sleep(100);
    expect(await at(), 'Shift+Tab: back up round to the last').toBe('c');
  },

  async 'a task\'s description typed in has the text panel, its font, list and links; a link in it opens on a click'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('task', 200, 150, { id: 'tk', text: 'Задача', w: 494, h: 52, tv: 'full', keep: true, desc: 'Смотри документацию тут' }));
      e.setSelection(['tk']); e.startEditing('tk', 0, 'end'); })()`);
    await sleep(900);
    expect(await p.ev(`['Жирный', 'Цвет текста', 'Список', 'Ссылка'].every((l) => document.querySelector('.tfmt button[aria-label="' + l + '"]'))`), 'the whole text panel').toBe(true);
    expect(await p.ev(`document.querySelector('.tfmt .fpick')?.textContent.includes('Inter')`), 'its font as drawn').toBe(true);
    await p.click(await p.at('.tfmt button[aria-label="Жирный"]'));
    await sleep(100);
    expect([await p.ev(`planx.board.get('tk').fw`), await p.ev(`getComputedStyle(document.querySelector('textarea.text-edit')).fontWeight`)].join(), 'bold, typed in bold').toBe('700,700');
    await p.ev(`document.querySelector('textarea.text-edit').setSelectionRange(7, 19)`);
    await p.click(await p.at('.tfmt button[aria-label="Ссылка"]'));
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'docs.example.com' });
    await p.key('Enter', 'Enter', 13);
    await sleep(300);
    expect(await p.ev(`JSON.stringify([planx.board.get('tk').text, planx.board.get('tk').links])`), 'on its description').toBe('["Задача",[{"s":7,"e":19,"url":"https://docs.example.com"}]]');
    await p.click(await p.at('.tfmt button[aria-label="Список"]'));
    await sleep(200);
    await p.click(await p.at('.tfmt button[aria-label="Маркированный список"]'));
    await sleep(200);
    expect(await p.ev(`planx.board.get('tk').ls`), 'a list').toBe('bullet');
    await p.ev(`planx.editor.stopEditing(); planx.editor.setSelection([]); window.opened = null; window.open = (u) => { window.opened = u; return null; }`);
    await sleep(300);
    expect(await p.ev(`planx.board.get('tk').h`), 'as tall as it').toBe(await p.ev(`(async () => (await import('/src/canvas/task.ts')).taskLayout(planx.board.get('tk')).h)()`));
    // On "документацию", after its bullet: a click opens it.
    const at = await p.ev(`(async () => { const t = planx.board.get('tk'), l = (await import('/src/canvas/task.ts')).taskLayout(t); const s = planx.editor.toScreen({ x: t.x + l.desc.x + 120, y: t.y + l.desc.y + 9 }); return [s.x, s.y]; })()`);
    await p.click(at);
    await sleep(200);
    expect(await p.ev('window.opened'), 'opened').toBe('https://docs.example.com');
  },

  async '"Ссылка в тексте": a part picked while typing becomes the link, just it blue, Cmd+click on it opens it'(p) {
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 250); planx.board.add(e.newItem('text', x, y, { id: 'tx', w: 400, h: 26, text: 'Смотри документацию тут' })); e.setSelection(['tx']); e.startEditing('tx', null, 'end'); })()`);
    await sleep(900);
    // "документацию" is 7…19.
    await p.ev(`document.querySelector('textarea.text-edit').setSelectionRange(7, 19)`);
    await p.click(await p.at('.tfmt button[aria-label="Ссылка"]'));
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'docs.example.com' });
    await p.key('Enter', 'Enter', 13);
    await sleep(300);
    expect(await p.ev(`JSON.stringify(planx.board.get('tx').links)`), 'just that part').toBe('[{"s":7,"e":19,"url":"https://docs.example.com"}]');
    expect(await p.ev(`planx.board.get('tx').url ?? null`), 'not the whole item').toBe(null);
    await p.ev(`planx.editor.stopEditing(); planx.editor.setSelection([]); window.opened = null; window.open = (u) => { window.opened = u; return null; }`);
    await sleep(300);
    // Typing before it moves it along.
    await p.ev(`planx.editor.startEditing('tx', null, 'end')`);
    await sleep(100);
    await p.ev(`(() => { const t = document.querySelector('textarea.text-edit'); t.setSelectionRange(0, 0); })()`);
    await p.cdp('Input.insertText', { text: 'Ну, ' });
    await p.ev('planx.editor.stopEditing()');
    await sleep(300);
    expect(await p.ev(`JSON.stringify(planx.board.get('tx').links.map((l) => [l.s, l.e]))`), 'moved along').toBe('[[11,23]]');
    const at = await p.ev(`(() => { const e = planx.editor, t = planx.board.get('tx'), c = e.canvas.getContext('2d'); c.font = '400 20px Onest'; const s = e.toScreen({ x: t.x + c.measureText('Ну, Смотри докум').width, y: t.y + 13 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'left', buttons: 1, clickCount: 1, modifiers: 4 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'left', buttons: 0, clickCount: 1, modifiers: 4 });
    await sleep(200);
    expect(await p.ev('window.opened'), 'Cmd+click on the blue part opens it').toBe('https://docs.example.com');
    await p.ev('window.opened = null');
    await p.click(at);
    await sleep(100);
    expect(await p.ev('window.opened'), 'a plain click on it too').toBe('https://docs.example.com');
    await p.ev('window.opened = null; planx.editor.setSelection([])');
    const x0 = await p.ev(`planx.board.get('tx').x`);
    await p.drag(at, [at[0] + 40, at[1] + 30]);
    await sleep(100);
    expect([await p.ev('window.opened'), await p.ev(`planx.board.get('tx').x`) - x0].join(), 'dragged from it, the text moves').toBe(',40');
    await p.ev(`planx.board.update('tx', { x: ${x0}, y: planx.board.get('tx').y - 30 })`);
    await sleep(100);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    expect(await p.ev(`document.querySelector('.context-menu .menu-row span')?.textContent`), 'a right click on it: the way to it first').toBe('Перейти по ссылке');
    await p.ev('window.opened = null');
    await p.click(await p.at('.context-menu .menu-row'));
    expect(await p.ev('window.opened'), 'and it goes there').toBe('https://docs.example.com');
  },

  async '"Объекты": «Добавить в объекты» in a component\'s «…» menu names it and makes it one of «Мои объекты», an instance where it stood; the menu puts more'(p) {
    await p.ev(`(() => { localStorage.removeItem('planx-my-objects'); const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 100, h: 100 })); e.setSelection(['s']); e.makeComponent(); e.stopEditing(); })()`);
    await sleep(200);
    const comp = await p.ev(`planx.board.list().find((i) => i.comp)`);
    // (Its title done being typed in.)
    await p.ev(`planx.editor.stopEditing(); planx.editor.setSelection(['${comp.id}'])`);
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Действия"]'));
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent.includes('Добавить в объекты')).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    expect(await p.ev(`document.querySelector('.confirm p')?.textContent`), 'asked').toBe('Добавить в «Мои объекты»? Он будет в меню «Объекты» на любой доске в этом браузере.');
    await p.ev(`(() => { const i = document.querySelector('.confirm-input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Карточка'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.confirm .btn')].find((b) => b.textContent === 'Добавить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    const c = await p.ev(`planx.board.get('${comp.id}')`);
    expect(`${c.text} ${c.obj} ${!!c.stowed} ${await p.ev(`planx.board.list().filter((i) => i.inst === '${comp.id}').length`)}`, 'named, an object, an instance in its place').toBe('Карточка true true 1');
    await p.click(await p.at('.tools [data-key="objects"]'));
    expect(await p.ev(`[...document.querySelectorAll('.objects-menu > .menu-item > .menu-row span')].map((e) => e.textContent).join(' | ')`), 'the menu').toBe('Таймлайн | Голосование | Канбан | Титул | Мои объекты');
    const mineRow = await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-menu .menu-row')].find((b) => b.textContent === 'Мои объекты').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    const row = await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-mine .menu-row')].find((b) => b.textContent.startsWith('Карточка')).getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; })()`);
    await p.click(row);
    await sleep(200);
    expect(await p.ev(`planx.board.list().filter((i) => i.inst === '${comp.id}').length`), 'another instance from the menu').toBe(2);
    // Dragged out onto the board: put where it's let go.
    await p.click(await p.at('.tools [data-key="objects"]'));
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    await p.drag(row, [700, 500]);
    await sleep(200);
    expect(await p.ev(`(() => { const l = planx.board.list().filter((i) => i.inst === '${comp.id}'), at = l.map((i) => planx.editor.toScreen({ x: i.x + i.w / 2, y: i.y + i.h / 2 })).map((s) => Math.round(s.x) + ',' + Math.round(s.y)); return l.length + ' ' + at.includes('700,500'); })()`), 'dragged onto the board').toBe('3 true');
    // Its cross: off "Мои объекты", once said yes; the board's own still, its instances stay.
    await p.click(await p.at('.tools [data-key="objects"]'));
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    await p.click(await p.at('.objects-mine .menu-x'));
    await sleep(150);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.confirm .btn')].find((b) => b.textContent === 'Удалить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    expect(await p.ev(`(localStorage.getItem('planx-my-objects') ?? '[]') + ' ' + !!planx.board.get('${comp.id}').obj + ' ' + planx.board.list().filter((i) => i.inst === '${comp.id}').length`), 'off the list, its instances there').toBe('[] true 3');
    await p.click(await p.at('.tools [data-key="objects"]'));
    expect(await p.ev(`[...document.querySelectorAll('.objects-menu > .menu-item > .menu-row span')].map((e) => e.textContent).join(' | ')`), 'among the board\'s own now').toBe('Таймлайн | Голосование | Канбан | Титул | Объекты документа');
  },

  async '"Мои объекты" are kept in the browser: put on another board, a copy of the component comes along; another\'s object is kept with «+»'(p) {
    await p.ev(`(() => { localStorage.removeItem('planx-my-objects'); const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 100, h: 100, text: 'Привет' })); e.setSelection(['s']); e.makeComponent(); e.stopEditing();
      const c = b.list().find((i) => i.comp); e.makeObject(c.id, 'Карточка'); })()`);
    expect(await p.ev(`JSON.parse(localStorage.getItem('planx-my-objects')).map((o) => o.name).join()`), 'kept in the browser').toBe('Карточка');
    // Another board: nothing of it there.
    await p.ev(`planx.editor.clearBoard()`);
    await sleep(100);
    expect(await p.ev(`planx.board.list().length`), 'an empty board').toBe(0);
    await p.click(await p.at('.tools [data-key="objects"]'));
    const mineRow = await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-menu .menu-row')].find((b) => b.textContent === 'Мои объекты').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-mine .menu-row')].find((b) => b.textContent.startsWith('Карточка')).getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; })()`));
    await sleep(300);
    const got = await p.ev(`(() => { const l = planx.board.list(), c = l.find((i) => i.comp), insts = l.filter((i) => i.inst === c?.id);
      return [!!c?.stowed, c?.obj, c?.text, insts.length, l.some((i) => i.host === insts[0]?.id && i.text === 'Привет')].join(); })()`);
    expect(got, 'its component put away here, an instance showing what it holds').toBe('true,true,Карточка,1,true');
    // Again: the component that's here now, no second one.
    await p.click(await p.at('.tools [data-key="objects"]'));
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-mine .menu-row')].find((b) => b.textContent.startsWith('Карточка')).getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; })()`));
    await sleep(200);
    expect(await p.ev(`(() => { const l = planx.board.list(); return l.filter((i) => i.comp).length + ' ' + l.filter((i) => i.inst).length; })()`), 'one component, two instances').toBe('1 2');
    // Someone else's object on the board: under "Объекты документа", kept with «+».
    await p.ev(`(() => { const e = planx.editor, b = planx.board; b.add(e.newItem('frame', 900, 300, { id: 'their', comp: true, obj: true, lib: 'elsewhere', text: 'Чужой', w: 200, h: 120, members: [] })); })()`);
    await p.click(await p.at('.tools [data-key="objects"]'));
    const docRow = await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-menu .menu-row')].find((b) => b.textContent === 'Объекты документа').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', ...docRow);
    await sleep(150);
    await p.click(await p.at('.objects-mine .menu-take'));
    await sleep(150);
    expect(await p.ev(`JSON.parse(localStorage.getItem('planx-my-objects')).map((o) => o.name).join()`), 'kept').toBe('Карточка,Чужой');
    expect(await p.ev(`[...document.querySelectorAll('.objects-menu > .menu-item > .menu-row span')].map((e) => e.textContent).join(' | ')`), 'no longer the board\'s own only').toBe('Таймлайн | Голосование | Канбан | Титул | Мои объекты');
    await p.ev(`localStorage.removeItem('planx-my-objects')`);
  },

  async '"Объекты": a sticker, a shape and a task resized on a timeline go to whole and half days'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.addTimeline({ x: 600, y: 400 }); })()`);
    const tl = await p.ev(`(() => { const t = planx.board.list().find((i) => i.tl); return { x: t.x, y: t.y }; })()`);
    for (const [type, w, h] of [['sticky', 100, 100], ['rect', 100, 60], ['task', 200, 52]]) {
      const id = await p.ev(`(() => { const e = planx.editor, it = e.newItem('${type}', ${tl.x} + 19 + 23 * 3, ${tl.y} + 60, { w: ${w}, h: ${h} }); planx.board.add(it); e.setSelection([it.id]); return it.id; })()`);
      await sleep(300);
      const c = await p.ev(`(() => { const it = planx.board.get('${id}'), s = planx.editor.toScreen({ x: it.x + it.w, y: it.y + it.h }); return [s.x - 1, s.y - 1]; })()`);
      await p.drag(c, [c[0] + 37, c[1] + 5]);
      const off = await p.ev(`(() => { const it = planx.board.get('${id}'); return (it.x + it.w - ${tl.x} - 19) / 11.5; })()`);
      expect(Math.abs(off - Math.round(off)) < 1e-6, `${type}: its right side on a half day (${off})`).toBe(true);
      await p.ev(`planx.board.remove(['${id}'])`);
    }
  },

  async '"Объекты": a timeline dragged off the menu onto the board is put there'(p) {
    await p.click(await p.at('.tools [data-key="objects"]'));
    await p.drag(await p.at('.objects-menu .menu-row'), [700, 450], { steps: 16 });
    await sleep(200);
    expect(await p.ev(`planx.board.list().filter((i) => i.tl).length`), 'one put').toBe(1);
    expect(await p.ev(`!!document.querySelector('.objects-menu')`), 'the menu gone').toBe(false);
  },

  async '"Объекты": the rail button opens the menu, a timeline is put with a click, holds what is put on it, in half days'(p) {
    await p.click(await p.at('.tools [data-key="objects"]'));
    expect(await p.ev(`document.querySelector('.objects-menu .menu-row span')?.textContent`), 'the menu').toBe('Таймлайн');
    await p.click(await p.at('.objects-menu .menu-row'));
    expect(await p.ev('planx.editor.tool'), 'its tool').toBe('timeline');
    await p.click([600, 400]);
    const tl = await p.ev(`(() => { const t = planx.board.list().find((i) => i.tl); return t && { id: t.id, x: t.x, y: t.y, w: t.w, tl: t.tl }; })()`);
    expect(tl.tl, 'from the first of this month').toBe(new Date().toISOString().slice(0, 7) + '-01');
    // A sticker dragged on: in half days from its start, and it goes along with it.
    await p.ev(`(() => { const e = planx.editor; planx.board.add(e.newItem('sticky', ${tl.x} + 400, ${tl.y} - 120, { id: 'st', w: 60, h: 60 })); e.setSelection([]); })()`);
    const st = await p.ev(`(() => { const s = planx.editor.toScreen({ x: ${tl.x} + 430, y: ${tl.y} - 90 }); return [s.x, s.y]; })()`);
    await p.drag(st, [st[0] + 7, st[1] + 180]);
    const off = await p.ev(`(planx.board.get('st').x - ${tl.x} - 19) / 11.5`);
    expect(Math.abs(off - Math.round(off)) < 1e-6, `on a half day (${off})`).toBe(true);
    expect(await p.ev(`planx.board.get('${tl.id}').members.includes('st')`), 'held by it').toBe(true);
    // Its left side moved two days on: it starts two days later, there, what's on it staying.
    const stX = await p.ev(`planx.board.get('st').x`);
    await p.ev(`(() => { const e = planx.editor, t = planx.board.get('${tl.id}'); e.cam = { x: 200 - t.x * 0.5, y: 300 - t.y * 0.5, z: 0.5 }; e.camChanged(); e.setSelection(['${tl.id}']); })()`);
    await sleep(100);
    const left = await p.ev(`(() => { const t = planx.board.get('${tl.id}'), s = planx.editor.toScreen({ x: t.x + 1, y: t.y + t.h / 4 }); return [s.x, s.y]; })()`);
    await p.mouse('mouseMoved', left[0], left[1]);
    await sleep(100);
    expect(await p.ev('planx.editor.canvas.style.cursor'), 'its left side').toBe('ew-resize');
    await p.drag(left, [left[0] + 23, left[1]]);
    const now = await p.ev(`(() => { const t = planx.board.get('${tl.id}'); return { x: t.x, w: t.w, tl: t.tl }; })()`);
    expect(now.x - tl.x, 'two days on').toBe(46);
    expect(now.w, 'two days shorter').toBe(tl.w - 46);
    expect(now.tl.slice(8), 'from the third').toBe('03');
    expect(await p.ev(`planx.board.get('st').x`), 'what is on it stays').toBe(stX);
  },

  async '"Меню по правому клику": a frame\'s «Переименовать» types its title in at once'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('frame', 300, 200, { id: 'f', w: 400, h: 300, text: 'Фрейм', members: [] })); e.setSelection([]); })()`);
    await sleep(200);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 350 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 350, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 350, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Переименовать').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    expect(await p.ev(`[planx.editor.editingId, document.activeElement?.classList.contains('text-edit'), document.activeElement?.value].join()`), 'its title typed in').toBe('f,true,Фрейм');
    await p.key('Escape', 'Escape', 27);
    // An instance (its component put away): its component's name, all its instances with it.
    await p.ev(`(() => { const e = planx.editor; planx.board.add(e.newItem('sticky', 900, 250, { id: 's', w: 160, h: 160 })); e.setSelection(['s']); e.makeComponent(); e.stopEditing(); })()`);
    await sleep(300);
    const comp = await p.ev(`planx.board.list().find((i) => i.comp).id`);
    await p.ev(`(() => { planx.editor.finishComponent(); })()`);
    await sleep(300);
    const inst = await p.ev(`planx.board.list().find((i) => i.inst === '${comp}')?.id`);
    await p.ev(`(() => { const e = planx.editor; e.setSelection(['${inst}']); e.startEditing('${inst}', null, 'all'); })()`);
    await sleep(200);
    await p.ev(`(() => { const t = document.querySelector('.text-edit'); t.value = 'Карточка'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await p.key('Enter', 'Enter', 13);
    await sleep(300);
    expect(await p.ev(`[planx.board.get('${comp}').text, planx.board.get('${inst}').text].join()`), 'the instance renamed: its component').toBe('Карточка,Карточка');
  },

  async '"Меню по правому клику": a right click picks what is under it and opens the menu; its rows do what they say'(p) {
    await stickers(p);
    await p.ev('planx.editor.setSelection([])');
    const a = await p.ev(`(() => { const i = planx.board.list().find((x) => x.text === 'Купить молоко'), s = planx.editor.toScreen({ x: i.x + 40, y: i.y + 40 }); return [s.x, s.y, i.id]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0], y: a[1] });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a[0], y: a[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    expect(await p.ev('[...planx.editor.selection].join()'), 'picked').toBe(a[2]);
    expect(await p.ev(`[...document.querySelectorAll('.context-menu .menu-row span')].map((s) => s.textContent).join(', ')`), 'its rows')
      .toBe('Параметры, Комментарий, Ссылка на объект, Скопировать, Переместить вверх, Переместить вниз, Сделать компонентом, Скрыть объект, Удалить');
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Удалить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`planx.board.get('${a[2]}') ?? null`), 'deleted').toBe(null);
    expect(await p.ev(`document.querySelectorAll('.context-menu').length`), 'and the menu gone').toBe(0);
  },

  async '"Линии": the rail tool links any item to any other; a line dragged by its middle goes to another item'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 300);
      b.add(e.newItem('sticky', x, y, { id: 'a', w: 100, h: 100 }));
      b.add(e.newItem('sticky', x + 400, y, { id: 'b', w: 100, h: 100 }));
      b.add(e.newItem('sticky', x + 400, y + 250, { id: 'c', w: 100, h: 100 }));
      e.setSelection([]); })()`);
    // On a short screen it's under "more".
    if (!(await p.rect('.tools [data-key="lines"]'))) await p.click(await p.at('.tools > button[aria-label="Ещё"]'));
    await p.click(await p.at('[data-key="lines"], [data-more-key="lines"]'));
    expect(await p.ev('planx.editor.tool'), 'the line tool').toBe('link');
    await p.drag([350, 350], [750, 350]);
    const l = await p.ev(`(() => { const l = planx.board.linkList()[0]; return l && { id: l.id, from: l.from, to: l.to }; })()`);
    expect(`${l.from}>${l.to}`, 'from one to the other').toBe('a>b');
    // A click on its middle picks it, nothing else.
    await p.click([550, 350]);
    expect(await p.ev('[...planx.editor.selection].join()'), 'picked').toBe(l.id);
    expect(await p.ev(`planx.board.getLink('${l.id}').to`), 'still to the same').toBe('b');
    expect(await p.ev('planx.editor.canvas.style.cursor') !== 'grab', 'no hand over its middle').toBe(true);
    // Dragged by its line (off its middle, where a new node would be pulled out) onto another.
    await p.drag([450, 350], [750, 600]);
    expect(await p.ev(`planx.board.getLink('${l.id}').to`), 'to the other now').toBe('c');
    // Dragged by its line onto nothing: it's gone, as by its head.
    const mid = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), sh = g.linkShape(planx.board.getLink('${l.id}'), (id) => planx.board.get(id));
      const m = sh.pts[Math.floor(sh.pts.length / 3)], s = planx.editor.toScreen(m); return [s.x, s.y]; })()`);
    await p.click(mid);
    expect(await p.ev('[...planx.editor.selection].join()'), 'on its line').toBe(l.id);
    // (With «Линия в пустоту» off: on, it stays, that end at a point there.)
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('lineEnd', false))()`);
    await p.drag(mid, [1000, 150]);
    expect(await p.ev(`planx.board.getLink('${l.id}') ?? null`), 'let go on nothing: gone').toBe(null);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('lineEnd', true))()`);
  },

  async '"Меню по правому клику": a central topic\'s parameters have «Цвет» (its strip) and «Конфигурация» (the ways it grows)'(p) {
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(400, 300); planx.board.add(e.newItem('mind', x, y, { id: 'm', w: 160, h: 48, text: 'Тема' })); e.setSelection(['m']); })()`);
    await sleep(200);
    const at = await p.ev(`(() => { const i = planx.board.get('m'), s = planx.editor.toScreen({ x: i.x + 80, y: i.y + 24 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at[0], y: at[1] });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent.includes('Параметры')).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    expect(await p.ev(`[...document.querySelectorAll('.params-tabs button')].map((b) => b.textContent).join()`), 'its tabs').toBe('Цвет,Конфигурация');
    await p.click(await p.at('.params-pop button[aria-label="Цвет: #30A46C"]'));
    expect(await p.ev(`planx.board.get('m').color`), 'its colour').toBe('#30A46C');
    await p.click(await p.at('.params-tabs button:nth-child(2)'));
    await sleep(100);
    expect(await p.ev(`[...document.querySelectorAll('.params-pop .menu-row')].map((b) => b.textContent + ':' + b.getAttribute('aria-checked')).join()`), 'right only at first')
      .toBe('Вправо:true,Влево:false,Вверх:false,Вниз:false,Передвигать вручную:false,Боковая полоса:false,Бэкграунд:true,Круглые края:true');
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.params-pop .menu-row')].find((b) => b.textContent === 'Вверх').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`JSON.stringify(planx.board.get('m').mw)`), 'up too').toBe('["right","up"]');
    // (No strip with round ends, as a new one has them: its card alone switched off.)
    for (const label of ['Бэкграунд']) await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.params-pop .menu-row')].find((b) => b.textContent === '${label}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect([await p.ev(`planx.board.get('m').mns`), await p.ev(`planx.board.get('m').mnb`)].join(), 'no strips, no cards: the text alone').toBe('true,true');
  },

  async '"Меню по правому клику" on the board: zoom to 100%, paste there; on a rectangle, its parameters'(p) {
    const right = async ([x, y]) => {
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
      await sleep(200);
    };
    const rows = () => p.ev(`[...document.querySelectorAll('.context-menu .menu-row span')].map((s) => s.textContent).join(', ')`);
    const pick = async (label) => p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent.includes('${label}')).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await p.ev(`(() => { const e = planx.editor; e.zoomCenter(0.5 / e.cam.z); e.setSelection([]); })()`);
    await right([900, 600]);
    expect(await rows(), 'nothing copied: the zoom, a comment').toBe('Масштаб 100%, Комментарий');
    await pick('Масштаб 100%');
    expect(await p.ev('planx.editor.cam.z'), 'at 100%').toBe(1);
    // A rectangle: its parameters.
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 300); planx.board.add(e.newItem('rect', x, y, { id: 'r', w: 200, h: 120, text: 'Фигура' })); })()`);
    const r = await p.ev(`(() => { const i = planx.board.get('r'), s = planx.editor.toScreen({ x: i.x + 30, y: i.y + 30 }); return [s.x, s.y]; })()`);
    await right(r);
    expect(await rows(), 'parameters first').toBe('Параметры, Комментарий, Ссылка на объект, Скопировать, Переместить вверх, Переместить вниз, Сделать компонентом, Скрыть объект, Удалить');
    await pick('Параметры');
    expect(await p.ev(`!!document.querySelector('.params-pop .params-colors')`), 'the popup: colours').toBe(true);
    // In a small window what's in it scrolls inside: the popup itself stays, and its glass with it.
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 300, deviceScaleFactor: 1, mobile: false });
    await sleep(100);
    const short = await p.ev(`(() => { const h = document.querySelector('.params-pop'), b = h.querySelector('.params-body'); return [h.scrollHeight <= h.clientHeight, b.scrollHeight > b.clientHeight].join(); })()`);
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(100);
    expect(short, 'scrolls inside, not itself').toBe('true,true');
    await p.click(await p.at('.params-pop button[aria-label="Заливка: pink"]'));
    expect(await p.ev(`document.querySelector('.params-pop button[aria-label="Обводка: ink"]') !== null`), 'its outline too').toBe(true);
    expect(await p.ev(`document.querySelector('.params-pop button[aria-label="Жирный"]') !== null`), 'its text as the text panel sets it').toBe(true);
    await p.ev(`(() => { const i = document.querySelector('.params-pop input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '24'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(100);
    expect(await p.ev(`planx.board.get('r').color + ' ' + planx.board.get('r').rad`), 'its colour and rounding').toBe('pink 24');
    await p.key('Escape', 'Escape', 27);
    // Copied, then pasted where the board was right-clicked.
    await p.ev(`planx.editor.setSelection(['r']); planx.editor.copy(); planx.editor.setSelection([])`);
    await right([900, 500]);
    expect(await rows(), 'with something copied').toBe('Масштаб 100%, Вставить, Комментарий');
    await pick('Вставить');
    const pasted = await p.ev(`(() => { const i = planx.board.list().find((x) => x.type === 'rect' && x.id !== 'r'), s = planx.editor.toScreen({ x: i.x + i.w / 2, y: i.y + i.h / 2 }); return [Math.round(s.x), Math.round(s.y)]; })()`);
    expect(Math.abs(pasted[0] - 900) <= 1 && Math.abs(pasted[1] - 500) <= 1, `pasted there (${pasted})`).toBe(true);
  },

  async '"Меню по правому клику" on nothing, with something picked: the menu of what\'s picked, still picked; with nothing picked, the board\'s'(p) {
    const right = async ([x, y]) => {
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
      await sleep(200);
    };
    const label = () => p.ev(`document.querySelector('.context-menu')?.getAttribute('aria-label') ?? ''`);
    const { a, c } = await stickers(p);
    const empty = [1000, 650];
    for (const ids of [[a], [a, c]]) {
      await p.ev(`planx.editor.setSelection(${JSON.stringify(ids)})`);
      await right(empty);
      expect(await label(), 'what\'s picked').toBe('Действия с выделенным');
      expect(await p.ev(`[...planx.editor.selection].join()`), 'still picked').toBe(ids.join());
      await p.escape();
      await sleep(100);
    }
    const l = await p.ev(`(() => { const b = planx.board, l = { id: 'l1', from: '${a}', to: '${c}', style: 'straight' }; b.addLink(l); planx.editor.setSelection(['l1']); return l.id; })()`);
    await right(empty);
    expect(await label(), 'a line picked: the line\'s').toBe('Линия');
    expect(await p.ev(`[...planx.editor.selection].join()`), 'still picked').toBe(l);
    await p.escape();
    await sleep(100);
    await p.ev(`planx.editor.setSelection([])`);
    await right(empty);
    expect(await label(), 'nothing picked: the board\'s').toBe('Доска');
    await p.escape();
    await sleep(100);
  },

  async '"Линии": with the line tool, any item under the pointer shows its dots, a mind map node too, and a line goes from the one pressed'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 300);
      b.add(e.newItem('mind', x, y, { id: 'm', w: 200, h: 56, text: 'Тема' }));
      b.add(e.newItem('sticky', x + 500, y - 50, { id: 's', w: 120, h: 120 }));
      e.setSelection([]); e.setTool('link'); })()`);
    await p.mouse('mouseMoved', 400, 328);
    await sleep(100);
    expect(await p.ev('planx.editor.linkDots'), 'its dots show').toBe('m');
    const dot = await p.ev(`(() => { const m = planx.board.get('m'), s = planx.editor.toScreen({ x: m.x + m.w + 12, y: m.y + m.h / 2 }); return [s.x, s.y]; })()`);
    await p.mouse('mouseMoved', dot[0], dot[1]);
    await sleep(100);
    expect(await p.ev('planx.editor.linkDots + " " + planx.editor.hotDot'), 'still, on its right dot').toBe('m right');
    await p.drag(dot, [860, 310]);
    const l = await p.ev(`(() => { const l = planx.board.linkList()[0]; return l && l.from + '>' + l.to + ' ' + l.fromSide; })()`);
    expect(l, 'from that dot to the sticker').toBe('m>s right');
  },

  async '"Параметры" of several picked, an instance by what is in it: each under its name, with its opacity'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 300);
      b.add(e.newItem('sticky', x, y, { id: 's', w: 100, h: 100 }));
      b.add(e.newItem('text', x + 150, y, { id: 't', w: 150, text: 'Подпись' }));
      b.add(e.newItem('frame', x - 900, y, { id: 'comp', comp: true, w: 300, h: 200, members: ['cr', 'ct'], text: 'Карточка' }));
      b.add(e.newItem('rect', x - 880, y + 20, { id: 'cr', w: 200, h: 100 }));
      b.add(e.newItem('text', x - 870, y + 30, { id: 'ct', w: 180, text: 'Что надо сделать' }));
      b.add(e.newItem('frame', x + 400, y, { id: 'in', inst: 'comp', w: 300, h: 200, members: [] })); })()`);
    await sleep(300);
    await p.ev(`planx.editor.setSelection(['s', 't', 'in'])`);
    await sleep(200);
    const at = await p.ev(`(() => { const i = planx.board.get('s'), s = planx.editor.toScreen({ x: i.x + 30, y: i.y + 30 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Параметры').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    const titles = await p.ev(`[...document.querySelectorAll('.params-pop .params-title')].map((t) => t.textContent).join(' | ')`);
    expect(titles, 'each, the instance by what is in it').toBe('Заметка | Текст «Подпись» | Прямоугольник | Текст 1 «Что надо сделать»');
    expect(await p.ev(`[...document.querySelectorAll('.params-pop .params-item')].map((i) => i.querySelectorAll('input[type=range]').length).join()`), 'an opacity for each colour (no text yet, no text colour)')
      .toBe('1,1,2,1');
    await p.ev(`(() => { const r = document.querySelectorAll('.params-pop input[type=range]')[0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '50'); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    expect(await p.ev(`planx.board.get('s').fo`), 'the sticker half see-through').toBe(0.5);
  },

  async '"Параметры" of a line: colour, opacity, dashes, its arrowheads at the start and the end'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 200, 300, { id: 'a', w: 100, h: 100 }));
      b.add(e.newItem('sticky', 700, 300, { id: 'b', w: 100, h: 100 }));
      b.addLink({ id: 'L', from: 'a', to: 'b', style: 'straight' }); e.setSelection([]); })()`);
    await sleep(200);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 350, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 350, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    expect(await p.ev(`[...document.querySelectorAll('.context-menu .menu-row span')].map((s) => s.textContent).join(', ')`), 'its menu').toBe('Параметры, Удалить');
    await p.click(await p.at('.context-menu .menu-row'));
    await p.click(await p.at('.params-pop button[aria-label="Цвет: red"]'));
    await p.ev(`(() => { const r = document.querySelector('.params-pop input[type=range]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '60'); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const row = async (label) => p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.params-pop .menu-row')].find((b) => b.textContent === '${label}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await row('Пунктир');
    await row('Стрелка в начале');
    await row('Стрелка в конце');
    const l = await p.ev(`JSON.stringify((({ color, lo, dash, heads }) => ({ color, lo, dash, heads }))(planx.board.getLink('L')))`);
    expect(l, 'red, 60%, dashed, a head at its start only').toBe('{"color":"red","lo":0.6,"dash":true,"heads":"start"}');
  },

  async '"Комментарии": put by a right click on an item, it goes with it; opened, solved, answered once; its own removed'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 150, h: 150 })); e.setSelection([]); })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 340, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 340, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Комментарий').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'Проверить сроки' });
    await p.key('Enter', 'Enter', 13);
    await sleep(200);
    const stored = () => p.ev(`(async () => { const c = await import('/src/labs/comments.ts'); return c.comments(planx.board); })()`);
    let [c] = await stored();
    expect(`${c.text} ${c.on} ${c.dx},${c.dy}`, 'on the sticker, where clicked').toBe('Проверить сроки s 100,40');
    expect(await p.ev(`document.querySelectorAll('.comment-pin').length`), 'its pin').toBe(1);
    // The sticker moved: the pin with it.
    await p.ev(`planx.board.update('s', { x: 400 })`);
    await sleep(200);
    const pin = await p.ev(`(() => { const r = document.querySelector('.comment-pin').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.bottom)]; })()`);
    expect(pin.join(), 'pin went along').toBe('500,340');
    // Dragged off it, onto the empty board: pinned there; back onto it: on it again (nothing picked, so
    // no panel over it).
    await p.ev('planx.editor.setSelection([])');
    await sleep(200);
    await p.drag([515, 325], [815, 225]);
    [c] = await stored();
    expect(`${c.on ?? 'board'} ${c.x},${c.y}`, 'on the board where let go').toBe('board 800,240');
    expect(await p.ev(`document.querySelectorAll('.comment-card').length`), 'dragged: still open as it was, not toggled').toBe(1);
    await p.drag([815, 225], [515, 325]);
    [c] = await stored();
    expect(`${c.on} ${c.dx},${c.dy}`, `on the sticker again (${JSON.stringify(c)})`).toBe('s 100,40');
    // Solved, answered.
    await p.click(await p.at('.comment-card .comment-solve'));
    await p.click(await p.at('.comment-card .comment-answer'));
    await p.cdp('Input.insertText', { text: 'Сделано' });
    await p.key('Enter', 'Enter', 13);
    await sleep(200);
    [c] = await stored();
    expect(`${c.done} ${c.reply?.text}`, 'ticked, answered').toBe('true Сделано');
    expect(await p.ev(`document.querySelectorAll('.comment-answer').length`), 'once only').toBe(0);
    // Its own: removed.
    await p.click(await p.at('.comment-card .comment-more'));
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.comment-menu button')].find((b) => b.textContent === 'Удалить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect((await stored()).length, 'gone').toBe(0);
  },

  async '"Зум рамкой": with Z held any tool gives way to it, a box zooms and a double click shows all; Z let go, the tool\'s back'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 150, h: 150 })); e.setSelection([]); })()`);
    const z = (type) => p.cdp('Input.dispatchKeyEvent', { type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    for (const tool of ['rect', 'pen', 'hand', 'sticky', 'eraser']) {
      await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('${tool}'); })()`);
      const n = await p.ev(`planx.board.list().length`);
      await z('keyDown');
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 600 });
      expect(await p.ev(`getComputedStyle(planx.editor.canvas).cursor`), `${tool}: the magnifier`).toBe('zoom-in');
      await p.drag([250, 250], [500, 500]);
      await sleep(550);
      expect(await p.ev(`planx.board.list().length`), `${tool}: nothing made or rubbed out`).toBe(n);
      expect(await p.ev(`planx.editor.cam.z > 1.5`), `${tool}: zoomed to the box`).toBe(true);
      await p.click([1000, 650]); await p.click([1000, 650]);
      await sleep(100);
      expect(await p.ev(`Math.round(planx.editor.toScreen({ x: 375, y: 375 }).x) > 0 && planx.editor.toScreen({ x: 375, y: 375 }).x < 1200 && planx.editor.toScreen({ x: 375, y: 375 }).y < 800`), `${tool}: a double click, all in view`).toBe(true);
      expect(await p.ev(`planx.board.list().length`), `${tool}: and nothing made by it`).toBe(n);
      await z('keyUp');
      expect(await p.ev(`planx.editor.tool`), `${tool}: Z let go, back`).toBe(tool);
      expect(await p.ev(`getComputedStyle(planx.editor.canvas).cursor !== 'zoom-in'`), `${tool}: no magnifier`).toBe(true);
    }
    // And it works as itself again.
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('rect'); })()`);
    await p.drag([600, 300], [800, 500]);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'rect').length`), 'a rectangle').toBe(1);
  },

  async '"Зум рамкой": a box drawn with Z held fills the screen, nothing picked'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 150, h: 150 })); e.setSelection([]); })()`);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    // The magnifier all along, over the sticker too, with the pointer just moved.
    const cur = [];
    for (const [x, y] of [[200, 200], [370, 370], [380, 380]]) {
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      cur.push(await p.ev(`getComputedStyle(planx.editor.canvas).cursor`));
    }
    expect(cur.join(), 'the magnifier only').toBe('zoom-in,zoom-in,zoom-in');
    await p.drag([250, 250], [450, 450]);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await sleep(600);
    expect(await p.ev(`getComputedStyle(planx.editor.canvas).cursor !== 'zoom-in'`), 'Z let go: no magnifier').toBe(true);
    const r = await p.ev(`(() => { const a = planx.editor.toScreen({ x: 250, y: 250 }), b = planx.editor.toScreen({ x: 450, y: 450 }), W = planx.editor.canvas.clientWidth, H = planx.editor.canvas.clientHeight;
      return [Math.round(Math.min(W / (b.x - a.x), H / (b.y - a.y)) * 100) / 100, Math.round((a.x + b.x) / 2 - W / 2), Math.round((a.y + b.y) / 2 - H / 2), planx.editor.selection.size].join(); })()`);
    expect(r, 'the box fills the screen, centred, nothing picked').toBe('1,0,0,0');
    // On the way, the box's middle only comes nearer the screen's, never off to a side and back.
    const off = await p.ev(`(async () => { const e = planx.editor, z = await import('/src/labs/zoomBox.ts');
      e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); const W = e.canvas.clientWidth / 2, H = e.canvas.clientHeight / 2;
      z.zoomToBox(e, { x: 250, y: 250, w: 200, h: 200 }); const pts = [];
      await new Promise((done) => { const t = () => { const c = e.toScreen({ x: 350, y: 350 }); pts.push(c); if (pts.length < 40) requestAnimationFrame(t); else done(); }; t(); });
      const d = pts.map((c) => Math.hypot(c.x - W, c.y - H));
      return Math.max(0, ...d.slice(1).map((v, i) => v - d[i])); })()`);
    expect(off < 0.5, `only nearer and nearer (once ${off.toFixed(1)}px further)`).toBe(true);
    // Z held, a double click even on the sticker: all of the board in view.
    await sleep(500);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: -600, y: -600, z: 3 }; e.camChanged(); })()`);
    const on = await p.ev(`(() => { const s = planx.editor.toScreen({ x: 375, y: 375 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await p.click(on); await p.click(on);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await sleep(600);
    expect(await p.ev(`(() => { const e = planx.editor, a = e.toScreen({ x: 300, y: 300 }), b = e.toScreen({ x: 450, y: 450 }); return a.x > 0 && a.y > 0 && b.x < e.canvas.clientWidth && b.y < e.canvas.clientHeight && e.cam.z < 3 && e.selection.size === 0; })()`), 'all in view, nothing picked').toBe(true);
  },

  async 'the board cleared takes its comments too; one Ctrl+Z brings both back'(p) {
    const n = () => p.ev(`(async () => { const c = await import('/src/labs/comments.ts'); return c.comments(planx.board).length; })()`);
    await p.ev(`(async () => { const c = await import('/src/labs/comments.ts'), e = planx.editor, b = planx.board;
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 150, h: 150 })); c.addComment(b, { x: 50, y: 50 }, undefined, 'Раз', 'Кот'); })()`);
    expect(await n(), 'put').toBe(1);
    await p.ev('planx.editor.clearBoard()');
    expect(`${await n()} ${await p.ev('planx.board.list().length')}`, 'cleared').toBe('0 0');
    await p.ev('planx.editor.undo()');
    expect(`${await n()} ${await p.ev('planx.board.list().length')}`, 'back').toBe('1 1');
  },

  async 'lines picked together by a box take their parameters together, by a right click or from the selection panel'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 100, 100, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('sticky', 500, 100, { id: 'b', w: 100, h: 100 }));
      b.add(e.newItem('sticky', 100, 350, { id: 'c', w: 100, h: 100 })); b.add(e.newItem('sticky', 500, 350, { id: 'd', w: 100, h: 100 }));
      b.addLink({ id: 'L1', from: 'a', to: 'b', style: 'straight' }); b.addLink({ id: 'L2', from: 'c', to: 'd', style: 'straight' }); e.setSelection([]); })()`);
    await p.drag([260, 90], [440, 460]);
    expect(await p.ev('[...planx.editor.selection].sort().join()'), 'both by a box').toBe('L1,L2');
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 350, y: 150, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 350, y: 150, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    expect(await p.ev('[...planx.editor.selection].sort().join()'), 'still both').toBe('L1,L2');
    await p.click(await p.at('.context-menu .menu-row'));
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.params-pop .menu-row')].find((b) => b.textContent === 'Пунктир').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`planx.board.linkList().map((l) => !!l.dash).join()`), 'both dashed').toBe('true,true');
    await p.key('Escape', 'Escape', 27);
    await p.ev(`planx.editor.setSelection(['L1', 'L2'])`);
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Цвет и стрелки линий"]'));
    await p.click(await p.at('.palette-pop button[aria-label="Цвет: green"]'));
    expect(await p.ev(`planx.board.linkList().map((l) => l.color).join()`), 'both green from the panel').toBe('green,green');
    expect(await p.ev(`planx.editor.linksAsThey`), 'drawn in their colour, not blue, meanwhile').toBe(true);
    await p.click(await p.at('.bar.panel button[aria-label="Цвет и стрелки линий"]'));
    await sleep(100);
    expect(await p.ev(`planx.editor.linksAsThey`), 'blue again once closed').toBe(false);
  },

  async '"Аудиозвонок": those who press the call button hear each other; the fourth asks in, someone in it lets them in'(p) {
    const url = await p.ev('location.href');
    const [q, r, t] = [await openTab(url), await openTab(url), await openTab(url)];
    await sleep(2500);
    // (A button in the popup, or the call button, pressed in a tab.)
    const press = (x, text) => x.ev(`(() => { const b = ${JSON.stringify(text)} ? [...document.querySelectorAll('.call-pop .btn')].find((b) => b.textContent === ${JSON.stringify(text)}) : document.querySelector('.call-btn'); b?.click(); return !!b; })()`);
    const lines = (x) => x.ev(`[...document.querySelectorAll('.call-people li')].map((l) => l.classList.contains('joining') ? 'joining' : 'up').join()`);
    for (const x of [p, q, r]) { await press(x, ''); await sleep(1200); }
    await sleep(3000);
    expect(await lines(p), 'three in it, the lines up').toBe('up,up,up');
    await press(t, '');
    await sleep(500);
    expect(await t.ev(`document.querySelector('.call-pop p')?.textContent`), 'the fourth: it is full').toBe('В звонке уже 3 человека');
    await press(t, 'Попроситься');
    await sleep(1000);
    expect(await p.ev(`!!document.querySelector('.call-ask p')?.textContent.endsWith('хочет присоединиться')`), 'asked in: those in it see it').toBe(true);
    await press(p, 'Пустить');
    await sleep(5000);
    expect(await p.ev(`document.querySelector('.call-count')?.textContent`), 'let in: four in it').toBe('4');
    expect(await lines(t), 'its lines up').toBe('up,up,up,up');
    for (const x of [q, r, t]) await x.close();
  },

  async '"Замена двойным кликом": an emoji, or a frame with one in it, picked: a flag first on the panel, a click there its neighbours'(p) {
    const ids = await p.ev(`(() => { const e = planx.editor, b = planx.board; const m = e.newItem('emoji', 40, 40, { w: 64, h: 64, emoji: 'emoji-u1f600' }); b.add(m); const i = e.newItem('icon', 140, 40, { w: 64, h: 64, icon: 'kanban' }); b.add(i); const f = e.newItem('frame', 0, 0, { w: 120, h: 120, members: [m.id] }); b.add(f); e.setSelection([m.id]); return [m.id, i.id, f.id]; })()`);
    await sleep(400);
    expect(await p.ev(`!!document.querySelector('button[aria-label="Заменить"]')`), 'the emoji: the flag').toBe(true);
    await p.ev(`planx.editor.setSelection(['${ids[0]}', '${ids[1]}'])`);
    await sleep(400);
    expect(await p.ev(`!!document.querySelector('button[aria-label="Заменить"]')`), 'two: none').toBe(false);
    await p.ev(`planx.editor.setSelection(['${ids[2]}'])`);
    await sleep(400);
    await p.click(await p.at('button[aria-label="Заменить"]'));
    await sleep(400);
    expect(await p.ev(`!!document.querySelector('.emoji-grid')`), 'the frame\'s emoji\'s neighbours').toBe(true);
  },

  async '"Чекбокс у задачи": «Чекбокс» unticked in a task\'s menu, no ring, its title and what\'s under it in its place'(p) {
    const id = await p.ev(`(() => { const e = planx.editor, b = planx.board; const t = e.newItem('task', 0, 0, { w: 293, h: 52, text: 'Задача' }); b.add(t); e.cam = { x: 400, y: 300, z: 1 }; e.camChanged(); return t.id; })()`);
    await sleep(200);
    const title = () => p.ev(`(async () => { const k = await import('/src/canvas/task.ts'); return k.taskLayout(planx.board.get('${id}')).title.x; })()`);
    expect(await title(), 'after its ring').toBe(47);
    await p.ev(`planx.board.update('${id}', { nck: true })`);
    await sleep(200);
    expect(await title(), 'in its ring\'s place, 4 in').toBe(19);
    // (What's under its header from there too: its description.)
    await p.ev(`planx.board.update('${id}', { tv: 'full', desc: 'Описание' })`);
    await sleep(200);
    expect(await p.ev(`(async () => { const k = await import('/src/canvas/task.ts'); return k.taskLayout(planx.board.get('${id}')).desc.x; })()`), 'its description under its title').toBe(19);
    expect(await p.ev(`(async () => { const k = await import('/src/canvas/task.ts'); return k.taskPartAt(planx.board.get('${id}'), { x: 26, y: 26 }) === 'status'; })()`), 'no ring to click').toBe(false);
  },

  async '"Длительности на таймлайне": a task and a rectangle keep their days as its step changes, a sticker its day and size; a task too narrow, a bar'(p) {
    // On a timeline at 6x: a task its 3rd to 5th day (2 days), a rectangle its 4th (1 day), a sticker its 2nd.
    const ids = await p.ev(`(() => { const e = planx.editor, b = planx.board; e.addTimeline({ x: 0, y: 0 }); const t = b.list().find((i) => i.tl); e.setTimelineStep(t.id, 6);
      const from = t.x + 19, top = t.y + 60, d = 138;
      const task = e.newItem('task', from + 2 * d, top, { w: 2 * d, h: 52, text: 'Задача' }); b.add(task);
      const r = e.newItem('rect', from + 3 * d, top + 80, { w: d, h: 60 }); b.add(r);
      const s = e.newItem('sticky', from + d, top + 160, { w: 100, h: 100 }); b.add(s);
      b.update(t.id, { members: [task.id, r.id, s.id] }); return { t: t.id, task: task.id, r: r.id, s: s.id, from }; })()`);
    const at = () => p.ev(`JSON.stringify(['${ids.task}', '${ids.r}', '${ids.s}'].map((id) => { const i = planx.board.get(id); return [Math.round((i.x - ${ids.from}) * 10) / 10, i.w]; }))`);
    await p.ev(`planx.editor.setTimelineStep('${ids.t}', 1)`);
    expect(await at(), 'at 1x: the task 2 days, the rectangle 1, the sticker as big').toBe(JSON.stringify([[46, 46], [69, 23], [23, 100]]));
    expect(await p.ev(`(async () => (await import('/src/canvas/task.ts')).compactTask(planx.board.get('${ids.task}')))()`), 'the task a bar').toBe(true);
    await p.ev(`planx.editor.setTimelineStep('${ids.t}', 6)`);
    expect(await at(), 'back at 6x: as they were').toBe(JSON.stringify([[276, 276], [414, 138], [138, 100]]));
    // Too narrow for a letter of its title (a day at 1x): a click opens it.
    await p.ev(`(() => { planx.editor.setTimelineStep('${ids.t}', 1); planx.board.update('${ids.task}', { w: 23 }); })()`);
    const c = await p.ev(`(() => { const e = planx.editor, i = planx.board.get('${ids.task}'); e.cam = { x: 400 - i.x, y: 300 - i.y, z: 1 }; e.camChanged(); e.setSelection([]); return [400 + i.w / 2, 326]; })()`);
    await sleep(200);
    await p.click(c);
    await sleep(300);
    expect(await p.ev(`!!planx.board.get('${ids.task}').tv`), 'opened by a click').toBe(true);
  },

  async '"Троеточие у титула": the «…» by a timeline\'s title picks it, its panel half seen'(p) {
    const at = await p.ev(`(async () => { const e = planx.editor, b = planx.board; e.addTimeline({ x: 0, y: 0 }); const t = b.list().find((i) => i.tl), h = b.list().find((i) => i.tie === t.id);
      e.cam = { x: 150 - t.x * 0.7, y: 200 - t.y * 0.7, z: 0.7 }; e.camChanged(); e.setSelection([]);
      const m = (await import('/src/labs/header.ts')).moreBox(h), s = e.toScreen({ x: h.x + m.x + m.w / 2, y: h.y + m.y + m.h / 2 }); return [s.x, s.y]; })()`);
    await sleep(300);
    await p.click(at);
    await sleep(400);
    expect(await p.ev(`JSON.stringify([[...planx.editor.selection].map((id) => !!planx.board.get(id).tl), getComputedStyle(document.querySelector('.bar.panel')).opacity])`), 'the timeline picked, its panel half seen').toBe('[[true],"0.5"]');
    // The pointer once on it: all of it, the pointer gone again too.
    const panel = await p.at('.bar.panel');
    await p.mouse('mouseMoved', panel[0], panel[1]);
    await sleep(300);
    await p.mouse('mouseMoved', 600, 300);
    await sleep(300);
    expect(await p.ev(`getComputedStyle(document.querySelector('.bar.panel')).opacity`), 'seen, all of it since').toBe('1');
    await p.ev(`(() => { const e = planx.editor; e.setSelection([e.selection.values().next().value]); })()`);
    await sleep(300);
    expect(await p.ev(`getComputedStyle(document.querySelector('.bar.panel')).opacity`), 'picked as ever: all of it').toBe('1');
  },

  async '"Кучки": a timeline dragged over another goes over it, with all it holds'(p) {
    const ids = await p.ev(`(() => { const e = planx.editor, b = planx.board; e.addTimeline({ x: 0, y: 0 }); const t = b.list().find((i) => i.tl);
      const a = e.newItem('task', t.x + 60, t.y + 80, { w: 200, h: 52, text: 'A' }); b.add(a); b.update(t.id, { members: [a.id] });
      e.addTimeline({ x: 0, y: 600 }); const u = b.list().find((i) => i.tl && i.id !== t.id);
      const c = e.newItem('task', u.x + 100, u.y + 80, { w: 200, h: 52, text: 'B' }); b.add(c); b.update(u.id, { members: [c.id] });
      e.cam = { x: 100 - t.x * 0.5, y: 80 - t.y * 0.5, z: 0.5 }; e.camChanged(); e.setSelection([u.id]);
      const s = e.toScreen({ x: u.x + 30, y: u.y + 300 }); return { t: t.id, u: u.id, a: a.id, c: c.id, at: [s.x, s.y] }; })()`);
    await sleep(200);
    await p.drag(ids.at, [ids.at[0] + 100, ids.at[1] - 250]);
    await sleep(200);
    expect(await p.ev(`(() => { const z = (id) => planx.board.get(id).z; return Math.min(z('${ids.u}'), z('${ids.c}')) > Math.max(z('${ids.t}'), z('${ids.a}')); })()`), 'the one dragged, all of it, over the other').toBe(true);
  },

  async '"Тихая панель": a click on something, its panel half seen; the pointer once on it, all of it till something else is picked'(p) {
    // (Off at first: turned on.)
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('quietPanel', true))()`);
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); b.add(e.newItem('sticky', 300, 300, { id: 'q', w: 150, h: 150 })); b.add(e.newItem('sticky', 600, 300, { id: 'r', w: 150, h: 150 })); e.setSelection([]); })()`);
    const seen = () => p.ev(`getComputedStyle(document.querySelector('.bar.panel')).opacity`);
    await p.click([375, 375]);
    await sleep(400);
    expect(await seen(), 'half seen').toBe('0.5');
    const panel = await p.at('.bar.panel');
    await p.mouse('mouseMoved', panel[0], panel[1]);
    await sleep(300);
    await p.mouse('mouseMoved', 900, 600);
    await sleep(300);
    expect(await seen(), 'once on it: all of it').toBe('1');
    await p.click([675, 375]);
    await sleep(400);
    expect(await seen(), 'another picked: half seen again').toBe('0.5');
  },

  async '"Полукруги на рамке": none on what is too small on the screen to aim at them'(p) {
    const r = await p.ev(`(async () => { const t = await import('/src/labs/sideTabs.ts'), e = planx.editor;
      const sq = e.newItem('sticky', 0, 0, { w: 160, h: 160 }), long = e.newItem('rect', 0, 0, { w: 200, h: 40 });
      return [t.tabsFor(sq, null, 0.25), t.tabsFor(sq, null, 0.19), t.tabsFor(long, null, 0.6), t.tabsFor(long, null, 0.5)].join(); })()`);
    expect(r, 'a sticker at 40 and 30 across, a long one 24 and 20 tall').toBe('true,false,true,false');
  },

  async '"Ссылка на объект": copied from an item\'s menu, said so; opened, the board goes to it, picked'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 'a', w: 150, h: 150 })); b.add(e.newItem('sticky', 4000, 3000, { id: 'far', w: 150, h: 150 })); e.setSelection([]); })()`);
    await p.cdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 375, y: 375, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 375, y: 375, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Ссылка на объект').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(300);
    const said = await p.ev(`document.querySelector('.pop.toast')?.textContent ?? ''`);
    expect(said === 'Ссылка скопирована' || said.includes('item=a'), `said (${said})`).toBe(true);
    // A link to the far one opened: the board there, it picked.
    await p.ev(`(async () => { const l = await import('/src/labs/itemLink.ts'); l.openUrl(planx.editor, l.itemUrl('far')); })()`);
    await sleep(700);
    expect(await p.ev(`(() => { const e = planx.editor, s = e.toScreen({ x: 4075, y: 3075 }); return [Math.abs(s.x - e.canvas.clientWidth / 2) < 2, Math.abs(s.y - e.canvas.clientHeight / 2) < 2, [...e.selection].join()].join(); })()`), 'there, in the middle, picked').toBe('true,true,far');
    // Its hint: what it leads to.
    const tips = await p.ev(`(async () => { const l = await import('/src/labs/itemLink.ts'), e = planx.editor, b = planx.board;
      b.add(e.newItem('frame', 0, 0, { id: 'f', w: 200, h: 150, text: 'Идеи', members: [] })); b.add(e.newItem('mind', 0, 900, { id: 'm', w: 200, h: 56, text: 'План' }));
      return ['far', 'f', 'm', 'gone'].map((id) => l.linkTip(e, l.itemUrl(id))).concat(l.linkTip(e, 'https://example.com/x')).join(' | '); })()`);
    expect(tips, 'its hints').toBe('Ссылка на стикер | Ссылка на фрейм «Идеи» | Ссылка на майнд-карту «План» | Ссылка на удалённый объект | Ссылка на example.com');
  },

  async '"Титул в объектах": a timeline\'s title hidden with it in a folded frame; a table\'s title, as they had for a day, gone'(p) {
    const r = await p.ev(`(async () => { const e = planx.editor, b = planx.board; e.addTimeline({ x: 0, y: 0 }); const t = b.list().find((i) => i.tl), h = b.list().find((i) => i.tie === t.id);
      const f = e.newItem('frame', t.x - 100, h.y - 100, { w: t.w + 200, h: t.h + 300, members: [t.id], text: 'Фрейм' }); b.add(f);
      e.setFolded(f.id, true);
      const tb = e.newItem('table', 3000, 0, { w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill('') }); b.add(tb);
      b.add(e.newItem('rect', 3000, -40, { hd: true, tie: tb.id, text: 'Таблица', icon: 'table', w: 300, h: 30 }));
      await new Promise((d) => setTimeout(d, 100));
      return [e.shown().some((i) => i.id === h.id), b.list().some((i) => i.tie === tb.id)].join(); })()`);
    expect(r, 'the title hidden, the table\'s gone').toBe('false,false');
  },

  async 'a table cell typed in: its text up, down or in the middle, from the text panel\'s alignment'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 240, cols: [120, 120, 120], rows: [80, 80, 80], cells: Array(9).fill('') })); e.setSelection(['t']); e.startEditing('t', 4); })()`);
    await sleep(300);
    await p.cdp('Input.insertText', { text: 'Внизу' });
    await sleep(400);
    await p.click(await p.at('.tfmt button[aria-label="Выравнивание"]'));
    await sleep(200);
    await p.click(await p.at('.tfmt button[aria-label="Прижать книзу"]'));
    await sleep(200);
    expect(await p.ev(`JSON.stringify(planx.board.get('t').cellFmt?.[4])`), 'that cell down').toBe('{"va":"bottom"}');
    // The menu still open: across too, at once.
    await p.click(await p.at('.tfmt button[aria-label="По правому краю"]'));
    await sleep(200);
    expect(await p.ev(`JSON.stringify(planx.board.get('t').cellFmt?.[4])`), 'down and right').toBe('{"va":"bottom","ta":"right"}');
  },

  async '"Реакции": the pointer on one under an item, who put it after a moment'(p) {
    await p.ev(`(async () => { const o = await import('/src/labs/overlays.ts'), e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 150, h: 150 })); o.toggleReaction(e, ['s'], o.REACTIONS[0]);
      const rx = b.get('s').rx; b.update('s', { rx: { [o.REACTIONS[0]]: [...rx[o.REACTIONS[0]], 'anna', 'old'] } }); b.meta.set('people', { ...(b.meta.get('people') ?? {}), anna: 'Аня' }); e.setSelection([]); })()`);
    await sleep(300);
    // Its pill just under the sticker's lower left corner.
    await p.mouse('mouseMoved', 315, 463);
    await sleep(1300);
    expect(await p.ev(`document.querySelector('.tip')?.textContent ?? 'none'`), 'who put it').toBe('вы, Аня, участник');
  },

  async 'a folded frame duplicated by the keyboard (Cmd+D, Alt and an arrow): its copy by its bar, not past what it holds'(p) {
    for (const how of ['dup', 'arrow']) {
      const r = await p.ev(`(async () => { const e = planx.editor, b = planx.board; b.replaceAll([], []);
        b.add(e.newItem('sticky', 340, 340, { id: 's', w: 600, h: 600 })); b.add(e.newItem('frame', 300, 300, { id: 'f', w: 700, h: 700, text: 'Ф', members: ['s'] }));
        e.setFolded('f', true); e.setSelection(['f']); await new Promise((d) => setTimeout(d, 100));
        if ('${how}' === 'dup') e.duplicate(); else e.duplicateArrow(1, 0);
        await new Promise((d) => setTimeout(d, 200));
        const f = b.get('f'), c = b.list().find((i) => i.type === 'frame' && i.id !== 'f');
        return [c.x - f.x - f.w, c.y - f.y, [...e.selection].join() === c.id].join(); })()`);
      expect(r, `${how}: 24 right of its bar, level, it alone picked (not what it holds)`).toBe('24,0,true');
    }
  },

  async 'table cells picked, their text panel: an alignment lit only where they all have it'(p) {
    const lit = async () => {
      await p.click(await p.at('.tfmt button[aria-label="Выравнивание"]')); await sleep(200);
      const out = await p.ev(`JSON.stringify([...document.querySelectorAll('.tfmt button')].filter((x) => x.classList.contains('on') && x.getAttribute('aria-label') !== 'Выравнивание').map((x) => x.getAttribute('aria-label')))`);
      await p.click(await p.at('.tfmt button[aria-label="Выравнивание"]')); await sleep(150);
      return out;
    };
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 240, cols: [120, 120, 120], rows: [80, 80, 80], cells: Array(9).fill('a'), cellFmt: [{ ta: 'right', va: 'top' }, { ta: 'left', va: 'top' }, { ta: 'right' }, null, null, null, null, null, null] }));
      e.setSelection(['t']); e.pickCell(0, 'one'); e.pickCell(1, 'toggle'); })()`);
    await sleep(400);
    await p.click(await p.at('.bar.panel button[aria-label="Текст и шрифт"]')); await sleep(600);
    expect(await lit(), 'across they differ: none lit; up, both top').toBe('["Прижать кверху"]');
    await p.ev(`(() => { const e = planx.editor; e.pickCell(0, 'one'); e.pickCell(2, 'toggle'); })()`); await sleep(300);
    expect(await lit(), 'across both right; up, they differ: none lit').toBe('["По правому краю"]');
  },

  async 'a table cell picked, a letter pressed: typed into it, not a tool\'s key (F not framing the table)'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: ['', 'Был', '', '', '', '', '', '', ''] })); e.setSelection(['t']); e.pickCell(1, 'one'); })()`);
    await sleep(300);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, text: 'f' });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70 });
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'ункт' }); await sleep(200);
    await p.escape(); await sleep(200);
    expect(await p.ev(`JSON.stringify([planx.board.list().filter((i) => i.type === 'frame').length, planx.board.get('t').cells[1]])`), 'no frame; typed into the cell').toBe('[0,"Былfункт"]');
  },

  async 'things and lines picked together: the lines\' kinds under one button, the panel kept short'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 200, 300, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('sticky', 700, 300, { id: 'b', w: 100, h: 100 }));
      b.addLink({ id: 'L', from: 'a', to: 'b' }); e.setSelection(['a', 'b', 'L']); })()`);
    await sleep(500);
    expect(await p.ev(`[!!document.querySelector('.bar.panel button[aria-label="Дуга"]'), !!document.querySelector('.bar.panel button[aria-label="Вид линий"]')].join()`), 'one button').toBe('false,true');
    await p.click(await p.at('.bar.panel button[aria-label="Вид линий"]'));
    await p.click(await p.at('.palette-pop button[aria-label="Дуга"]'));
    expect(await p.ev(`planx.board.getLink('L').style`), 'its kind from it').toBe('arc');
  },

  async '"Масштаб таймлайна": its right side dragged with Cmd, its step as it goes, as many days, what is on it along; drawn to 2x near it'(p) {
    const ids = await p.ev(`(() => { const e = planx.editor, b = planx.board; e.addTimeline({ x: 0, y: 0 }); const t = b.list().find((i) => i.tl);
      b.update(t.id, { w: 19 * 2 + 10 * 23 }); const from = t.x + 19;
      const task = e.newItem('task', from + 2 * 23, t.y + 60, { w: 3 * 23, h: 52, text: 'Задача' }); b.add(task);
      b.update(t.id, { members: [task.id] }); e.cam = { x: 100 - t.x, y: 100 - t.y, z: 1 }; e.camChanged(); e.setSelection([t.id]); return { t: t.id, task: task.id, from }; })()`);
    await sleep(300);
    // Its right side (10 days, 230 wide inside) at x 100 + 268, clear of its half circle: 228 further, near twice as wide.
    await p.drag([368, 160], [596, 160], { modifiers: 4 });
    await sleep(200);
    const r = await p.ev(`(() => { const t = planx.board.get('${ids.t}'), k = planx.board.get('${ids.task}'); return [t.ts, t.w, k.x - ${ids.from}, k.w].join(); })()`);
    expect(r, '2x: twice as wide, the task on its days').toBe([2, 19 * 2 + 460, 92, 138].join());
    await p.ev('planx.editor.undo()');
    expect(await p.ev(`(() => { const t = planx.board.get('${ids.t}'); return [t.ts ?? 1, t.w].join(); })()`), 'one undo').toBe([1, 268].join());
  },
};
