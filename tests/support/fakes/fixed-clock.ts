// Reloj fijo: las pruebas nunca dependen de la hora real.
import type { Clock } from '@/shared/ports/clock';

export const DEFAULT_NOW = new Date('2026-01-15T15:00:00.000Z');

export class FixedClock implements Clock {
  private current: Date;

  constructor(now: Date = DEFAULT_NOW) {
    this.current = new Date(now);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(now: Date): void {
    this.current = new Date(now);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
