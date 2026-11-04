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
Copia el archivo de ejemplo en el backend:
```bash
cp backend/.env.example backend/.env
```

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
