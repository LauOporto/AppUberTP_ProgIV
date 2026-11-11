-- 001 — Esquema inicial: usuarios, choferes, parámetros de tarifa, viajes e historial de estados.
-- Las reglas que la base puede garantizar por sí sola (CHECK, UNIQUE parciales) se declaran acá:
-- son la red de seguridad aunque el código de aplicación tenga un bug.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('PASSENGER', 'DRIVER', 'OPERATOR', 'ADMIN')),
  name          text NOT NULL,
  phone         text,
  status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE drivers (
  user_id         uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  vehicle_plate   text NOT NULL,
  vehicle_model   text NOT NULL,
  vehicle_color   text NOT NULL,
  license_number  text NOT NULL,
  approval_status text NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'SUSPENDED')),
  availability    text NOT NULL DEFAULT 'OFFLINE' CHECK (availability IN ('OFFLINE', 'AVAILABLE', 'BUSY')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX drivers_plate_unique ON drivers (upper(vehicle_plate));

-- Parámetros de tarifa versionados: nunca se editan, se inserta una versión nueva y se activa.
-- Cada viaje guarda con qué versión se calculó, para poder explicar su precio después.
CREATE TABLE fare_config (
  id                  serial PRIMARY KEY,
  base_cents          integer NOT NULL CHECK (base_cents >= 0),
  per_km_cents        integer NOT NULL CHECK (per_km_cents >= 0),
  per_minute_cents    integer NOT NULL CHECK (per_minute_cents >= 0),
  minimum_fare_cents  integer NOT NULL CHECK (minimum_fare_cents >= 0),
  max_distance_meters integer NOT NULL CHECK (max_distance_meters > 0),
  average_speed_kmh   integer NOT NULL CHECK (average_speed_kmh > 0),
  active              boolean NOT NULL DEFAULT false,
  created_by          uuid REFERENCES users (id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- Como máximo una versión activa.
CREATE UNIQUE INDEX fare_config_single_active ON fare_config (active) WHERE active;

CREATE TABLE rides (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id               uuid NOT NULL REFERENCES users (id),
  driver_id                  uuid REFERENCES drivers (user_id),
  status                     text NOT NULL CHECK (status IN (
                               'REQUESTED', 'ASSIGNED', 'DRIVER_EN_ROUTE', 'IN_PROGRESS', 'COMPLETED',
                               'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_OPERATOR',
                               'NO_DRIVERS_AVAILABLE')),
  origin_address             text NOT NULL,
  origin_lat                 double precision NOT NULL CHECK (origin_lat BETWEEN -90 AND 90),
  origin_lng                 double precision NOT NULL CHECK (origin_lng BETWEEN -180 AND 180),
  destination_address        text NOT NULL,
  destination_lat            double precision NOT NULL CHECK (destination_lat BETWEEN -90 AND 90),
  destination_lng            double precision NOT NULL CHECK (destination_lng BETWEEN -180 AND 180),
  estimated_distance_meters  integer NOT NULL CHECK (estimated_distance_meters >= 0),
  estimated_duration_seconds integer NOT NULL CHECK (estimated_duration_seconds >= 0),
  estimated_fare_cents       integer NOT NULL CHECK (estimated_fare_cents >= 0),
  final_fare_cents           integer CHECK (final_fare_cents >= 0),
  fare_config_id             integer NOT NULL REFERENCES fare_config (id),
  cancellation_reason        text,
  version                    integer NOT NULL DEFAULT 1,
  requested_at               timestamptz NOT NULL DEFAULT now(),
  assigned_at                timestamptz,
  en_route_at                timestamptz,
  started_at                 timestamptz,
  completed_at               timestamptz,
  cancelled_at               timestamptz,
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  -- Coherencia entre estado y chofer: un viaje asignado/en curso/finalizado siempre tiene chofer,
  -- uno solicitado o sin choferes nunca lo tiene.
  CONSTRAINT rides_driver_matches_status CHECK (
    (status IN ('ASSIGNED', 'DRIVER_EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_DRIVER') AND driver_id IS NOT NULL)
    OR (status IN ('REQUESTED', 'NO_DRIVERS_AVAILABLE') AND driver_id IS NULL)
    OR status IN ('CANCELLED_BY_PASSENGER', 'CANCELLED_BY_OPERATOR')
  )
);

-- Invariantes del problema central (§6.3), garantizadas por la base:
-- un chofer tiene como máximo UN viaje activo...
CREATE UNIQUE INDEX rides_one_active_per_driver ON rides (driver_id)
  WHERE status IN ('ASSIGNED', 'DRIVER_EN_ROUTE', 'IN_PROGRESS');
-- ...y un pasajero también (incluye el viaje que todavía busca chofer).
CREATE UNIQUE INDEX rides_one_active_per_passenger ON rides (passenger_id)
  WHERE status IN ('REQUESTED', 'ASSIGNED', 'DRIVER_EN_ROUTE', 'IN_PROGRESS');

CREATE INDEX rides_passenger_history ON rides (passenger_id, requested_at DESC);
CREATE INDEX rides_driver_history ON rides (driver_id, requested_at DESC) WHERE driver_id IS NOT NULL;

-- Historial de transiciones: solo se inserta, nunca se modifica.
CREATE TABLE ride_status_history (
  id          bigserial PRIMARY KEY,
  ride_id     uuid NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  actor_id    uuid REFERENCES users (id),
  actor_role  text NOT NULL CHECK (actor_role IN ('PASSENGER', 'DRIVER', 'OPERATOR', 'SYSTEM')),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_status_history_by_ride ON ride_status_history (ride_id, created_at);
