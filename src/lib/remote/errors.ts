/** A connection failure is retryable without asking the person to sign in again. */
export class RemoteConnectionError extends Error {
  constructor() { super('No se pudo conectar con la nube. Tus cambios siguen en este dispositivo; se reintentará al recuperar la conexión.'); }
}
