# ADR-0004: Asignamos viajes con bloqueo pesimista de filas en orden fijo viaje → chofer, y con índices únicos parciales como red de seguridad

- **Estado:** propuesto (pasa a aceptado cuando lo revisen los dos integrantes)
- **Fecha:** 11/11/2026
- **Participantes:** _completar_

## Contexto

Problema central (§6.3): **un viaje se asigna a un solo chofer y un chofer tiene un solo viaje activo**, aun con decenas de
aceptaciones simultáneas y con pasajeros que cancelan justo cuando un chofer acepta. Hay dos recursos limitados a la vez:
el viaje y el chofer.

Que Node tenga un solo hilo no evita la carrera. Lo comprobamos con el código del scaffold, que hacía *leer el viaje →
verificar `REQUESTED` → escribir*: entre cada `await` el event loop atiende a los otros pedidos, todos leen `REQUESTED`
antes de que alguno escriba, y **50 de 50 aceptaciones simultáneas "ganaron"** el mismo viaje
(`tests/concurrency/acceptRide.legacyRace.test.ts`).

### Operaciones con posible condición de carrera (Bloque 6, punto 1)

| # | Operación en carrera | Cómo se resuelve | Estado |
|---|---|---|---|
| 1 | Varios choferes aceptan el mismo viaje | Lock de la fila del viaje; el resto lee el estado ya confirmado | ✅ resuelto y testeado (PC-04) |
| 2 | Un chofer acepta varios viajes a la vez | Lock de la fila del chofer + índice `rides_one_active_per_driver` | ✅ resuelto y testeado (PC-06) |
| 3 | El pasajero cancela mientras un chofer acepta | Los dos casos de uso bloquean primero el viaje → se serializan | ✅ resuelto y testeado (PC-05) |
| 4 | Un pasajero pide dos viajes a la vez | Índice `rides_one_active_per_passenger` (sin chequeo previo) | ✅ restricción testeada |
| 5 | Finalizar vs cancelar el mismo viaje | Mismo orden de bloqueo viaje → chofer | ⏳ al implementar "finalizar" |
| 6 | La oferta vence justo cuando el chofer acepta | Lock de la oferta/viaje en el barredor y en la aceptación | ⏳ TAR-03 |
| 7 | El chofer se pone "no disponible" mientras acepta | Ambos bloquean la fila del chofer | ⏳ al conectar disponibilidad a la base |
| 8 | Carrera propia de la variante del grupo | A definir cuando se asigne la variante | ⏳ VAR |

## Opciones consideradas

### Opción A — Bloqueo pesimista: transacción + `SELECT … FOR UPDATE` en orden fijo
- Ventajas: el razonamiento es directo (el que tiene el lock decide, los demás esperan y ven el estado confirmado); permite
  verificar varias condiciones antes de escribir (estado del viaje, habilitación y disponibilidad del chofer) con mensajes
  de error claros; funciona con el nivel de aislamiento por defecto (READ COMMITTED).
- Desventajas: los pedidos que compiten por el mismo viaje **esperan en fila** y ocupan una conexión del pool mientras tanto;
  si dos operaciones toman los mismos dos recursos en orden distinto pueden trabarse (interbloqueo).

### Opción B — Control optimista con número de versión
- Ventajas: no bloquea; nadie espera mientras otro decide; escala bien cuando los choques son raros.
- Desventajas: cuando 50 choferes aceptan a la vez, los choques son la norma: 49 fallan y, si reintentan, generan más carga;
  hay que coordinar la versión de dos filas (viaje y chofer) a la vez.

### Opción C — `UPDATE` condicional atómico (`UPDATE rides … WHERE id = $1 AND status = 'REQUESTED' RETURNING …`)
- Ventajas: una sola sentencia, sin esperar locks explícitos, muy eficiente para el viaje.
- Desventajas: resuelve un recurso por sentencia; para el chofer hace falta otra sentencia condicional y deshacer la primera
  si la segunda falla; los motivos de rechazo son menos claros (0 filas afectadas: ¿por qué?).

### Opción D — Solo restricciones de la base (índices únicos parciales)
- Ventajas: imposibles de saltear desde el código; no dependen de que todos los caminos tomen el lock.
- Desventajas: **no alcanzan solas**. El índice "un viaje activo por chofer" no impide que el mismo viaje se asigne a
  varios choferes *distintos*: lo comprobamos quitando el `FOR UPDATE` (ver Evidencia).

## Decisión

