// Al terminar un turno: si hubo cambios de código, corre el typecheck.
// Si falla, sale con código 2 para que Claude Code lo corrija antes de dar la tarea por terminada.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

// Evita bucles: si ya estamos continuando por este hook, no volver a bloquear.
if (input.stop_hook_active) process.exit(0);
if (!existsSync(path.join(projectDir, 'node_modules'))) process.exit(0);

let changed = '';
try {
  changed = execFileSync('git', ['status', '--porcelain'], { cwd: projectDir, encoding: 'utf8' });
} catch {
  process.exit(0);
}
const touchesCode = changed
  .split('\n')
  .some((line) => /\.(ts|tsx)$/.test(line.trim()) && !line.includes('docs/'));
if (!touchesCode) process.exit(0);

try {
  execFileSync('pnpm', ['-s', 'typecheck'], {
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().split('\n').slice(0, 60).join('\n');
  process.stderr.write(`El typecheck falla. Corrige estos errores antes de terminar:\n${out}\n`);
  process.exit(2);
}

process.exit(0);
