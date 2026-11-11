# Plataforma de Viajes en Tiempo Real (Uber Clone) - TPI Programación IV

Trabajo Práctico Integrador para la cátedra de **Programación IV** - **Universidad Tecnológica Nacional (UTN) - Facultad Regional Resistencia**.

## 🚀 Arquitectura y Tecnologías

El proyecto es un monorepositorio con npm workspaces:

- **Backend**: Node.js, Express, TypeScript, SQLite (persistente relacional), Redis/In-Memory (presencia y tracking en tiempo real), Socket.IO (WebSockets bidireccionales), JWT (Access & Refresh tokens), bcrypt.
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Socket.IO Client.
- **Docker**: `docker-compose.yml` para orquestar backend, frontend y Redis.
- **CI/CD**: GitHub Actions workflow (`.github/workflows/ci.yml`).

## 📁 Estructura del Proyecto

```text
├── backend/                # API RESTful + Servidor WebSocket
│   ├── src/
│   │   ├── application/    # Casos de uso y servicios de aplicación
│   │   ├── domain/         # Entidades, interfaces y reglas de negocio
│   │   ├── infrastructure/ # SQLite, Redis, WebSockets, Seguridad
│   │   └── presentation/   # Controladores, rutas y middlewares
│   ├── tests/              # Tests unitarios e integración (Vitest)
│   └── openapi.yaml        # Documentación de la API (OpenAPI 3.0)
├── frontend/               # Single Page Application (SPA)
│   ├── src/
│   │   ├── components/     # Componentes UI (Chat modal, Navbar, Badges)
│   │   ├── context/        # Contextos de Autenticación y WebSockets
│   │   ├── hooks/          # Custom hooks (useGeolocation, useRide)
│   │   └── services/       # Clientes API Axios
├── docker-compose.yml      # Configuración de contenedores Docker
└── package.json            # Configuración de workspace raíz
```

## 🛠️ Instalación y Ejecución

### Prerrequisitos
- Node.js >= 18.0.0
- npm >= 9.0.0
- (Opcional) Docker & Docker Compose

### 1. Clonar e Instalar Dependencias
```bash
git clone https://github.com/LauOporto/AppUberTP_ProgIV.git
cd AppUberTP_ProgIV
npm install
```

### 2. Variables de Entorno
Copia el archivo de ejemplo en la raíz del repositorio (lo usan docker compose y el backend):
```bash
cp .env.example .env
```
Si falta una variable obligatoria o tiene un valor inválido, el backend no arranca e informa cuál es.

### 2.1 Base de datos: esquema y datos de prueba
Con PostgreSQL levantado (`docker compose up -d` o un PostgreSQL local apuntado por `DATABASE_URL`):
```bash
npm run setup      # = npm run migrate (migraciones SQL en backend/db/migrations) + npm run seed
```
Es idempotente: se puede correr varias veces. Usuarios de prueba: `admin@demo.local`, `operador@demo.local`,
`pasajero1..3@demo.local`, `chofer1..5@demo.local` (contraseña `Demo1234!`).
Los tests usan automáticamente una base aparte, `<nombre>_test`, que se crea y migra sola.

### 3. Ejecución en Modo Desarrollo
Para iniciar simultáneamente Backend (puerto 3000) y Frontend (puerto 5173):
```bash
npm run dev
```

O individualmente:
```bash
npm run dev:backend
npm run dev:frontend
```

### 4. Tests y Build
```bash
# Ejecutar tests unitarios e integrales
npm test

# Compilar backend y frontend
npm run build
```

### 5. Despliegue con Docker
```bash
docker compose up --build
```