**Opción A + Opción D.** El caso de uso `AcceptRide` corre en una unidad de trabajo (`PgUnitOfWork`) que:
1. bloquea la fila del **viaje** (`SELECT … FROM rides WHERE id = $1 FOR UPDATE`);
2. bloquea la fila del **chofer** (`SELECT … FROM drivers WHERE user_id = $1 FOR UPDATE`);
3. verifica sobre el estado bloqueado: viaje en `REQUESTED`, chofer `APPROVED` y `AVAILABLE`, transición válida;
4. escribe viaje → `ASSIGNED`, chofer → `BUSY` e historial, y confirma todo junto.

Los índices únicos parciales `rides_one_active_per_driver` y `rides_one_active_per_passenger` quedan como red de seguridad:
si algún camino de código se saltea el lock, la base rechaza el estado inválido (`23505`, que se traduce a 409).

**Qué pasa si dos choferes aceptan en el mismo milisegundo:** los dos ejecutan el paso 1; Postgres le da el lock a uno y el
otro espera. El primero confirma con el viaje en `ASSIGNED`. Al liberarse el lock, Postgres le devuelve al segundo la versión
**ya confirmada** de la fila (en READ COMMITTED, una fila que se esperó con `FOR UPDATE` se vuelve a leer), ve `ASSIGNED` y
recibe `RIDE_NOT_AVAILABLE` (409). No puede haber doble asignación porque la decisión siempre se toma con el lock tomado.

**Cómo se evita el interbloqueo:** todos los casos de uso que tocan viaje y chofer los bloquean **en el mismo orden: primero
el viaje, después el chofer** (`AcceptRide`, `CancelRide`, y los que vengan). Si dos operaciones tomaran los mismos dos
recursos en orden inverso, cada una podría quedarse esperando la que tiene la otra. Como segunda defensa, si Postgres igual
detecta un interbloqueo (`40P01`) o un fallo de serialización (`40001`), `PgUnitOfWork` reintenta hasta 3 veces con una
espera corta y, si se agotan, responde `CONCURRENT_UPDATE_CONFLICT` (409), nunca 500.

**Cancelación simultánea a la aceptación:** `CancelRide` también bloquea primero el viaje, así que las dos operaciones se
serializan. Hay solo dos resultados posibles, ambos consistentes:
- **(a) gana la cancelación:** viaje `CANCELLED_BY_PASSENGER` sin chofer; la aceptación recibe `RIDE_NOT_AVAILABLE`; el chofer sigue `AVAILABLE`.
- **(b) gana la aceptación:** el viaje pasa a `ASSIGNED` y después la cancelación lo deja en `CANCELLED_BY_PASSENGER` y libera al chofer (`AVAILABLE`).

Nunca queda un viaje asignado sin pasajero ni un chofer `BUSY` sin viaje activo.

## Evidencia

| Prueba | Resultado |
|---|---|
| `acceptRide.postgres.test.ts` — 50 choferes aceptan el mismo viaje | 1 éxito, 49 × `RIDE_NOT_AVAILABLE`, 1 chofer `BUSY`, 1 fila de historial. Estable en 5 corridas seguidas |
| Mismo test **sin** `FOR UPDATE` en el viaje (experimento del 11/11) | **12 de 50** choferes "ganaron" el mismo viaje; el índice único no lo frenó porque eran choferes distintos |
| `acceptRide.postgres.test.ts` — un chofer acepta 10 viajes a la vez | 1 éxito, 9 × `DRIVER_NOT_AVAILABLE`, un solo viaje activo |
| `cancelVsAccept.postgres.test.ts` — 40 carreras cancelación vs aceptación | Siempre uno de los dos resultados documentados; se ejercitan los dos (~20/20 en 5 corridas); ningún chofer `BUSY` huérfano |

## Consecuencias

- Ganamos: la invariante se cumple aunque lleguen decenas de pedidos a la vez, con rechazos claros y testeados; la base protege
  la invariante del chofer aunque el código tenga un bug.
- Perdemos: las aceptaciones del mismo viaje se atienden una por una (esperan el lock), y cada una ocupa una conexión del pool
  mientras espera. Con 50 aceptaciones simultáneas y un pool de 20, el resto espera conexión.
- Queda más difícil: todo caso de uso nuevo que toque viaje y chofer **tiene que** respetar el orden viaje → chofer. Es una
  regla que no la verifica el compilador, solo la revisión de código y los tests.

## Qué nos haría cambiar de decisión

- Si al medir con carga real la espera por el lock del viaje domina el tiempo hasta la asignación → evaluar la Opción C
  (`UPDATE` condicional) para el viaje, manteniendo el lock del chofer.
- Si el sistema pasara a varias bases o particiones (los locks de fila dejan de alcanzar) → coordinación distinta.
