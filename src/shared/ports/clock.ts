// Puerto de reloj: los casos de uso nunca llaman a `new Date()` directo (pruebas deterministas).
export interface Clock {
  now(): Date;
}
