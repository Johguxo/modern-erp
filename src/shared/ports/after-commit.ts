// Tareas que corren después del commit de la transacción del request (E1-H3, ADR-005): por
// ejemplo, enviar el correo de una invitación ya guardada. Si una tarea falla, se registra y no
// revierte nada. Lo que devuelve se combina con la salida de la acción (p. ej. `{ emailSent }`).
export type AfterCommitTask = () => Promise<Readonly<Record<string, unknown>> | void>;

export type AfterCommit = (task: AfterCommitTask) => void;
