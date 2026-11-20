/**
 * «Markdown полностью» (src/labs, see mdFull.ts): a block of code in a «Документ» coloured by what is in it,
 * whatever its language, as it is drawn (the text itself left as it is, no colours kept in it).
 */

/** A line of a block of code, its parts coloured by what they are (as Obsidian and GitHub colour code
 *  whatever its language): strings green, numbers and true, false and null orange, the language's own
 *  words purple, comments grey, a key before «:» (JSON's, YAML's) blue. Each part's start and end in it. */
const KEYWORDS = new Set(('if else for while do return function const let var class new import from export default async await try catch finally throw switch case break continue '
  + 'def elif lambda pass yield with as in is not and or None True False self print struct enum interface type extends implements public private protected static void int '
  + 'string bool boolean float double char long fn mut impl use pub match loop go func package select where order by group insert update delete into values create table '
  + 'SELECT FROM WHERE ORDER BY GROUP INSERT UPDATE DELETE INTO VALUES CREATE TABLE JOIN LEFT RIGHT ON AND OR NOT NULL AS echo then fi esac done local export').split(' '));
export function codeTokens(line: string): Array<{ s: number; e: number; c: string }> {
  const out: Array<{ s: number; e: number; c: string }> = [];
  const re = /(\/\/.*$|#(?![\w{]).*$|--\s.*$|\/\*.*?(\*\/|$))|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)(\s*:)?|\b(true|false|null|undefined|nil|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?|0x[\da-f]+)\b|\b([A-Za-z_][\w]*)\b(\s*:(?!:))?/gi;
  for (const m of line.matchAll(re)) {
    const s = m.index!;
    if (m[1]) out.push({ s, e: s + m[1].length, c: 'gray' });
    else if (m[3]) out.push({ s, e: s + m[3].length, c: m[4] ? 'blue' : 'green' });
    else if (m[5]) out.push({ s, e: s + m[5].length, c: 'orange' });
    else if (m[6] && KEYWORDS.has(m[6])) out.push({ s, e: s + m[6].length, c: 'purple' });
    // (A key at its line's start, YAML's, in a list's item too.)
    else if (m[6] && m[7] && /^\s*(-\s+)?$/.test(line.slice(0, s))) out.push({ s, e: s + m[6].length, c: 'blue' });
  }
  return out;
}

