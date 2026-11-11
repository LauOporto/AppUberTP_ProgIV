/** Reloj como puerto: permite testear vencimientos y marcas de tiempo sin esperar ni depender de la hora real. */
export interface Clock {
  now(): Date;
}
