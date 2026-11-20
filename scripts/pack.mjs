// PlanX as a zip to run on another computer, with nothing but Node.js there (no npm install, no internet):
// the built app (dist/, `npm run build` first), the server bundled into one file, launchers for a double
// click (Mac, Windows), a note how. Boards are kept next to it, in data/ (none in the zip; copy the folder
// over to take them along). Run: npm run build && node scripts/pack.mjs [where the zip goes]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.resolve(process.argv[2] ?? path.join(os.homedir(), 'Desktop', 'PlanX.zip'));
const PORT = 4321;
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('No dist/: npm run build first');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'planx-pack-')), app = path.join(tmp, 'PlanX');
fs.mkdirSync(path.join(app, 'server'), { recursive: true });
execFileSync(path.join(ROOT, 'node_modules/.bin/esbuild'), [
  'server/index.ts', '--bundle', '--platform=node', '--format=esm', '--target=node18', `--outfile=${path.join(app, 'server', 'server.mjs')}`,
  '--external:bufferutil', '--external:utf-8-validate', '--log-level=warning',
  // (ws asks for its optional helpers with require: there in an ES module too.)
  "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
], { cwd: ROOT, stdio: 'inherit' });
fs.cpSync(path.join(ROOT, 'dist'), path.join(app, 'dist'), { recursive: true });

const mac = `#!/bin/bash
# PlanX: the board in the browser, served from this folder (boards kept in data/ next to it).
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  osascript -e 'display dialog "Для PlanX нужен Node.js 18 или новее. Скачайте его с nodejs.org (кнопка LTS), установите и откройте PlanX снова." buttons {"Открыть nodejs.org"} default button 1' >/dev/null && open https://nodejs.org/
  exit 1
fi
(sleep 1.5; open "http://localhost:${PORT}") &
echo "PlanX работает: http://localhost:${PORT} — не закрывайте это окно, пока работаете."
NODE_ENV=production PORT=${PORT} exec node server/server.mjs
`;
const win = `@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul || (echo PlanX needs Node.js 18+: https://nodejs.org & start https://nodejs.org & pause & exit /b)\r\nstart "" http://localhost:${PORT}\r\nset NODE_ENV=production\r\nset PORT=${PORT}\r\nnode server\\server.mjs\r\npause\r\n`;
const readme = `PlanX на этом компьютере

1. Нужен Node.js 18 или новее: https://nodejs.org (кнопка LTS). Ставится один раз.
2. Mac: дважды нажмите «Запустить PlanX.command». Если Mac скажет, что разработчик не проверен,
   нажмите на файл правой кнопкой → «Открыть» → «Открыть» (один раз).
   Windows: дважды нажмите «Запустить PlanX.bat».
3. Откроется браузер с PlanX: http://localhost:${PORT}. Окно терминала не закрывайте, пока работаете:
   закрыли — PlanX остановился.

Доски хранятся здесь же, в папке data. Чтобы перенести доски с другого компьютера, положите его папку
data на место этой (с выключенным PlanX).
`;
fs.writeFileSync(path.join(app, 'Запустить PlanX.command'), mac, { mode: 0o755 });
fs.writeFileSync(path.join(app, 'Запустить PlanX.bat'), win);
fs.writeFileSync(path.join(app, 'Прочитай меня.txt'), readme);

fs.rmSync(OUT, { force: true });
execFileSync('zip', ['-rqX', OUT, 'PlanX'], { cwd: tmp });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`PlanX packed: ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
