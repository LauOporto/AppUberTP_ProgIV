42,8 |43,6 |68,6 |# Informe de mediciones

> Enunciado §4.7, §6.6 y §7.2. Cada sección tiene la hipótesis **escrita antes de medir** (con fecha y hora),
> el entorno, los comandos exactos, los resultados y la conclusión. Una hipótesis refutada se deja como está.

---

## 1. Tarea pesada: recepción masiva de ubicaciones + búsqueda de candidatos

### 1.1 Qué se mide

La tarea pesada del proyecto (§6.6) es recibir las ubicaciones de cientos de choferes cada 2 segundos
**y al mismo tiempo** buscar los choferes cercanos a un pasajero que cotiza o pide un viaje.

**Versión ingenua (HT-02, implementada a propósito):** cada reporte de ubicación se agrega a un registro
(log) en memoria que solo crece. Para buscar candidatos se recorre **todo** el log para reconstruir la última
posición de cada chofer, se calcula la distancia a todos en JavaScript y se ordena la lista completa.
El costo de cada búsqueda crece con la cantidad de reportes recibidos, no con la cantidad de choferes.

**Carga:**
- Simulador propio (`npm run simulate`): 500 choferes, un reporte cada 2 s → ~250 pedidos/s sostenidos.
- Búsqueda de candidatos a ritmo fijo: `POST /api/v1/rides/estimate` a 20 pedidos/s (pasajeros cotizando).
- Endpoint liviano medido: `GET /health` con autocannon, 10 conexiones, 30 s.

**Escenarios:**
- **E0 — Línea de base:** sin simulador, misma carga de cotizaciones y medición de `/health`.
- **E1 — Ingenua:** con el simulador corriendo (el log crece ~250 entradas/s).
- **E2 — Optimizada:** pendiente (HT-03).

Cada escenario: 3 corridas de 30 s.

### 1.2 Hipótesis (escrita el 11/11/2026, antes de implementar la versión ingenua y antes de medir)

Esperamos que:

1. **Línea de base (E0):** `/health` con p95 < 10 ms y p99 < 15 ms; `POST /rides/estimate` con p95 < 15 ms.
   El lag p99 del event loop queda en el piso del temporizador de Windows (~16–17 ms).
2. **Ingenua (E1), después de unos minutos de simulador (≥ 50 000 reportes en el log):**
   - cada cotización tarde más de **20 ms en p95**, porque recorre todo el log;
   - el p99 de `/health` sea **al menos el doble** que en E0, porque las búsquedas ocupan el hilo y `/health` espera;
   - los pedidos/s de `/health` caigan **al menos un 25 %** respecto de E0;
   - el lag máximo del event loop supere los **30 ms**;
   - la memoria (RSS) crezca **más de 10 MB** a lo largo de las corridas, porque el log no se purga nunca;
   - las tres corridas de E1 empeoren de la primera a la tercera, porque el log sigue creciendo.

### 1.3 Entorno (medición del 11/11/2026)

| Ítem | Valor |
|---|---|
| Máquina | Intel Core i3-12100 (4 núcleos / 8 hilos), 15,8 GB RAM |
| Sistema operativo | Windows 11 Pro (NT 10.0.26300), x64 |
| Node.js | v26.12.1 (⚠️ el enunciado pide Node 22: repetir con 22 para la versión final) |
| Docker | No: servidor, simulador y autocannon corriendo directo en la misma máquina |
| Base de datos | No interviene: la API medida todavía usa almacenamiento en memoria (el índice ingenuo es en memoria) |
| Otros procesos | Simulador y autocannon compiten por CPU con el servidor (misma máquina); IDE abierto |
| Logs del servidor | Un log JSON por pedido, redirigido a archivo |
| Rate limit | Subido solo para medir: `RATE_LIMIT_MAX=100000000`, `AUTH_RATE_LIMIT_MAX=1000000` (todo sale de una IP) |
| Piso del lag | ~16 ms en reposo, por la granularidad del temporizador de Windows (en Linux es mucho menor) |
| Código | rama `feat/F1-cimientos` (sin commit al momento de medir) |

### 1.4 Comandos exactos

Desde `backend/` (sintaxis bash; en PowerShell: `$env:PORT=3100; ...`):

```bash
# Terminal 1 — servidor de medición, instancia nueva
PORT=3100 RATE_LIMIT_MAX=100000000 AUTH_RATE_LIMIT_MAX=1000000 npx tsx src/server.ts > server.log 2>&1

# E0 — línea de base (sin simulador)
npm run bench -- --base-url http://localhost:3100 --label "E0 línea de base" --runs 3 --duration 30 --output ../docs/mediciones/e0-baseline.json

# E1 — Terminal 2: simulador de 500 choferes (registra ~2 min y después reporta cada 2 s)
npm run simulate -- --base-url http://localhost:3100 --drivers 500 --interval 2000 --duration 1200 --fresh

# E1 — Terminal 3: espera a que el log tenga ≥ 50 000 entradas y mide
npm run bench -- --base-url http://localhost:3100 --label "E1 ingenua (500 choferes)" --runs 3 --duration 30 --min-index-entries 50000 --output ../docs/mediciones/e1-naive.json
```

Cada corrida del bench lanza en paralelo, durante 30 s:
- `GET /health` con 10 conexiones a máxima velocidad (endpoint liviano medido);
- `POST /api/v1/rides/estimate` a 20 pedidos/s fijos (búsqueda de candidatos).

Antes de cada corrida hace `POST /metrics/reset` y al final lee `GET /metrics`. autocannon no informa p95,
así que el script registra cada latencia en un histograma propio y calcula p50/p95/p99 de ahí.
Los resultados completos de cada corrida están en `docs/mediciones/*.json`.

