import { expect, sleep } from '../lib.mjs';

// The component stays off screen; its instance has 40 units of padding around two visible items.
const fixture = (p) => p.ev(`(() => {
  const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
  b.transact(() => {
    b.add(e.newItem('frame', X - 1500, Y, { id: 'source', comp: true, text: 'Карточка', w: 350, h: 200, members: ['a', 'b'], z: 0 }));
    b.add(e.newItem('rect', X - 1460, Y + 40, { id: 'a', w: 100, h: 80, text: 'Первый', color: 'blue', z: 1 }));
    b.add(e.newItem('rect', X - 1310, Y + 40, { id: 'b', w: 100, h: 80, text: 'Второй', color: 'yellow', z: 2 }));
    b.add(e.newItem('frame', X, Y, { id: 'instance', inst: 'source', w: 350, h: 200, members: [], z: 0 }));
  });
  e.stopEditing(); e.setTool('select'); e.setSelection([]);
  return { x: X, y: Y };
})()`);
const selected = (p) => p.ev(`[...planx.editor.selection].join(',')`);

/** The component icon before an instance's title (contents at at.x + 40, at.y + 40; the icon 18 across
 *  from 2 left of them and 20 above): 'solid' when it's full under its top corner, 'outline' when only
 *  its middle is (the solid one has a hole there), or 'none'. */
const glyph = (p, at) => p.ev(`(() => { const e = planx.editor; e.render(); const ctx = e.canvas.getContext('2d'), k = e.canvas.width / e.canvas.clientWidth;
  const red = (gx, gy) => { const s = e.toScreen({ x: ${at.x} + 38 + gx * 0.75, y: ${at.y} + 20 + gy * 0.75 }), d = ctx.getImageData(Math.round(s.x * k), Math.round(s.y * k), 1, 1).data; return d[0] > 180 && d[1] < 150; };
  return red(12, 7.4) ? 'solid' : red(12, 12) ? 'outline' : 'none'; })()`);

// (Two stickers side by side, their ids.)
const twoStickers = `(() => { const e = planx.editor, b = planx.board; const a = e.newItem('sticky', 100, 100, { w: 160, h: 160, color: 'yellow', text: 'A' }), c = e.newItem('sticky', 300, 100, { w: 160, h: 160, color: 'yellow', text: 'B' }); b.add(a); b.add(c); return [a.id, c.id]; })()`;

