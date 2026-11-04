/**
 * RFC 7807 / RFC 9457 Problem Details para respuestas homogéneas de error de API (RT-03)
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  timestamp: string;
  invalidParams?: Array<{
    name: string;
    reason: string;
  }>;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly type: string;
  public readonly invalidParams?: Array<{ name: string; reason: string }>;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    type = 'about:blank',
    invalidParams?: Array<{ name: string; reason: string }>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.type = type;
    this.invalidParams = invalidParams;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404, 'NOT_FOUND', 'https://api.uber-tpi.utn.edu.ar/errors/not-found');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Credenciales inválidas o token expirado') {
    super(message, 401, 'UNAUTHORIZED', 'https://api.uber-tpi.utn.edu.ar/errors/unauthorized');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado al recurso solicitado') {
    super(message, 403, 'FORBIDDEN', 'https://api.uber-tpi.utn.edu.ar/errors/forbidden');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Error de validación en la solicitud', invalidParams?: Array<{ name: string; reason: string }>) {
    super(message, 400, 'VALIDATION_ERROR', 'https://api.uber-tpi.utn.edu.ar/errors/validation-error', invalidParams);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Petición incorrecta') {
    super(message, 400, 'BAD_REQUEST', 'https://api.uber-tpi.utn.edu.ar/errors/bad-request');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflicto con el estado actual del recurso') {
    super(message, 409, 'CONFLICT', 'https://api.uber-tpi.utn.edu.ar/errors/conflict');
  }
}