### 1.5 Resultados

**Endpoint liviano `GET /health`** (10 conexiones, 30 s por corrida):

| Escenario | Corrida | p50 (ms) | p95 (ms) | p99 (ms) | Pedidos/s |
|---|---|---|---|---|---|
| E0 línea de base | 1 | 0,63 | 1,33 | 2,13 | 13 526 |
| E0 línea de base | 2 | 0,63 | 1,34 | 2,12 | 13 373 |
| E0 línea de base | 3 | 0,64 | 1,34 | 2,16 | 13 374 |
| **E0 promedio** | | **0,63** | **1,34** | **2,14** | **13 424** |
| E1 ingenua | 1 | 0,65 | 1,59 | 4,58 | 10 274 |
| E1 ingenua | 2 | 0,64 | 1,56 | 5,11 | 10 046 |
| E1 ingenua | 3 | 0,64 | 1,57 | 4,15 | 9 645 |
| **E1 promedio** | | **0,64** | **1,57** | **4,61** | **9 988** |

**Búsqueda de candidatos `POST /api/v1/rides/estimate`** (20 pedidos/s):

| Escenario | Corrida | Entradas en el log (inicio → fin) | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|---|---|
| E0 | 1 / 2 / 3 | 0 → 0 | 2,42 / 2,63 / 2,73 | 6,04 / 4,24 / 4,77 | 14,22 / 9,65 / 7,58 |
| E1 | 1 | 51 045 → 58 553 | 45,41 | 77,57 | 90,30 |
| E1 | 2 | 59 831 → 67 311 | 66,94 | 88,45 | 94,14 |
| E1 | 3 | 68 644 → 76 331 | 98,88 | 129,28 | 144,38 |

**Servidor** (lag del event loop con `monitorEventLoopDelay`, resolución 10 ms; ELU = utilización del event loop):

| Escenario | Corrida | Lag p99 (ms) | Lag máx (ms) | ELU | RSS (MB) | Heap usado (MB) |
|---|---|---|---|---|---|---|
| E0 | 1 / 2 / 3 | 15,61 / 15,62 / 12,43 | 21,38 / 23,23 / 37,72 | 0,97 / 0,97 / 1,00 | 114,5 / 114,1 / 115,4 | 24,1 / 29 / 33,3 |
| E1 | 1 | 67,50 | 97,71 | 1,00 | 166,7 | 68,6 |
| E1 | 2 | 79,69 | 120,91 | 1,00 | 168,8 | 43,6 |
| E1 | 3 | 115,61 | 158,99 | 0,98 | 171,8 | 42,8 |

**Lo que vio el simulador** (latencia de los reportes de ubicación, ventanas de 30 s): antes de que arrancara E1
el p95 era 8–10 ms; durante las corridas de E1 subió a 54 → 78 → 112 ms. Los choferes también sufren las búsquedas.

### 1.6 Conclusión

**La hipótesis se cumplió en todos sus puntos**, dos de ellos por poco margen:

| Punto de la hipótesis | Esperado | Medido | |
|---|---|---|---|
| E0 `/health` | p95 < 10, p99 < 15 ms | 1,34 / 2,14 ms | ✅ |
| E0 cotización | p95 < 15 ms | 5,02 ms | ✅ |
| E1 cotización | p95 > 20 ms | 77,6 → 129,3 ms | ✅ |
| E1 `/health` p99 | ≥ ×2 | ×2,15 | ✅ (justo) |
| E1 `/health` pedidos/s | caída ≥ 25 % | −25,6 % | ✅ (justo) |
| E1 lag máximo | > 30 ms | 97,7 → 159,0 ms | ✅ |
| E1 memoria | > +10 MB | +55 MB | ✅ |
| E1 empeora corrida a corrida | sí | sí | ✅ |

Por qué pasa: cada cotización recorre el log entero (50–76 mil entradas) de forma **sincrónica**. Mientras lo hace,
el event loop no atiende nada más, y el lag máximo crece de ~25 ms a ~160 ms. El costo de cada búsqueda depende de la
cantidad de reportes recibidos, no de la cantidad de choferes: con los mismos 500 choferes, la mediana de la
cotización pasó de 45 a 99 ms en dos minutos, solo porque el log creció. La memoria crece sin límite por la misma razón.

Lo que muestran los percentiles (§3.6): **la mediana de `/health` no cambió** (0,63 → 0,64 ms). Toda la degradación
está en la cola: el p99 se duplicó y el throughput cayó un cuarto. Un informe con promedios o medianas no la vería.

Limitaciones de esta medición:
- `/health` se mide a máxima velocidad, así que el servidor ya está saturado en la línea de base (ELU ≈ 0,97). La
  comparación mide throughput y latencia de cola bajo saturación, no el comportamiento con poca carga.
- Servidor, simulador y autocannon comparten la misma CPU.
- Windows (piso de ~16 ms en el lag) y Node 26.
- Todavía no hay asignación automática, así que no se midió el tiempo hasta la asignación.

### 1.7 Pendiente para la versión final

- Versión optimizada (E2, HT-03): última posición por chofer + índice espacial, y su ADR (ADR-0005).
- Tiempo hasta la asignación (§6.6): todavía no hay asignación automática por ofertas (TAR-03).
- Medir `POST /rides` además de la cotización cuando la API corra sobre PostgreSQL.
- Repetir en Linux/Docker y con Node 22 (la máquina de desarrollo tiene Node 26 y Windows).

---

## 2. Carrera principal: asignación concurrente de viajes

_Pendiente: hipótesis, comparación con y sin `SELECT … FOR UPDATE` (experimento preliminar del 11/11:
sin el bloqueo, 12 de 50 choferes "ganaron" el mismo viaje), latencia de `accept` con contención._
