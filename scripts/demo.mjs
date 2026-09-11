import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { loadBoard, saveBoard } from '../packages/core/dist/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = resolve(root, 'boards/demo');
const file = resolve(dir, 'support-pilot.json');
mkdirSync(dir, { recursive: true });
if (!existsSync(file) || process.argv.includes('--reset')) {
  saveBoard(file, loadBoard(resolve(root, 'examples/support-pilot.json')));
  console.log('Prepared fictional support-pilot board in boards/demo.');
} else {
  console.log('Keeping existing demo edits. Use pnpm demo:reset to restore the fixture.');
}
if (process.argv.includes('--serve')) {
  const web = resolve(root, 'apps/web');
  if (!existsSync(resolve(web, 'dist/index.html'))) throw new Error('Build first: pnpm -r build');
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/sidecar.ts'], {
    cwd: web, stdio: 'inherit',
    env: { ...process.env, TM_BOARDS_DIR: dir, TM_WEB_DIST: resolve(web, 'dist'), TM_UI_PORT: process.env.TM_UI_PORT || '8791' },
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 0; });
}
