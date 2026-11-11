# ADR-0001: Usamos ESM como sistema de módulos, con TypeScript en modo NodeNext

- **Estado:** propuesto (pasa a aceptado cuando lo revisen los dos integrantes)
- **Fecha:** 11/11/2026
- **Participantes:** _completar_

## Contexto

El enunciado (§2.2) deja elegir entre CommonJS y ESM, pero exige justificarlo y no mezclar los dos sin explicación.
El proyecto arrancó con `"type": "module"` en `backend/package.json` y TypeScript con `module: NodeNext`.
Corremos en Node 22, usamos `tsx` para desarrollo y scripts, `vitest` para tests, y escribimos scripts de una sola
pasada (migraciones, seed, simulador, medición) que se benefician de `await` en el nivel superior.

## Opciones consideradas

### Opción A — ESM (`import`/`export`, `"type": "module"`)
- Ventajas:
  - Es el estándar del lenguaje y el formato al que va el ecosistema; varias librerías nuevas solo se publican en ESM.
  - `await` en el nivel superior: los scripts (`scripts/migrate.ts`, `seed.ts`) quedan lineales, sin envolver todo en una función.
  - `import.meta.url` da rutas relativas al archivo de forma explícita (lo usamos para ubicar `db/migrations/` y el `.env` de la raíz).
  - Los imports son estáticos: TypeScript y las herramientas detectan imports rotos sin ejecutar.
- Desventajas:
  - Con `NodeNext`, los imports relativos en TypeScript llevan extensión `.js` aunque el archivo sea `.ts`, y eso confunde al principio.
  - No existen `__dirname` ni `require`: hay que reemplazarlos por `import.meta.url` y `import()`.
  - Algunas herramientas viejas (por ejemplo, Jest sin configuración extra) tienen fricción con ESM.

### Opción B — CommonJS (`require`/`module.exports`)
- Ventajas:
  - Compatibilidad universal con librerías y herramientas viejas; `require` es sincrónico y simple de razonar.
  - `__dirname` y `require.resolve` disponibles sin trucos.
  - Sin extensiones `.js` en los imports.
- Desventajas:
  - Las librerías que solo publican ESM obligan a usar `import()` dinámico (asincrónico) en el medio del código.
  - Sin `await` en el nivel superior.
  - Es el formato en retirada: la documentación y los ejemplos nuevos asumen ESM.

## Decisión

Usamos **ESM** en todo el backend (`"type": "module"`) con TypeScript en `module`/`moduleResolution: NodeNext`.
No hay archivos CommonJS en el proyecto.

## Consecuencias

- Ganamos: scripts más simples con `await` en el nivel superior, rutas explícitas con `import.meta.url` y compatibilidad con librerías solo-ESM.
- Perdemos: hay que escribir `.js` en los imports relativos y no tenemos `__dirname`.
- Queda más difícil: integrar una herramienta que solo funcione con CommonJS (habría que aislarla o cargarla con `import()`).

## Qué nos haría cambiar de decisión

Que una dependencia imprescindible (por ejemplo, un SDK de un servicio externo) funcione solo en CommonJS y no se pueda
cargar con `import()`, o que una herramienta de medición o depuración que necesitemos no soporte ESM.
