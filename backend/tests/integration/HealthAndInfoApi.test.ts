import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { container } from '../../src/infrastructure/di/container.js';

describe('Health & Observability API (Integration Tests - RT-06, RT-10)', () => {
  beforeAll(async () => {
    await container.initialize();
  });

  it('GET /health debe retornar estado 200 y diagnóstico de los dos proveedores de datos (RT-02)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.providers.primaryDatabase.status).toBe('UP');
    expect(res.body.providers.secondaryDataStore.status).toBe('UP');
    expect(res.body.system.nodeVersion).toBeDefined();
  });

  it('GET /info debe retornar información de versión y enlaces de documentación OpenAPI', async () => {
    const res = await request(app).get('/info');
    expect(res.status).toBe(200);
    expect(res.body.name).toContain('Uber');
    expect(res.body.docsUrl).toBe('/docs');
  });

  it('GET /api/v1/ruta-inexistente debe responder con formato RFC 7807 Problem Details (RT-03)', async () => {
    const res = await request(app).get('/api/v1/ruta-inexistente');
    expect(res.status).toBe(404);
    expect(res.body.type).toContain('not-found');
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.detail).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });
});
