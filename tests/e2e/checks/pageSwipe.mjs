import { expect, sleep } from '../lib.mjs';

async function document(p) {
  await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: .6 }; e.camChanged(); e.dropItem('page', { x: 500, y: 400 }); })()`);
  await sleep(150);
  const id = await p.ev(`planx.board.list().find(i => i.type === 'page').id`);
  await p.ev(`(() => { const e = planx.editor; e.stopEditing(); planx.board.update('${id}', { text: Array.from({length: 140}, (_, i) => 'Строка ' + i).join('\\n') }); const it = planx.board.get('${id}'); e.cam = { x: 220 - it.x * .6, y: 70 - it.y * .6, z: .6 }; e.camChanged(); e.setSelection([]); })()`);
  const at = (side) => p.ev(`(async () => { const it = planx.board.get('${id}'), a = (await import('/src/labs/docPage.ts')).textArea(it); const s = planx.editor.toScreen({x: it.x + (${side} < 0 ? a.x / 2 : a.x + a.w + (it.w - a.x - a.w) / 2), y: it.y + 200}); return [s.x, s.y]; })()`);
  const shown = () => p.ev(`(async () => (await import('/src/labs/docPage.ts')).pageShown(planx.board.get('${id}')))()`);
  const pick = async () => { await p.ev(`planx.editor.setSelection(['${id}'])`); await sleep(450); };
  return { id, at, shown, pick };
}

export const checks = {
  async 'document margins: first click selects, selected margins turn pages and stop at the ends'(p) {
    const d = await document(p), right = await d.at(1), left = await d.at(-1);
    await p.click(right);
    expect(await d.shown(), 'first click only selects').toBe(0);
    await sleep(450);
    await p.click(right);
    expect(await d.shown(), 'right margin goes forward').toBe(1);
    await sleep(450);
    await p.click(left);
    expect(await d.shown(), 'left margin goes back').toBe(0);
    await sleep(450);
    await p.click(left);
    expect(await d.shown(), 'first page stays first').toBe(0);
    const last = await p.ev(`(async () => { const m = await import('/src/labs/docPage.ts'); const n = m.pagesOf(planx.board.get('${d.id}')).length - 1; m.showPage('${d.id}', n); planx.editor.requestRender(); return n; })()`);
    await sleep(450);
    await p.click(right);
    expect(await d.shown(), 'last page stays last').toBe(last);
  },
  async 'document margins: dragging and modified clicks do not turn pages'(p) {
    const d = await document(p); await d.pick();
    const before = await p.ev(`planx.board.get('${d.id}').x`), at = await d.at(1);
    await p.drag(at, [at[0] + 60, at[1] + 30]);
    expect(await d.shown(), 'drag does not turn').toBe(0);
    expect(await p.ev(`planx.board.get('${d.id}').x`) > before, 'document moved').toBe(true);
    for (const modifiers of [8, 4, 2, 1]) {
      await d.pick(); const at = await d.at(1);
      await p.mouse('mouseMoved', ...at);
      await p.mouse('mousePressed', ...at, modifiers);
      await p.mouse('mouseReleased', ...at, modifiers);
      await sleep(100);
      expect(await d.shown(), 'modifier does not turn').toBe(0);
    }
  },
  async 'document margins: double click edits the original page'(p) {
    const d = await document(p); await d.pick(); const [x, y] = await d.at(1);
    for (let clickCount = 1; clickCount <= 2; clickCount++) {
      await p.cdp('Input.dispatchMouseEvent', {type:'mousePressed',x,y,button:'left',buttons:1,clickCount});
      await p.cdp('Input.dispatchMouseEvent', {type:'mouseReleased',x,y,button:'left',buttons:0,clickCount});
      await sleep(70);
    }
    await sleep(250);
    expect(await d.shown(), 'original page restored').toBe(0);
    expect(await p.ev('planx.editor.editingId'), 'editing the document').toBe(d.id);
  },
  async 'document margins: disabled feature and a single page do not turn'(p) {
    const d = await document(p); await d.pick();
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('pageSwipe', false))()`);
    await p.click(await d.at(1));
    expect(await d.shown(), 'disabled').toBe(0);
    await p.ev(`(async () => { (await import('/src/labs/labs.ts')).setLab('pageSwipe', true); planx.board.update('${d.id}', {text:'Одна страница'}); })()`);
    await d.pick(); await p.click(await d.at(1));
    expect(await d.shown(), 'one page').toBe(0);
  },
  async 'document margins: a slow double click with its second press held edits the original page'(p) {
    const d = await document(p); await d.pick(); const [x, y] = await d.at(1);
    await p.cdp('Input.dispatchMouseEvent', {type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    await p.cdp('Input.dispatchMouseEvent', {type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
    await sleep(700);
    await p.cdp('Input.dispatchMouseEvent', {type:'mousePressed',x,y,button:'left',buttons:1,clickCount:2});
    await sleep(700);
    await p.cdp('Input.dispatchMouseEvent', {type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:2});
    await sleep(200);
    expect(await d.shown(), 'original page restored for system double click').toBe(0);
    expect(await p.ev('planx.editor.editingId'), 'editing original document').toBe(d.id);
  },
  async 'document margins: cancelling the second press keeps the first completed page turn'(p) {
    const d = await document(p); await d.pick(); const [x, y] = await d.at(1);
    await p.mouse('mouseMoved', x, y);
    await p.mouse('mousePressed', x, y); await p.mouse('mouseReleased', x, y);
    await sleep(70);
    await p.cdp('Input.dispatchMouseEvent', {type:'mousePressed',x,y,button:'left',buttons:1,clickCount:2});
    await p.ev(`planx.editor.canvas.dispatchEvent(new PointerEvent('pointercancel', {pointerId:1, button:0, clientX:${x}, clientY:${y}, bubbles:true}))`);
    await p.mouse('mouseReleased', x, y);
    await sleep(200);
    expect(await d.shown(), 'completed first turn kept').toBe(1);
    expect(await p.ev('planx.editor.editingId'), 'cancel does not start editing').toBe(null);
  },
  async 'document margins: cancellation and multiple selection do not turn pages'(p) {
    const d = await document(p); await d.pick(); const at = await d.at(1);
    await p.mouse('mouseMoved', ...at);
    await p.mouse('mousePressed', ...at);
    await p.ev(`planx.editor.canvas.dispatchEvent(new PointerEvent('pointercancel', {pointerId:1, button:0, clientX:${at[0]}, clientY:${at[1]}, bubbles:true}))`);
    await p.mouse('mouseReleased', ...at);
    expect(await d.shown(), 'cancelled press').toBe(0);
    await p.ev(`(() => { const e = planx.editor; planx.board.add(e.newItem('rect', 2000, 2000, {id:'other'})); e.setSelection(['${d.id}', 'other']); })()`);
    await sleep(450); await p.click(at);
    expect(await d.shown(), 'multiple selection').toBe(0);
  },
  async 'document margins: right-button swipe still turns and an ordinary right click opens the menu'(p) {
    const d = await document(p); await d.pick();
    const at = await p.ev(`(() => { const it = planx.board.get('${d.id}'), s = planx.editor.toScreen({x:it.x + it.w / 2, y:it.y + 200}); return [s.x,s.y]; })()`);
    const mouse = (type, x, y, buttons) => p.cdp('Input.dispatchMouseEvent', {type,x,y,button:'right',buttons,clickCount:1});
    await mouse('mousePressed', ...at, 2);
    await mouse('mouseMoved', at[0] - 60, at[1], 2);
    await mouse('mouseReleased', at[0] - 60, at[1], 0);
    await sleep(250);
    expect(await d.shown(), 'swipe goes forward').toBe(1);
    expect(!!(await p.rect('.context-menu')), 'swipe does not open menu').toBe(false);
    await sleep(450);
    await mouse('mousePressed', ...at, 2); await mouse('mouseReleased', ...at, 0);
    await sleep(150);
    expect(!!(await p.rect('.context-menu')), 'ordinary right click opens menu').toBe(true);
  },
};
