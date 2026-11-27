// Cuándo el diálogo «Corregir una línea» ofrece «Recargar»: el documento cambió desde que se abrió
// la página (conflicto, cambio de estado o versión vieja). Sin React.
export function offersReload(error: {
  readonly code: string;
  readonly reason?: string | undefined;
}): boolean {
  return (
    error.code === 'CONFLICT' ||
    error.code === 'INVALID_TRANSITION' ||
    error.reason === 'stale_version'
  );
}
