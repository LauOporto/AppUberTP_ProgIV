import { Clock } from '../../domain/ports/clock.js';

/** Reloj real (producción). */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Reloj controlable (tests): devuelve siempre la misma hora hasta que se lo avanza a mano. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
