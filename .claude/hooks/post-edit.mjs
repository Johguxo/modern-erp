// Después de cada edición: formatea y revisa con ESLint el archivo tocado.
// Si quedan errores de ESLint, sale con código 2 para que Claude Code los vea y los corrija.
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

const filePath = input?.tool_input?.file_path;
if (!filePath || !existsSync(filePath)) process.exit(0);

const rel = path.relative(projectDir, filePath);
if (rel.startsWith('..') || rel.startsWith('node_modules') || rel.startsWith('docs')) process.exit(0);
if (!existsSync(path.join(projectDir, 'node_modules'))) process.exit(0);

// pnpm exec funciona igual en macOS, Linux y Windows.
// En Windows se ejecuta con shell, que parte los argumentos por espacios: por eso se pasa la
// ruta relativa al proyecto (sin espacios) y no la absoluta, que puede tenerlos.
const target = rel.split(path.sep).join('/');
const run = (bin, args) =>
  execFileSync('pnpm', ['exec', bin, ...args], {
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
const hasBin = (bin) =>
  existsSync(path.join(projectDir, 'node_modules', '.bin', bin)) ||
  existsSync(path.join(projectDir, 'node_modules', '.bin', `${bin}.cmd`));

const isCode = /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
const isFormattable = isCode || /\.(json|css|md)$/.test(filePath);

try {
  if (isFormattable && hasBin('prettier')) {
    run('prettier', ['--write', '--log-level', 'warn', target]);
  }
} catch {
  // Un error de formato no bloquea.
}

if (isCode && hasBin('eslint')) {
  try {
    run('eslint', ['--fix', '--max-warnings=0', target]);
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim();
    process.stderr.write(`ESLint encontró problemas en ${rel}. Corrígelos antes de seguir:\n${out}\n`);
    process.exit(2);
  }
}

process.exit(0);
