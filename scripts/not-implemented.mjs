// Marcador para scripts que todavía no existen. Termina con error para no fingir éxito.
const [script = 'script', story = 'una historia posterior'] = process.argv.slice(2);
console.error(`pnpm ${script} aún no está implementado; llega en ${story}.`);
process.exit(1);
