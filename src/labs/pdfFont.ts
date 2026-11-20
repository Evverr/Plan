/**
 * A TrueType font (a .ttf of one weight, public/fonts/print) to be put whole in a PDF we write ourselves
 * («PDF с текстом», docPdf.ts): its letters found by their code points (its cmap), their widths (hmtx), the
 * letters used noted, to say in the PDF what each is (ToUnicode: its text copied, searched) and how wide.
 * Text is written as its letters' numbers in the font (Identity-H), so any of its letters, Cyrillic and all.
 */
export class TtfFont {
  readonly upm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly bbox: [number, number, number, number];
  private readonly view: DataView;
  private readonly tables = new Map<string, { at: number; len: number }>();
  private readonly nMetrics: number;
  private readonly hmtx: number;
  private readonly lookup: (cp: number) => number;
  private readonly found = new Map<number, number>();
  /** The letters used, by their number in the font: what each stands for. */
  readonly used = new Map<number, string>();

  constructor(readonly bytes: Uint8Array, readonly name: string) {
    const v = (this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    const n = v.getUint16(4);
    for (let i = 0; i < n; i++) {
      const r = 12 + i * 16, tag = String.fromCharCode(v.getUint8(r), v.getUint8(r + 1), v.getUint8(r + 2), v.getUint8(r + 3));
      this.tables.set(tag, { at: v.getUint32(r + 8), len: v.getUint32(r + 12) });
    }
    const head = this.table('head'), hhea = this.table('hhea'), os2 = this.tables.get('OS/2');
    this.upm = v.getUint16(head + 18);
    this.bbox = [v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42)];
    this.ascent = v.getInt16(hhea + 4);
    this.descent = v.getInt16(hhea + 6);
    this.nMetrics = v.getUint16(hhea + 34);
    this.hmtx = this.table('hmtx');
    this.capHeight = os2 && v.getUint16(os2.at) >= 2 ? v.getInt16(os2.at + 88) : this.ascent;
    this.lookup = this.cmap();
  }

  private table(tag: string): number {
    const t = this.tables.get(tag);
    if (!t) throw new Error(`no ${tag} in ${this.name}`);
    return t.at;
  }

  /** Its letters by code point: the Unicode table it has (all of Unicode, or the first 65536). */
  private cmap(): (cp: number) => number {
    const v = this.view, at = this.table('cmap'), n = v.getUint16(at + 2);
    let f4 = -1, f12 = -1;
    for (let i = 0; i < n; i++) {
      const r = at + 4 + i * 8, pid = v.getUint16(r), eid = v.getUint16(r + 2), sub = at + v.getUint32(r + 4), fmt = v.getUint16(sub);
      if (fmt === 12 && (pid === 3 && eid === 10 || pid === 0)) f12 = sub;
      if (fmt === 4 && (pid === 3 && eid === 1 || pid === 0)) f4 = sub;
    }
    if (f12 >= 0) {
      const groups = v.getUint32(f12 + 12);
      return (cp) => {
        let lo = 0, hi = groups - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1, g = f12 + 16 + mid * 12, s = v.getUint32(g), e = v.getUint32(g + 4);
          if (cp < s) hi = mid - 1; else if (cp > e) lo = mid + 1; else return v.getUint32(g + 8) + cp - s;
        }
        return 0;
      };
    }
    if (f4 < 0) return () => 0;
    const segs = v.getUint16(f4 + 6) / 2, ends = f4 + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
    return (cp) => {
      if (cp > 0xffff) return 0;
      for (let i = 0; i < segs; i++) {
        if (cp > v.getUint16(ends + i * 2)) continue;
        const s = v.getUint16(starts + i * 2);
        if (cp < s) return 0;
        const delta = v.getInt16(deltas + i * 2), ro = v.getUint16(ranges + i * 2);
        if (!ro) return (cp + delta) & 0xffff;
        const g = v.getUint16(ranges + i * 2 + ro + (cp - s) * 2);
        return g ? (g + delta) & 0xffff : 0;
      }
      return 0;
    };
  }

  /** The letter for a code point (0: none in it). */
  glyph(cp: number): number {
    let g = this.found.get(cp);
    if (g === undefined) { g = this.lookup(cp); this.found.set(cp, g); }
    return g;
  }
  /** Whether it has a letter for every one of `text`'s. */
  has(text: string): boolean { return [...text].every((c) => this.glyph(c.codePointAt(0)!) > 0); }
  /** How wide a letter is, in the font's units. */
  advance(g: number): number { return this.view.getUint16(this.hmtx + Math.min(g, this.nMetrics - 1) * 4); }
  /** How wide `text` comes out at `size`, letter by letter (no kerning). */
  width(text: string, size: number): number {
    let w = 0;
    for (const c of text) w += this.advance(this.glyph(c.codePointAt(0)!));
    return (w * size) / this.upm;
  }
  /** `text` as the PDF writes it: its letters' numbers, four hex digits each, those used noted. */
  encode(text: string): string {
    let out = '';
    for (const c of text) {
      const g = this.glyph(c.codePointAt(0)!);
      if (!this.used.has(g)) this.used.set(g, c);
      out += g.toString(16).padStart(4, '0');
    }
    return out;
  }
}