export const checks = {
  async '"Правка главного компонента": the main component picked as it is and changed: a note that all its instances change, once; moved, none; brought out to be changed, none'(p) {
    await fixture(p);
    const note = () => p.ev(`document.querySelector('.confirm p')?.textContent ?? null`);
    await p.ev(`(() => { const e = planx.editor, c = planx.board.get('source'); e.cam = { x: 600 - c.x - 175, y: 300 - c.y - 100, z: 1 }; e.camChanged(); e.setSelection(['source']); })()`);
    await sleep(200);
    // Moved: nothing changes in its instances, no note.
    await p.ev(`planx.board.transact(() => { for (const id of ['source', 'a', 'b']) planx.board.update(id, { x: planx.board.get(id).x + 30 }); })`);
    await sleep(200);
    expect(await note(), 'moved: no note').toBe(null);
    // Something in it changed (its colour, by the panel's colours).
    await p.ev(`planx.editor.setSelection(['a'])`);
    await sleep(100);
    await p.ev(`planx.board.update('a', { color: 'green' })`);
    await sleep(300);
    expect(await note(), 'changed: the note').toBe('Это главный компонент: изменения затронут все его экземпляры (1).');
    expect(await p.ev(`planx.board.list().find((i) => i.host === 'instance' && i.id.endsWith('~a'))?.color`), 'its instance changed with it').toBe('green');
    await p.click(await p.at('.confirm .btn.primary'));
    await sleep(200);
    await p.ev(`planx.board.update('a', { color: 'pink' })`);
    await sleep(300);
    expect(await note(), 'changed again, still picked: no note again').toBe(null);
    // Brought out to be changed in its instance's place: no note.
    await p.ev(`planx.editor.setSelection([]); planx.editor.editComponentAt('instance')`);
    await sleep(500);
    await p.ev(`planx.editor.setSelection(['a']); planx.board.update('a', { color: 'blue' })`);
    await sleep(300);
    expect(await note(), 'brought out to be changed: no note').toBe(null);
  },

  async 'a group made a component: no group then, a component round it; F with a group picked: nothing'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('groups', true))()`);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('frameAround', true))()`);
    const [a, c] = await p.ev(twoStickers);
    await p.ev(`(() => { const e = planx.editor; e.setSelection(['${a}', '${c}']); e.group(); e.setSelection(['${a}']); })()`);
    expect(await p.ev(`planx.editor.selection.size`), 'group picked whole').toBe(2);
    await p.key('f', 'KeyF', 70); await sleep(200);
    expect(await p.ev(`JSON.stringify([planx.board.list().filter((i) => i.type === 'frame').length, planx.editor.tool])`), 'F on a group: nothing').toBe(JSON.stringify([0, 'select']));
    await p.ev(`planx.editor.makeComponent()`); await sleep(200);
    const g = await p.ev(`(() => { const b = planx.board, f = b.list().find((i) => i.comp); return { n: b.list().filter((i) => i.type === 'frame').length, members: f && [...f.members].sort(), gp: [b.get('${a}').gp ?? null, b.get('${c}').gp ?? null], hosts: [b.get('${a}').host ?? null] }; })()`);
    expect(JSON.stringify(g), 'group -> component').toBe(JSON.stringify({ n: 1, members: [a, c].sort(), gp: [null, null], hosts: [null] }));
  },
  async 'a frame made a component: no frame then, a component round what it held (one undo step)'(p) {
    const [a, c] = await p.ev(twoStickers);
    await p.ev(`(() => { const e = planx.editor; e.setSelection(['${a}', '${c}']); e.frameSelection(); planx.editor.stopEditing?.(); })()`);
    await sleep(200);
    const f = await p.ev(`planx.board.list().find((i) => i.type === 'frame').id`);
    await p.ev(`(() => { planx.editor.setSelection(['${f}']); planx.editor.makeComponent(); })()`); await sleep(200);
    const r = await p.ev(`(() => { const b = planx.board, fr = b.list().filter((i) => i.type === 'frame'); return { n: fr.length, old: !!b.get('${f}'), comp: fr.map((x) => [!!x.comp, x.members.length]) }; })()`);
    expect(JSON.stringify(r), 'frame -> component').toBe(JSON.stringify({ n: 1, old: false, comp: [[true, 2]] }));
    await p.ev(`planx.board.undo()`); await sleep(200);
    expect(await p.ev(`JSON.stringify(planx.board.list().filter((i) => i.type === 'frame').map((x) => [!!x.comp, x.id === '${f}']))`), 'one undo: the frame back').toBe(JSON.stringify([[false, true]]));
  },
  async 'an instance of a component made of a group moved: what\'s in it moved along as it is'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('groups', true))()`);
    const [a, c] = await p.ev(twoStickers);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setSelection(['${a}', '${c}']); e.group(); e.setSelection(['${a}']); e.makeComponent(); e.stopEditing(); })()`);
    await sleep(200);
    const comp = await p.ev(`planx.board.list().find((i) => i.comp).id`);
    await p.ev(`(() => { planx.editor.addObject('${comp}', { x: 500, y: 500 }); })()`);
    await sleep(300);
    const rel = () => p.ev(`(() => { const b = planx.board, i = b.list().find((x) => x.inst), kids = b.list().filter((x) => x.host === i.id).sort((m, n) => m.x - n.x); return JSON.stringify(kids.map((k) => [Math.round(k.x - i.x), Math.round(k.y - i.y), k.gp ?? null])); })()`);
    const before = await rel();
    const inst = await p.ev(`(() => { const i = planx.board.list().find((x) => x.inst); const s = planx.editor.toScreen({ x: i.x + 10, y: i.y + 10 }); return [s.x, s.y]; })()`);
    await p.drag(inst, [inst[0] + 150, inst[1] + 90], { steps: 10 });
    await sleep(300);
    expect(before + ' -> ' + await rel(), 'same').toBe(before + ' -> ' + before);
  },

  async 'with an instance picked, the panel\'s component button brings its component out to be changed'(p) {
    await fixture(p);
    await p.ev(`planx.editor.setSelection(['instance'])`);
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Редактировать компонент"]'));
    await sleep(200);
    expect(await selected(p), 'the component out and picked').toBe('source');
    expect(await p.ev(`planx.board.list().filter((i) => i.comp).length`), 'no component made of it').toBe(1);
  },

  async 'a component brought out at an instance changed in it says so once (unless told not to again)'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); localStorage.removeItem('planx-no-differs-note');
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 100, h: 100 })); e.setSelection(['s']); e.makeComponent(); e.stopEditing();
      const c = b.list().find((i) => i.comp); e.addInstance(c.id); })()`);
    await sleep(200);
    const inst = await p.ev(`planx.board.list().find((i) => i.inst).id`);
    await p.ev(`planx.board.update('${inst}~s', { color: 'pink' })`);
    await sleep(200);
    const note = () => p.ev(`document.querySelector('.confirm p')?.textContent ?? null`);
    await p.ev(`planx.editor.editComponentAt('${inst}')`);
    await sleep(150);
    expect(await note(), 'said').toBe('Копия компонента редактировалась, поэтому она не совпадает с изначальным компонентом.');
    expect(await p.ev(`[...document.querySelectorAll('.confirm .btn')].map((b) => b.textContent).join()`), 'its buttons').toBe('Сбросить изменения,Понятно');
    await p.click(await p.at('.confirm-check input'));
    await p.click(await p.at('.confirm .btn.primary'));
    await p.ev(`planx.editor.finishComponent()`);
    await p.ev(`planx.editor.editComponentAt('${inst}')`);
    await sleep(150);
    expect(await note(), 'not again once told so').toBe(null);
    // «Сбросить изменения»: the instance as its component is again.
    await p.ev(`planx.editor.finishComponent(); localStorage.removeItem('planx-no-differs-note')`);
    await p.ev(`planx.editor.editComponentAt('${inst}')`);
    await sleep(150);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.confirm .btn')].find((b) => b.textContent === 'Сбросить изменения').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await p.ev(`planx.editor.finishComponent()`);
    await sleep(200);
    expect(await p.ev(`(planx.board.get('${inst}~s').color ?? 'none') + ' ' + (planx.board.get('${inst}~s').ovr ?? 'no ovr')`), 'back as the component is').toBe(await p.ev(`(planx.board.get('s').color ?? 'none') + ' no ovr'`));
  },

  async 'a component is changed at its first instance, whichever instance asks; its first gone, the oldest left takes its place'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 100, h: 100 })); e.setSelection(['s']); e.makeComponent(); e.stopEditing();
      const c = b.list().find((i) => i.comp); e.addInstance(c.id); })()`);
    await sleep(200);
    const comp = await p.ev(`planx.board.list().find((i) => i.comp).id`), a = await p.ev(`planx.board.list().find((i) => i.inst === '${comp}').id`);
    expect(await p.ev(`planx.board.get('${comp}').first`), 'the one it turned into is its first').toBe(a);
    await p.ev(`planx.editor.setSelection(['${a}']); planx.editor.duplicate(); planx.editor.duplicate();`);
    await sleep(200);
    const others = await p.ev(`planx.board.list().filter((i) => i.inst === '${comp}' && i.id !== '${a}').sort((m, n) => m.born - n.born).map((i) => i.id)`);
    await p.ev(`planx.editor.editComponentAt('${others[1]}')`);
    await sleep(200);
    expect(await p.ev(`planx.board.get('${comp}').standsIn`), 'changed in the first one\'s place').toBe(a);
    await p.ev(`planx.editor.addInstance('${comp}')`);
    await p.ev(`planx.editor.setSelection(['${a}']); planx.editor.deleteSelection();`);
    await sleep(100);
    expect(await p.ev(`(async () => { const m = await import('/src/model/components.ts'); return m.firstInstance(planx.board.get('${comp}'), planx.board.list())?.id; })()`), 'the oldest left takes its place').toBe(others[0]);
  },

  async 'a first click picks the instance, the next picks its child even after a pause'(p) {
    await fixture(p);
    await p.click([390, 330]);
    expect(await selected(p), 'first click picks the group').toBe('instance');
    await sleep(450);
    await p.click([390, 330]);
    expect(await selected(p), 'second single click picks the child').toBe('instance~a');
    expect(await p.ev('planx.editor.editingId'), 'selection alone does not start typing').toBe(null);
    await p.click([540, 330]);
    expect(await selected(p), 'another child in the same instance').toBe('instance~b');
    await p.click([900, 600]);
    await p.click([390, 330]);
    expect(await selected(p), 'leaving resets selection to the group').toBe('instance');
  },

  async 'a quick second click enters the instance without opening text'(p) {
    await fixture(p);
    await p.click([390, 330]);
    await p.click([390, 330]);
    expect(await selected(p), 'quick second click picks the child').toBe('instance~a');
    expect(await p.ev('planx.editor.editingId'), 'no accidental text editing').toBe(null);
  },

  async 'the red title (after a diamond) shows only while the instance (or something in it) is picked, hugging the contents, with no red frame'(p) {
    const at = await fixture(p);
    for (const selection of [[], ['instance'], ['instance~a']]) {
      const drawing = await p.ev(`(() => {
        const e = planx.editor, ctx = e.canvas.getContext('2d'), text = [], strokes = [];
        const fillText = ctx.fillText, stroke = ctx.stroke;
        e.setSelection(${JSON.stringify(selection)});
        ctx.fillText = function(t, x, y, ...rest) { if (this.fillStyle.toLowerCase() === '#e5484d') text.push({ t, x, y }); return fillText.call(this, t, x, y, ...rest); };
        ctx.stroke = function(...args) { if (this.strokeStyle.toLowerCase() === '#e5484d') strokes.push(true); return stroke.apply(this, args); };
        try { e.render(); } finally { ctx.fillText = fillText; ctx.stroke = stroke; }
        return { text, strokes: strokes.length };
      })()`);
      if (!selection.length) {
        expect(drawing.text.length, 'no title while nothing is picked').toBe(0);
        continue;
      }
      expect(drawing.text.map((t) => t.t).join(' '), 'the title while picked').toBe('Карточка');
      expect(await glyph(p, at), 'after the component icon, solid: its component\'s first instance').toBe('solid');
      expect(drawing.text[0].x, 'title after the icon, flush with the contents on the left').toBe(at.x + 61);
      expect(drawing.text[0].y, 'title 3 above the contents').toBe(at.y + 37);
      expect(drawing.strokes, 'no red instance frame').toBe(0);
    }
    await p.ev('planx.editor.setSelection([])');
    await p.click([390, 280]);
    expect(await selected(p), 'where its title shows picks the group').toBe('instance');
  },

  async 'the diamond before the title goes to the component, from the instance or a child in it'(p) {
    for (const presses of [1, 2]) {
      await p.ev('planx.editor.cam = { x: 0, y: 0, z: 1 }');
      const at = await fixture(p);
      for (let i = 0; i < presses; i++) await p.click([390, 330]);
      expect(await selected(p), 'picked first').toBe(presses === 1 ? 'instance' : 'instance~a');
      // Under the pointer, a little off it, it's solid.
      await p.mouse('mouseMoved', 337, 266);
      await sleep(100);
      expect(await glyph(p, at), 'solid under the pointer').toBe('solid');
      await p.click([347, 280]);
      await sleep(700);
      expect(await selected(p), 'the diamond picks the component').toBe('source');
      const seen = await p.ev(`(() => { const c = planx.board.get('source'), s = planx.editor.toScreen({ x: c.x + c.w / 2, y: c.y + c.h / 2 }); return s.x > 0 && s.x < innerWidth && s.y > 0 && s.y < innerHeight; })()`);
      expect(seen, 'the component came into view').toBe(true);
    }
  },

  async 'alt-dragging a picked instance copies the whole instance, not a child of it, with what was changed in it'(p) {
    await fixture(p);
    await p.ev(`planx.board.update('instance~a', { color: 'green' })`);
    await p.click([390, 330]);
    await p.drag([390, 330], [390, 530], { modifiers: 1 });
    const state = await p.ev(`(() => {
      const items = planx.board.list(), insts = items.filter((i) => i.inst === 'source');
      const made = insts.find((i) => i.id !== 'instance');
      return { insts: insts.length, copies: insts.map((i) => items.filter((c) => c.host === i.id).length), sel: [...planx.editor.selection], color: planx.board.get(made.id + '~a')?.color };
    })()`);
    expect(state.insts, 'two instances now').toBe(2);
    expect(state.copies.join(','), 'each holds both items').toBe('2,2');
    expect(state.sel.length === 1 && state.sel[0] !== 'instance' && !state.sel[0].includes('~'), 'the new instance is picked').toBe(true);
    expect(state.color, 'the copy keeps its changed colour').toBe('green');
  },

  async 'dragging a child picked in an instance moves the whole instance, keeping the child picked'(p) {
    await fixture(p);
    await p.click([390, 330]);
    await p.click([390, 330]);
    expect(await selected(p), 'the child picked').toBe('instance~a');
    const before = await p.ev(`['instance', 'instance~a', 'instance~b'].map((id) => planx.board.get(id).x)`);
    await p.drag([390, 330], [450, 330]);
    const after = await p.ev(`['instance', 'instance~a', 'instance~b'].map((id) => planx.board.get(id).x)`);
    for (let i = 0; i < 3; i++) expect(after[i] - before[i], 'all moved along').toBeNear(60);
    expect(await selected(p), 'the child still picked').toBe('instance~a');
  },

  async 'a picked instance is stretched by its corner, its contents about half as wide growing in step'(p) {
    const at = await fixture(p);
    await p.click([390, 330]);
    // The contents run from (340, 290) to (590, 370) on screen; the handle is just past that corner.
    await p.drag([593, 373], [693, 433]);
    const r = await p.ev(`['instance~a', 'instance~b', 'a'].map((id) => { const i = planx.board.get(id); return [i.x, i.y, i.w, i.h]; })`);
    // Both as tall as the contents: they stretch down with it. Each two fifths as wide: wider in step (250 to 350).
    expect(r[0].join(), 'the left one stays at the left, taller, wider in step').toBe([at.x + 40, at.y + 40, 140, 140].join());
    expect(r[1][0] - (at.x + 190), 'the right one goes right in step').toBeNear(60);
    expect(r[1][3], 'and taller too').toBe(140);
    expect(r[2].join(), 'the component unchanged').toBe([at.x - 1460, at.y + 40, 100, 80].join());
    expect(await p.ev(`JSON.stringify(planx.board.get('instance').grow)`), 'how much it grew').toBe('{"w":100,"h":60}');
    await p.key('z', 'KeyZ', 90, 4);
    await sleep(200);
    expect(await p.ev(`planx.board.get('instance~b').x`), 'undone in one step').toBe(at.x + 190);
  },

  async 'a picked instance stretches across by its right side only, down by its bottom only'(p) {
    await fixture(p);
    await p.click([390, 330]);
    // The contents run from (340, 290) to (590, 370) on screen (by the right side, clear of its half circle).
    await p.mouse('mouseMoved', 591, 300);
    await sleep(100);
    expect(await p.ev('planx.editor.canvas.style.cursor'), 'across').toBe('ew-resize');
    await p.drag([591, 300], [651, 340]);
    expect(await p.ev(`JSON.stringify(planx.board.get('instance').grow)`), 'wider only').toBe('{"w":60,"h":0}');
    await p.mouse('mouseMoved', 400, 371);
    await sleep(100);
    expect(await p.ev('planx.editor.canvas.style.cursor'), 'down').toBe('ns-resize');
    await p.drag([400, 371], [450, 401]);
    expect(await p.ev(`JSON.stringify(planx.board.get('instance').grow)`), 'taller only').toBe('{"w":60,"h":30}');
  },

  async 'the diamond brings the component out in the instance\'s place, its tick turns it back; the last instance deleted takes the component, once said yes'(p) {
    await fixture(p);
    const st = () => p.ev(`(() => { const b = planx.board, c = b.get('source'), i = b.get('instance'), shown = planx.editor.shown().map((x) => x.id);
      return { cx: c?.x, cy: c?.y, ix: i?.x, iy: i?.y, comp: !!c && shown.includes('source'), inst: !!i && shown.includes('instance'), sel: [...planx.editor.selection].join() }; })()`);
    const at = await st();
    // Stretched as an instance: the component comes out at that size.
    await p.ev(`planx.board.update('instance', { grow: { w: 100, h: 0 } })`);
    await sleep(200);
    const bWidth = await p.ev(`planx.board.get('instance~b').x - planx.board.get('instance~a').x`);
    await p.ev(`planx.editor.editComponentAt('instance')`);
    expect(await p.ev(`planx.board.get('b').x - planx.board.get('a').x`), 'laid out as the instance had it').toBe(bWidth);
    expect(await p.ev(`planx.board.get('instance').grow ?? null`), 'the instance no longer stretched beyond it').toBe(null);
    let now = await st();
    expect(`${now.cx},${now.cy} ${now.comp} ${now.inst} ${now.sel}`, 'the component out where the instance stood, the instance away').toBe(`${at.ix},${at.iy} true false source`);
    await p.ev(`planx.board.update('a', { color: 'pink' })`);
    await p.ev(`planx.editor.addInstance('source')`);
    await sleep(200);
    now = await st();
    expect(`${now.ix},${now.iy} ${now.comp} ${now.inst} ${now.sel}`, 'its tick: the instance back in the same place').toBe(`${at.ix},${at.iy} false true instance`);
    expect(await p.ev(`planx.board.get('instance~a').color`), 'with the change made').toBe('pink');
    await p.ev(`planx.editor.setSelection(['instance']); planx.editor.deleteSelection()`);
    await sleep(100);
    expect(await p.ev(`document.querySelector('.confirm p')?.textContent`), 'asked first').toBe('Это последняя копия компонента, и удалив её, мы удаляем компонент.');
    await p.click(await p.at('.confirm .btn.primary'));
    expect(await p.ev(`['instance', 'source', 'a', 'b'].map((id) => !!planx.board.get(id)).join()`), 'the instance and the component gone').toBe('false,false,false,false');
  },

  async 'dragging on the first press still moves the whole instance and keeps its source unchanged'(p) {
    await fixture(p);
    const before = await p.ev(`['instance', 'instance~a', 'instance~b', 'a'].map((id) => { const i = planx.board.get(id); return { id, x: i.x, y: i.y }; })`);
    await p.drag([390, 330], [450, 370]);
    const after = await p.ev(`['instance', 'instance~a', 'instance~b', 'a'].map((id) => { const i = planx.board.get(id); return { id, x: i.x, y: i.y }; })`);
    for (let i = 0; i < 4; i++) {
      expect(after[i].x - before[i].x, `${after[i].id} horizontal movement`).toBeNear(i < 3 ? 60 : 0);
      expect(after[i].y - before[i].y, `${after[i].id} vertical movement`).toBeNear(i < 3 ? 40 : 0);
    }
  },

  async 'a click off the component being changed finishes it; a drag or a press on it doesn\'t, nor is someone else\'s finished'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 100, h: 100 })); b.add(e.newItem('sticky', 800, 500, { id: 'o', w: 100, h: 100 }));
      e.setSelection(['s']); e.makeComponent(); e.stopEditing(); e.setSelection([]); e.compHere = null; })()`);
    await sleep(200);
    const out = () => p.ev(`!planx.board.list().find((i) => i.comp).stowed`);
    // Not worked in here: it may be someone else's.
    await p.click([1000, 150]);
    expect(await out(), 'not touched here: left as it is').toBe(true);
    await p.click([350, 350]);
    await p.click([350, 350]);
    await sleep(100);
    expect(await out(), 'a press on it: still being changed').toBe(true);
    await p.ev(`planx.editor.stopEditing()`);
    // Something dragged, here or into it, leaves it being changed.
    await p.drag([850, 550], [850, 600]);
    expect(await out(), 'a drag off it: still being changed').toBe(true);
    await p.click([1000, 150]);
    expect(await out(), 'a click off it: done').toBe(false);
    expect(await p.ev(`planx.board.list().filter((i) => i.inst && !i.stowed).length + ' ' + planx.editor.selection.size`), 'an instance in its place, nothing picked').toBe('1 0');
    // A click on something else picks that.
    await p.ev(`(() => { const e = planx.editor, c = planx.board.list().find((i) => i.inst); e.editComponentAt(c.id); })()`);
    await sleep(100);
    expect(await out(), 'out again').toBe(true);
    await p.click([850, 600]);
    expect(await out(), 'a click on another item: done').toBe(false);
    expect(await p.ev(`[...planx.editor.selection].join()`), 'and that one picked').toBe('o');
  },

  async 'something let go over where a put-away component stands stays in sight, not taken into it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 100, h: 100 })); b.add(e.newItem('mind', 800, 500, { id: 'm', w: 120, h: 48 }));
      e.setSelection(['s']); e.makeComponent(); e.stopEditing();
      const c = b.list().find((i) => i.comp); e.addInstance(c.id);
      const i = b.list().find((i) => i.inst); b.update(i.id, { x: 700, y: 100 }); e.setSelection([]); })()`);
    await sleep(200);
    await p.drag([860, 524], [350, 350]);
    expect(await p.ev(`Math.round(planx.board.get('m').x + 60)`), 'let go there').toBe(350);
    expect(await p.ev(`planx.editor.hidden().has('m')`), 'still in sight').toBe(false);
    expect(await p.ev(`planx.board.list().filter((f) => f.members?.includes('m')).length`), 'in nothing').toBe(0);
    expect(await p.ev(`planx.board.list().find((i) => i.comp).members.join()`), 'the component holds what it did').toBe('s');
  },

  async 'the title of a picked instance stays visible when a turned child extends into view from offscreen'(p) {
    const titleY = await p.ev(`(async () => {
      const e = planx.editor, b = planx.board;
      e.cam = { x: 0, y: 0, z: 1 }; e.needsFit = false;
      b.transact(() => {
        b.add(e.newItem('frame', -1200, 900, { id: 'source', comp: true, text: 'Повернутый', w: 600, h: 80, members: ['a'], z: 0 }));
        b.add(e.newItem('rect', -1160, 900, { id: 'a', w: 500, h: 30, rot: 90, color: 'blue', z: 1 }));
        b.add(e.newItem('frame', 200, 900, { id: 'instance', inst: 'source', w: 600, h: 80, members: [], z: 0 }));
      });
      await new Promise(requestAnimationFrame);
      e.setSelection(['instance']);
      const ctx = e.canvas.getContext('2d'), fillText = ctx.fillText; let y = null;
      ctx.fillText = function(t, x, atY, ...rest) { if (String(t).startsWith('Пов')) y = atY; return fillText.call(this, t, x, atY, ...rest); };
      try { e.render(); } finally { ctx.fillText = fillText; }
      return y;
    })()`);
    expect(titleY, 'title above the visible rotated child').toBeNear(663);
  },

  async 'an instance stretched, Cmd+D three times: its copies in a row, level'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; const r = e.newItem('rect', 0, 0, { w: 180, h: 110 }); b.add(r); const s = e.newItem('rect', 66, 9, { w: 48, h: 92 }); b.add(s); const m = e.newItem('emoji', 143, 5, { w: 27, h: 27, text: '🙂' }); b.add(m); e.setSelection([r.id, s.id, m.id]); e.makeComponent(); e.finishComponent(); const i = b.list().find((x) => x.inst); b.update(i.id, { grow: { w: 224, h: 106 } }); e.setSelection([i.id]); })()`);
    await sleep(300);
    for (let k = 0; k < 3; k++) { await p.ev('planx.editor.duplicate()'); await sleep(200); }
    const ys = await p.ev(`[...new Set(planx.board.list().filter((i) => i.inst).map((i) => i.y))].join()`);
    expect(ys, 'all at one height').toBe('-20');
  },

  async 'a picked instance framed by its contents, its half circles there: a line drawn from its right one'(p) {
    const inst = await p.ev(`(() => { const e = planx.editor, b = planx.board; const s = e.newItem('sticky', 0, 0, { w: 160, h: 160 }); b.add(s); e.setSelection([s.id]); e.makeComponent(); e.finishComponent(); const r = e.newItem('rect', 400, 30, { w: 120, h: 100 }); b.add(r); e.cam = { x: 400, y: 320, z: 1 }; e.camChanged(); return b.list().find((x) => x.inst).id; })()`);
    await sleep(300);
    await p.escape();
    await p.ev(`planx.editor.setSelection(['${inst}'])`);
    await sleep(400);
    // Its contents at (400, 320) to (560, 480) on the screen: its right half circle just past their right side.
    await p.drag([574, 400], [850, 400]);
    await sleep(300);
    expect(await p.ev(`JSON.stringify(planx.board.linkList().map((l) => [l.from === '${inst}', l.fromSide]))`), 'a line from it').toBe('[[true,"right"]]');
  },

  async 'a box round a component and its instances, or touching them, picks them whole, not what is in them'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; const s = e.newItem('sticky', 0, 0, { w: 160, h: 160 }); b.add(s); e.setSelection([s.id]); e.makeComponent(); e.finishComponent(); const i = b.list().find((x) => x.inst); e.setSelection([i.id]); e.duplicate(); e.duplicate(); e.editComponentAt(i.id); e.cam = { x: 300, y: 300, z: 0.7 }; e.camChanged(); })()`);
    await sleep(300);
    await p.escape();
    await sleep(200);
    await p.drag([150, 150], [1100, 650]);
    await sleep(300);
    expect(await p.ev(`[...planx.editor.selection].map((id) => { const i = planx.board.get(id); return i.comp ? 'C' : i.inst ? 'I' : 'in'; }).sort().join()`), 'the component and its instances alone').toBe('C,I,I');
    // All the component, and the next instance's left edge only (from 443 on the screen): both whole.
    await p.ev(`planx.editor.setSelection([])`);
    await p.drag([150, 150], [470, 650]);
    await sleep(300);
    expect(await p.ev(`[...planx.editor.selection].map((id) => { const i = planx.board.get(id); return i.comp ? 'C' : i.inst ? 'I' : 'in'; }).sort().join()`), 'touched: the component and the instance whole').toBe('C,I');
    await p.ev(`planx.editor.setSelection([])`);
    await p.drag([150, 150], [350, 650]);
    await sleep(300);
    expect(await p.ev(`[...planx.editor.selection].map((id) => { const i = planx.board.get(id); return i.comp ? 'C' : i.inst ? 'I' : 'in'; }).sort().join()`), 'the component\'s left half: it whole').toBe('C');
  },

  async 'a component being changed stretched by its top: room of its own, its instances too, what they hold in place; «Ограничить по содержимому» hugs again'(p) {
    const ids = await p.ev(`(() => { const e = planx.editor, b = planx.board; const s = e.newItem('sticky', 0, 0, { w: 160, h: 160 }); b.add(s); e.setSelection([s.id]); e.makeComponent(); e.finishComponent(); const i = b.list().find((x) => x.inst); e.setSelection([i.id]); e.duplicate(); const j = b.list().find((x) => x.inst && x.id !== i.id); e.editComponentAt(i.id); e.cam = { x: 400, y: 300, z: 1 }; e.camChanged(); return { c: b.list().find((x) => x.comp).id, j: j.id }; })()`);
    await sleep(300);
    await p.escape();
    await p.ev(`planx.editor.setSelection(['${ids.c}'])`);
    await sleep(300);
    const sticky = await p.ev(`JSON.stringify(planx.board.list().filter((i) => i.host === '${ids.j}').map((i) => [i.x, i.y]))`);
    // What it holds from (400, 300) to (560, 460) on the screen: its top side (clear of the middle) up 40.
    await p.drag([430, 297], [430, 257]);
    await sleep(300);
    const c = await p.ev(`(() => { const c = planx.board.get('${ids.c}'); return [c.x, c.y, c.w, c.h, !!c.air]; })()`);
    expect(c.join(), 'room on top of its own').toBe([0, -40, 160, 200, true].join());
    expect(await p.ev(`(() => { const i = planx.board.get('${ids.j}'); return [i.h, !!i.air].join(); })()`), 'the other instance as tall').toBe('200,true');
    expect(await p.ev(`JSON.stringify(planx.board.list().filter((i) => i.host === '${ids.j}').map((i) => [i.x, i.y]))`), 'what it holds in place').toBe(sticky);
    await p.click(await p.at('button[aria-label="Ограничить по содержимому"]'));
    await sleep(300);
    expect(await p.ev(`(() => { const c = planx.board.get('${ids.c}'); return [c.x, c.y, c.w, c.h, !!c.air].join(); })()`), 'hugging again').toBe([0, 0, 160, 160, false].join());
    expect(await p.ev(`!!document.querySelector('button[aria-label="Ограничить по содержимому"]')`), 'the button gone').toBe(false);
  },
};
