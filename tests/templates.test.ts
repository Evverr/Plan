import { afterEach, describe, expect, it, vi } from 'vitest';
import { addTemplates, TEMPLATES, kanban, projectPlan, retro } from '../src/shelf/templates';
import { readFolders, readShelf } from '../src/shelf/boards';
import { DEFAULTS } from '../src/model/types';

afterEach(() => vi.unstubAllGlobals());

describe('the ready-made boards', () => {
  it('are three, each named and made only of what boards have', () => {
    expect(TEMPLATES).toHaveLength(3);
    for (const make of TEMPLATES) {
      const t = make();
      expect(t.title).not.toBe('');
      expect(t.items.length).toBeGreaterThan(5);
      for (const it of t.items) expect(Object.keys(DEFAULTS)).toContain(it.type);
      expect(new Set(t.items.map((i) => i.id)).size).toBe(t.items.length);
    }
  });

  it('keep what lies in their frames in them', () => {
    for (const t of [kanban(), retro(), projectPlan()]) {
      const ids = new Set(t.items.map((i) => i.id));
      for (const f of t.items.filter((i) => i.type === 'frame')) {
        expect(f.members?.length).toBeGreaterThan(0);
        for (const m of f.members!) {
          expect(ids.has(m)).toBe(true);
          const it = t.items.find((i) => i.id === m)!;
          expect(it.x >= f.x && it.y >= f.y && it.x + it.w <= f.x + f.w && it.y + it.h <= f.y + f.h).toBe(true);
        }
      }
    }
  });

  it('grow the project plan as one mind map from its central topic', () => {
    const nodes = projectPlan().items.filter((i) => i.type === 'mind');
    const roots = nodes.filter((n) => !n.parent);
    expect(roots).toHaveLength(1);
    for (const n of nodes) if (n.parent) expect(nodes.some((p) => p.id === n.parent)).toBe(true);
  });
});

describe('the default shelf', () => {
  it('has four empty folders with distinct colours only once', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    });
    vi.stubGlobal('window', { dispatchEvent: () => true });
    addTemplates(123);
    const folders = readFolders();
    expect(folders.map((f) => f.title)).toEqual(['Папка 1', 'Папка 2', 'Папка 3', 'Папка 4']);
    expect(folders.map((f) => f.color)).toEqual(['#4786D4', '#FF6767', '#E6A72D', '#3D9A72']);
    expect(folders.map((f) => f.parent)).toEqual([null, null, null, null]);
    expect(folders.map((f) => f.created)).toEqual([123, 123, 123, 123]);
    expect(folders.map((f) => f.opened)).toEqual([123, 123, 123, 123]);
    expect(new Set(folders.map((f) => f.id)).size).toBe(4);
    expect(readShelf() ?? []).toEqual([]);
    addTemplates(456);
    expect(readFolders()).toEqual(folders);
  });
});