/** Bytes as Flate (zlib) compressed, as a PDF stream's /FlateDecode reads them. */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A PDF written object by object: each added, a number to refer to it by; then the whole file. */
export class PdfWriter {
  private readonly objs: Array<{ dict: string; stream?: Uint8Array } | null> = [null];
  private readonly enc = new TextEncoder();
  /** A place for an object to be put in later (`set`), its number now. */
  reserve(): number { this.objs.push(null); return this.objs.length - 1; }
  set(n: number, dict: string, stream?: Uint8Array): void { this.objs[n] = { dict, stream }; }
  add(dict: string, stream?: Uint8Array): number { const n = this.reserve(); this.set(n, dict, stream); return n; }
  /** A stream compressed, its dictionary's `extra` with its length and filter. */
  async addStream(extra: string, bytes: Uint8Array | string): Promise<number> {
    const z = await deflate(typeof bytes === 'string' ? this.enc.encode(bytes) : bytes);
    return this.add(`<< ${extra} /Length ${z.length} /Filter /FlateDecode >>`, z);
  }
  /** The whole file, `root` its catalogue, `info` what it's called. */
  build(root: number, info?: number): Uint8Array {
    const parts: Uint8Array[] = [], offsets: number[] = [];
    let at = 0;
    const put = (b: Uint8Array | string) => { const u = typeof b === 'string' ? this.enc.encode(b) : b; parts.push(u); at += u.length; };
    put('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');
    this.objs.forEach((o, n) => {
      if (!n || !o) return;
      offsets[n] = at;
      put(`${n} 0 obj\n${o.dict}\n`);
      if (o.stream) { put('stream\n'); put(o.stream); put('\nendstream\n'); }
      put('endobj\n');
    });
    const xref = at, size = this.objs.length;
    put(`xref\n0 ${size}\n0000000000 65535 f \n${Array.from({ length: size - 1 }, (_, i) => `${String(offsets[i + 1] ?? 0).padStart(10, '0')} 00000 n \n`).join('')}`);
    put(`trailer\n<< /Size ${size} /Root ${root} 0 R${info ? ` /Info ${info} 0 R` : ''} >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(at);
    let i = 0;
    for (const p of parts) { out.set(p, i); i += p.length; }
    return out;
  }
}

/** A string in a PDF as UTF-16 (its title, an address): in hex, with its byte order mark. */
export function pdfText(s: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

/** A font put in a PDF whole (its file, its letters' widths, what each used stands for): its number. */
export async function embedFont(pdf: PdfWriter, f: TtfFont): Promise<number> {
  const k = 1000 / f.upm, s = (v: number) => Math.round(v * k);
  const file = await pdf.addStream(`/Length1 ${f.bytes.length}`, f.bytes);
  const name = f.name.replace(/[^A-Za-z0-9-]/g, '');
  const desc = pdf.add(`<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${f.bbox.map(s).join(' ')}] /ItalicAngle 0 /Ascent ${s(f.ascent)} /Descent ${s(f.descent)} /CapHeight ${s(f.capHeight)} /StemV 80 /FontFile2 ${file} 0 R >>`);
  const used = [...f.used.keys()].sort((a, b) => a - b);
  const widths = used.map((g) => `${g} [${s(f.advance(g))}]`).join(' ');
  const cid = pdf.add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`);
  // What each letter used stands for, a hundred at a time (as a CMap has them).
  const utf16 = (c: string) => [...c].map((ch) => { const cp = ch.codePointAt(0)!; if (cp < 0x10000) return cp.toString(16).padStart(4, '0'); const v = cp - 0x10000; return ((v >> 10) + 0xd800).toString(16) + ((v & 0x3ff) + 0xdc00).toString(16); }).join('');
  const chunks: string[] = [];
  for (let i = 0; i < used.length; i += 100) {
    const part = used.slice(i, i + 100);
    chunks.push(`${part.length} beginbfchar\n${part.map((g) => `<${g.toString(16).padStart(4, '0')}> <${utf16(f.used.get(g)!)}>`).join('\n')}\nendbfchar`);
  }
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const toUni = await pdf.addStream('', cmap);
  return pdf.add(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUni} 0 R >>`);
}
