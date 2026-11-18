import { describe, expect, it } from 'vitest';
import { fromMarkdown, looksLikeMarkdown } from '../src/labs/richDoc';
import { paraAt } from '../src/model/textLinks';

describe('Markdown pasted into «Документ»', () => {
  it('is told from plain text', () => {
    expect(looksLikeMarkdown('# Заголовок\nтекст')).toBe(true);
    expect(looksLikeMarkdown('- пункт')).toBe(true);
    expect(looksLikeMarkdown('Это **важно**')).toBe(true);
    expect(looksLikeMarkdown('Обычный текст, без разметки.\nИ вторая строка — с тире.')).toBe(false);
  });

  it('has its headings, lists in lists, checklists, quotes, code and dividers as a document has them', () => {
    const md = '# План\n\nТекст с **жирным**, *курсивом*, ~~зачёркнутым~~ и `кодом`, [ссылка](https://x.y).\n- пункт\n  - вложенный\n1. первый\n- [ ] сделать\n- [x] сделано\n> цитата\n---\n```\nconst a = 1;\n  return a;\n```\n';
    const { text, rs } = fromMarkdown(md);
    expect(text).toBe('План\nТекст с жирным, курсивом, зачёркнутым и кодом, ссылка.\nпункт\nвложенный\nпервый\nсделать\nсделано\nцитата\n\nconst a = 1;\n  return a;');
    const at = (w: string) => text.indexOf(w);
    expect(paraAt(text, rs, at('План'), 'h')).toBe(1);
    expect(paraAt(text, rs, at('пункт'), 'l')).toBe('bullet');
    expect(paraAt(text, rs, at('вложенный'), 'd')).toBe(1);
    expect(paraAt(text, rs, at('первый'), 'l')).toBe('number');
    expect(paraAt(text, rs, at('сделать'), 'l')).toBe('todo');
    expect(paraAt(text, rs, at('сделано'), 'l')).toBe('done');
    expect(paraAt(text, rs, at('цитата'), 'k')).toBe('quote');
    expect(paraAt(text, rs, at('цитата') + 7, 'k')).toBe('hr');
    expect(paraAt(text, rs, at('const'), 'k')).toBe('code');
    expect(paraAt(text, rs, at('  return'), 'k')).toBe('code');
    const has = (w: string, key: 'b' | 'i' | 'x' | 'm') => rs?.some((r) => r[key] && r.s === at(w) && r.e === at(w) + w.length);
    expect([has('жирным', 'b'), has('курсивом', 'i'), has('зачёркнутым', 'x'), has('кодом', 'm')]).toEqual([true, true, true, true]);
  });

  it('a document saved as Markdown, back as it was', async () => {
    const { docMarkdown } = await import('../src/labs/docExport');
    const text = 'План\nТекст с кодом\nпункт\nвложенный\nсделано\nцитата\n\nconst a = 1;';
    const doc = { id: 'd', type: 'page', x: 0, y: 0, w: 794, h: 1123, z: 0, text, rs: fromMarkdown('# План\nТекст с `кодом`\n- пункт\n  - вложенный\n- [x] сделано\n> цитата\n---\n```\nconst a = 1;\n```').rs } as never;
    const back = fromMarkdown(docMarkdown(doc));
    expect([back.text, JSON.stringify(back.rs)]).toEqual([text, JSON.stringify((doc as { rs: unknown }).rs)]);
  });
});
