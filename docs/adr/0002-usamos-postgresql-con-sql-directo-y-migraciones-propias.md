# ADR-0002: Usamos PostgreSQL con SQL directo (`pg`) y migraciones SQL propias

- **Estado:** propuesto (pasa a aceptado cuando lo revisen los dos integrantes)
- **Fecha:** 11/11/2026
- **Participantes:** _completar_

## Contexto

El enunciado exige una base relacional (recomienda PostgreSQL), prohíbe persistir en memoria o en archivos JSON,
deja libre el acceso a datos (SQL directo, query builder u ORM) y exige que podamos **mostrar el SQL que se ejecuta** (§2.2, §11.4).

El problema central (§6.3) necesita garantías fuertes de la base:
- bloquear filas (`SELECT … FOR UPDATE`) dentro de transacciones;
- restricciones que hagan imposible el estado inválido, en particular **índices únicos parciales**
  ("un viaje activo por chofer" = único por `driver_id` *solo* entre los viajes en estados activos);
- `CHECK` sobre estados y montos.

El scaffold inicial decía usar SQLite, pero en realidad guardaba todo en `Map` en memoria.

## Opciones consideradas

### Base de datos

#### PostgreSQL
- Ventajas: índices únicos parciales (`CREATE UNIQUE INDEX … WHERE …`), `SELECT … FOR UPDATE` / `SKIP LOCKED`, `CHECK`,
  `timestamptz`, advisory locks, extensión PostGIS si la elegimos para la búsqueda geográfica; es la recomendada por la cátedra.
- Desventajas: un servicio más para levantar (Docker); más configuración que una base embebida.

#### MySQL
- Ventajas: muy difundida, también tiene `FOR UPDATE` y transacciones InnoDB.
- Desventajas: **no tiene índices únicos parciales** (habría que simularlos con columnas generadas o triggers), y no tiene `SKIP LOCKED` en versiones viejas.

#### SQLite
- Ventajas: sin servidor, archivo único, cero configuración.
- Desventajas: bloquea a nivel de base para escribir (no hay `FOR UPDATE` por fila), lo que vuelve irreal la prueba de concurrencia; no es lo que se usaría con varios procesos.

### Acceso a datos

#### `pg` (node-postgres) con SQL escrito a mano
- Ventajas: el SQL que se ejecuta es exactamente el que está en el código (lo pide la defensa); acceso directo a `FOR UPDATE`, índices parciales, `RETURNING`, advisory locks y códigos de error (`23505`, `40P01`); una sola dependencia chica.
- Desventajas: mapear filas a objetos es manual y repetitivo; sin tipado automático de los resultados; los filtros dinámicos se arman a mano (con cuidado de parametrizar siempre).

#### Knex (query builder)
- Ventajas: arma consultas de forma programática, tiene `.forUpdate()` y una herramienta de migraciones.
- Desventajas: los índices parciales y algunos detalles igual requieren SQL crudo; agrega una capa que hay que saber traducir a SQL en la defensa.

#### Prisma (ORM)
- Ventajas: tipado automático, migraciones generadas, productividad alta en CRUD.
- Desventajas: no expresa `SELECT … FOR UPDATE` ni índices únicos parciales en su esquema (hay que caer a SQL crudo justo en lo más importante del proyecto); oculta el SQL; el motor de consultas es un binario aparte.

## Decisión

**PostgreSQL 16** como base principal, con **`pg` y SQL escrito a mano**, siempre parametrizado (`$1, $2…`).
Las migraciones son archivos SQL versionados en `backend/db/migrations/NNN_descripcion.sql`, aplicados por un ejecutor
propio (`infrastructure/db/postgres/migrations.ts`) que:
- corre cada migración en su propia transacción;
- guarda un hash del archivo en `schema_migrations` y aborta si alguien edita una migración ya aplicada;
- toma un advisory lock para que dos procesos no migren a la vez.

## Consecuencias

- Ganamos: control total del SQL y de las garantías de concurrencia; las invariantes del problema central quedan también en la base (`rides_one_active_per_driver`, `rides_one_active_per_passenger`, `CHECK` de estado ↔ chofer); el SQL se puede mostrar tal cual.
- Perdemos: más código de mapeo y tipos escritos a mano.
- Queda más difícil: consultas con muchos filtros opcionales (hay que armarlas con cuidado para no concatenar texto).
- Lección aprendida al implementarlo: el ejecutor de migraciones pedía una segunda conexión a un pool de `max: 1` mientras tenía tomada la primera, y se colgaba hasta el timeout. Todo lo que corre bajo el advisory lock usa ahora la misma conexión.

## Qué nos haría cambiar de decisión

- Si el código de mapeo y los filtros dinámicos crecen al punto de generar errores frecuentes → evaluar Knex para esas consultas.
- Si eligiéramos PostGIS para la búsqueda geográfica, no cambia esta decisión (es una extensión de PostgreSQL).
