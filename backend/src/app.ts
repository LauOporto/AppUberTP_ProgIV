import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
import { apiReference } from '@scalar/express-api-reference';

import { config } from './config/environment.js';
import { requestLogger } from './presentation/middlewares/requestLogger.js';
import { errorHandler, notFoundHandler } from './presentation/middlewares/errorHandler.js';
import { apiRateLimiter } from './presentation/middlewares/rateLimiter.js';
import apiRoutes from './presentation/routes/index.js';
import { runtimeMetrics } from './infrastructure/observability/runtimeMetrics.js';
import { isMetricsRequestAllowed } from './infrastructure/observability/metricsAccess.js';

const app = express();

// Seguridad de cabeceras HTTP (OWASP - RT-04)
app.use(
  helmet({
    contentSecurityPolicy: false // Permitir interfaz interactiva de documentación Scalar
  })
);

// Habilitar CORS acorde al frontend (RT-04, REQ-10)
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID']
  })
);

// Parsing de JSON y datos URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trazabilidad y Logging estructurado (RT-10)
app.use(requestLogger);

// Conteo de pedidos por ventana de medición (Bloque 7)
app.use(runtimeMetrics.countRequests);

// Métricas del proceso: lag del event loop, utilización, memoria, pedidos/s (Bloque 7, §11.2).
// Van fuera de /api para que el rate limit no interfiera con la medición.
const guardMetrics: express.RequestHandler = (req, res, next) => {
  const allowed = isMetricsRequestAllowed({
    ip: req.ip ?? req.socket.remoteAddress,
    authorizationHeader: req.headers.authorization,
    configuredToken: config.metrics.token
  });
  if (!allowed) {
    // 404 y no 403: no se confirma que el endpoint exista.
    res.status(404).json({ status: 404, title: 'Not Found', code: 'ROUTE_NOT_FOUND' });
    return;
  }
  runtimeMetrics.start();
  next();
};

app.get('/metrics', guardMetrics, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(runtimeMetrics.snapshot());
});

// Cierra la ventana actual (devuelve sus números) y empieza una nueva: se llama al inicio de cada corrida.
app.post('/metrics/reset', guardMetrics, (_req, res) => {
  const previousWindow = runtimeMetrics.snapshot();
  runtimeMetrics.reset();
  res.json({ reset: true, previousWindow });
});

// Rate Limiting global para API (RT-04)
app.use('/api', apiRateLimiter);

// Servir especificaciones OpenAPI (RT-05)
const openapiPath = path.resolve(process.cwd(), 'openapi.yaml');
let openapiContent = '';
let openapiJsonObj: Record<string, unknown> = {};

if (fs.existsSync(openapiPath)) {
  openapiContent = fs.readFileSync(openapiPath, 'utf8');
  try {
    openapiJsonObj = YAML.parse(openapiContent);
  } catch (err) {
    console.error('Error parseando openapi.yaml', err);
  }
}

app.get('/openapi.yaml', (_req, res) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.send(openapiContent);
});

app.get('/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openapiJsonObj);
});

// Documentación interactiva de API con Scalar (RT-05)
app.use(
  '/docs',
  apiReference({
    theme: 'purple',
    spec: {
      content: openapiJsonObj
    }
  })
);

// Montar Rutas de la API v1
app.use('/api/v1', apiRoutes);

// Alias directo para observabilidad y health check (/health, /info)
app.use('/', apiRoutes);

// Manejo centralizado de errores (RFC 7807 Problem Details - RT-03)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
