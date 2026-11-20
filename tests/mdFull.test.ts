import { describe, expect, it } from 'vitest';
import type { Item } from '../src/model/types';
import { fromMarkdown, looksLikeMarkdown } from '../src/labs/richDoc';
import { docMarkdown } from '../src/labs/docExport';
import { codeTokens } from '../src/labs/codeColors';
import { plainCell, tableAt, tableKey, tableItems } from '../src/labs/mdFull';
import { mdCell } from '../src/labs/mdInline';
import { paraAt } from '../src/model/textLinks';

describe('«Markdown полностью»', () => {
  it('keeps links as links: [text](address), <address>, an address alone; in bold too', () => {
    const { text, links, rs } = fromMarkdown('См. [документацию Битрикс24](https://apidocs.bitrix24.ru/a.html) и <https://x.y/z>, а также https://ex.com/p.\n**[жирная](https://b.c)**');
    expect(text).toBe('См. документацию Битрикс24 и https://x.y/z, а также https://ex.com/p.\nжирная');
    const at = (w: string) => text.indexOf(w);
    expect(links).toEqual([
      { s: at('документацию'), e: at('документацию') + 'документацию Битрикс24'.length, url: 'https://apidocs.bitrix24.ru/a.html' },
      { s: at('https://x.y/z'), e: at('https://x.y/z') + 13, url: 'https://x.y/z' },
      { s: at('https://ex.com/p'), e: at('https://ex.com/p') + 16, url: 'https://ex.com/p' },
      { s: at('жирная'), e: at('жирная') + 6, url: 'https://b.c' },
    ]);
    expect(rs?.some((r) => r.b && r.s === at('жирная') && r.e === at('жирная') + 6)).toBe(true);
  });

  it('takes marks in marks, escapes and underlining', () => {
    const { text, rs } = fromMarkdown('**жирный и `код`** \\*не курсив\\* <u>подчёркнуто</u> ==выделено== [[Заметка|алиас]]');
    expect(text).toBe('жирный и код *не курсив* подчёркнуто выделено алиас');
    // (Every letter of it so, in however many runs.)
    const has = (w: string, key: 'b' | 'm' | 'u') => Array.from({ length: w.length }, (_, k) => text.indexOf(w) + k).every((c) => rs?.some((r) => r[key] && r.s <= c && r.e > c));
    expect([has('жирный и код', 'b'), has('код', 'm'), has('подчёркнуто', 'u')]).toEqual([true, true, true]);
  });

  it('finds a table and its alignment; its place a paragraph of its own', () => {
    const md = 'До\n\n| Поле | Тип | Смысл |\n| --- | :---: | ---: |\n| `event_id` | string | ID **факта** |\n| a \\| b | int | <br>x |\n\nПосле';
    const lines = md.split('\n'), t = tableAt(lines, 2);
    expect(t?.n).toBe(4);
    expect(t?.table.aligns).toEqual([undefined, 'center', 'right']);
    expect(t?.table.rows[2]).toEqual(['a | b', 'int', '<br>x']);
    const { text, rs, tables } = fromMarkdown(md);
    expect(text).toBe('До\n\nПосле');
    expect(paraAt(text, rs, 3, 'o')).toBe(tableKey(0));
    expect(tables?.length).toBe(1);
    // (A cell keeps its Markdown, shown as it marks: see mdCell.)
    expect(plainCell('`event_id` и **всё**<br>ещё')).toEqual({ text: '`event_id` и **всё**\nещё', shown: 'event_id и всё\nещё', code: true });
    const cell = mdCell({ id: 't', type: 'table', x: 0, y: 0, w: 1, h: 1, z: 0, text: 'ключ `(product_id, event_id)`, [док](https://d.e)' } as Item);
    expect([cell.text, cell.rs, cell.links]).toEqual(['ключ (product_id, event_id), док', [{ s: 5, e: 27, m: true }], [{ s: 29, e: 32, url: 'https://d.e' }]]);
    expect(looksLikeMarkdown('| a | b |\n| - | - |\n| 1 | 2 |')).toBe(true);
  });

  it('makes a long table parts a page tall each, its header over each', () => {
    const rows = [['Метрика', 'Определение'], ...Array.from({ length: 30 }, (_, i) => [`m${i}`, 'длинное определение '.repeat(6)])];
    const parts = tableItems({ rows, aligns: [undefined, undefined] }, 600, 900);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.cells?.slice(0, 2)).toEqual(['Метрика', 'Определение']);
      expect(p.h!).toBeLessThanOrEqual(900);
      expect(Math.round(p.w!)).toBeLessThanOrEqual(600);
    }
    expect(parts.reduce((n, p) => n + p.rows!.length - 1, 0)).toBe(30);
  });

  it('colours code by what is in it', () => {
    const line = '  "event_id": "evt_428", "n": 2, "ok": false // x';
    const of = (w: string) => codeTokens(line).find((t) => line.slice(t.s, t.e) === w)?.c;
    expect([of('"event_id"'), of('"evt_428"'), of('2'), of('false'), of('// x')]).toEqual(['blue', 'green', 'orange', 'orange', 'gray']);
    expect(codeTokens('def f(x): return None').filter((t) => t.c === 'purple').length).toBe(3);
  });

  it('saves its links back as Markdown', () => {
    const text = 'См. документацию и https://x.y';
    const it = { id: 'd', type: 'page', x: 0, y: 0, w: 794, h: 1123, z: 0, text, links: [{ s: 4, e: 16, url: 'https://a.b/c' }, { s: 19, e: 30, url: 'https://x.y' }] } as Item;
    expect(docMarkdown(it)).toBe('См. [документацию](https://a.b/c) и <https://x.y>\n');
  });
});
