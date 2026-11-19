import { describe, expect, it } from 'vitest';
import { fromRtf } from '../src/labs/docImport';

const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('«Файлы в документ»: rich text (RTF)', () => {
  it('has its paragraphs, bold and italic, its Cyrillic in its code page (TextEdit)', () => {
    // (Its Cyrillic as bytes in cp1251: «Привет» CF F0 E8 E2 E5 F2, «мир» EC E8 F0.)
    const rtf = "{\\rtf1\\ansi\\ansicpg1251\\cocoartf2709\n{\\fonttbl\\f0\\fswiss\\fcharset204 Helvetica;}\n{\\colortbl;\\red255\\green255\\blue255;}\n\\pard\\tx566\\pardirnatural\\partightenfactor0\n\n\\f0\\fs24 \\cf0 \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2 \\b \\'ec\\'e8\\'f0\\b0 !\\\n\\i \\'e2\\'f2\\'ee\\'f0\\'e0\\'ff\\i0  \\'f1\\'f2\\'f0\\'ee\\'ea\\'e0}";
    const { text, rs } = fromRtf(bytes(rtf));
    expect(text).toBe('Привет мир!\nвторая строка');
    expect(rs).toEqual([{ s: 7, e: 10, b: true }, { s: 12, e: 18, i: true }]);
  });

  it('has its letters as \\u…, skipping what stands in for them (WordPad), its tables\' cells a space apart', () => {
    const rtf = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}{\\*\\generator Riched20;}\\uc1\\pard \\u1044?\\u1072?\\ul\\u1090?\\ulnone\\u1072?\\par\n\\trowd\\cellx1000\\cellx2000 a\\cell b\\cell\\row}";
    const { text, rs } = fromRtf(bytes(rtf));
    expect(text).toBe('Дата\na b');
    expect(rs).toEqual([{ s: 2, e: 3, u: true }]);
  });
});
