# Persistencia remota de Entrenos: contrato inicial

La migración `supabase/migrations/202610270001_entrenos.sql` prepara un almacén de instantáneas por usuario y un RPC transaccional para cambios. No proporciona una cuenta de Supabase ni conecta automáticamente la aplicación. Aún no se ha ejecutado ni probado con PostgreSQL real; **no constituye una garantía de sincronización ni de aislamiento lista para producción**.

## Preparación

1. Crear proyectos de desarrollo/pruebas y producción separados en Supabase. Activar Auth por correo/contraseña y configurar las URL de redirección y SMTP de producción. No utilizar datos personales reales en previews.
2. Definir `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `APP_ORIGIN` en el entorno correspondiente. La clave publicable no sustituye RLS; no incluir nunca `service_role`, claves de base de datos ni contraseñas en el navegador o el repositorio.
3. Aplicar las migraciones versionadas con el flujo de Supabase en la base de pruebas, primero en una base vacía y después sobre una copia de prueba; comprobar permisos, funcionamiento y rollback compatible antes de producción. Mantener PostgreSQL fuera del sistema de archivos efímero de las funciones.
4. Configurar copia externa cifrada diaria con retención de 30 días, alertas y pruebas trimestrales de restauración aislada. Medir RPO y RTO, no darlos por cumplidos sin ensayo.

## Lectura y cambios

El cliente autenticado puede leer `entrenos_entities`, filtrando `entity_type` y paginando por `created_at` e `id`; RLS solo devuelve filas del usuario cuya sesión está verificada. Las filas contienen `owner_id`, `entity_type`, `id`, `revision`, `payload`, `deleted`, `created_at` y `updated_at`. `deleted` es una marca de borrado y no debe filtrarse de la sincronización inicial si hay que propagar borrados. No se concede escritura directa sobre la tabla.

Cada operación se guarda primero junto al cambio local en una única transacción IndexedDB y se envía con la sesión del **mismo** usuario:

```ts
supabase.rpc('entrenos_apply_change', {
  p_operation_id: operationId,  // UUID estable por operación; reutilizar al reintentar
  p_expected_owner: ownerId,    // el servidor comprueba que coincide con auth.uid()
  p_device_id: deviceId,        // UUID estable por dispositivo
  p_entity_type: 'session',     // session | routine | exercise
  p_entity_id: workout.id,
  p_action: 'upsert',           // upsert | delete
  p_base_revision: revision,    // 0 para una entidad nueva
  p_payload: workout,           // null para delete; repetir exactamente en reintentos
})
```

El `payload` sigue el modelo de `src/lib/model.ts`: `id` coincide con `p_entity_id`. Una sesión tiene `date` civil `AAAA-MM-DD`, `status` (`draft` o `finished`), `name`, `color` y `exercises`; cada ejercicio contiene `id`, `exerciseId`, `name`, `mode` y `sets`, y cada serie `id`, `weight`, `reps`, `confirmed`. Una rutina tiene `name`, `color`, `archived` y `exercises` con `id`, `exerciseId` y `sets` previstas. Un ejercicio propio tiene `id`, `name`, `group` y `mode`. Las fechas se comprueban en Europe/Madrid. La sesión finalizada requiere al menos una serie confirmada y no admite filas sin confirmar. Los ejercicios de peso corporal usan peso 0 y quedan fuera del volumen.

Respuestas: `applied` incluye `revision` y `entity` canónica; `conflict` incluye `reason` (`revision`, `deleted` o `date_occupied`) y la entidad remota cuando existe; `invalid` indica un problema de validación. Un resultado es un acuse solo para la operación enviada: actualizar la revisión y después enviar la siguiente operación de la misma entidad con su nueva base. Mantener la cola y la copia local ante fallo de red o credenciales. Conservar ambas versiones al haber conflicto; su resolución genera otra operación con un UUID nuevo y la revisión remota actual. La eliminación crea una marca; la restauración explícita aún no está implementada.

El servidor registra resultado y huella del contenido junto con el cambio en una transacción, serializa operaciones del mismo propietario y rechaza reutilizar un UUID con contenido distinto. Los recibos de conflicto e invalidación también son estables: corregir datos o resolver conflicto exige un nuevo UUID. No se deben purgar recibos ni marcas de borrado sin un protocolo de expiración de clientes y respaldos.

## Trabajo pendiente antes del lanzamiento

- Conectar la autenticación, recuperación de contraseña, descarga paginada, cola IndexedDB por cuenta y procesamiento de operaciones en la interfaz. La migración por sí sola no sincroniza nada y no cifra el almacenamiento local.
- Implementar importación validada y atómica con múltiples sesiones históricas por día, idempotencia, modos históricos y conflictos. El RPC ordinario **no acepta importaciones, modos antiguos ni sesiones futuras**. No afirmar compatibilidad con respaldos antiguos sin muestras reales.
- Implementar una resolución explícita de conflictos que incluya restauración de borrados; el RPC rechaza la resurrección silenciosa.
- Ejecutar pruebas contra PostgreSQL real con dos usuarios para todos los accesos directos/RPC, intentos de escritura cruzada, llamadas concurrentes, reintentos, colisión de fechas, fechas de Madrid, credenciales vencidas y borrados. Verificar recuperación tras caída entre aplicación y acuse, cuota local y red intermitente. Revisar rendimiento e índices con datos representativos.
- Crear y comprobar políticas operativas para las credenciales, SMTP, alertas, copias y recuperación. Antes de publicar, probar PWA y Safari en un iPhone físico, incluidas actualizaciones y modo avión.

## Cliente preparado sin integrar

`src/lib/remote/auth.ts`, `queue.ts`, `sync.ts` y `types.ts` preparan el acceso, los cambios por cuenta y el RPC; `src/components/AccountPanel.tsx` es un formulario independiente. La aplicación principal aún no los usa: su almacenamiento local actual no está aislado por cuenta, por lo que **no debe conectarse el formulario hasta migrar esos datos explícitamente y asegurar que cada cambio visible y su operación comparten la misma transacción IndexedDB**. La cola nueva guarda sus propias instantáneas y operaciones en `entrenos-remote-v1`.

Antes de enviar, `flushQueue(owner)` verifica el usuario y el servidor compara `p_expected_owner` con `auth.uid()` para rechazar un cambio de cuenta durante la petición. El cliente conserva el ID, contenido y revisión de una petición enviada hasta recibir un acuse; un error de red conserva la operación. Las respuestas conflictivas bloquean esa entidad, no las demás. `resolveRevision` permite elegir entre la versión del servidor y la local solo para conflictos de revisión ordinarios; los conflictos de fecha, validación y borrado requieren interfaz y protocolo adicionales. El cierre de sesión no borra la cola local.

`downloadRemote` pagina y mezcla las filas sin sobrescribir pendientes, pero no certifica que la descarga sea una instantánea completa bajo cambios concurrentes. `flushQueue` requiere Web Locks para coordinar pestañas: en navegadores sin esa API informa de error y no sincroniza. No se ha implementado el disparo automático al volver a línea/foco ni el retroceso ante errores. El formulario de cuenta y la recuperación de contraseña requieren integración, ajustes de URLs permitidas y pruebas reales del flujo de correo. La autenticación depende del SDK y requiere conexión.

Las pruebas `tests/remote-queue.test.ts` usan IndexedDB simulado para comprobar aislamiento por cuenta, conservación de ediciones y resolución básica de conflictos; no sustituyen las pruebas con navegador, dos cuentas, Supabase y base de datos reales. Las garantías de sincronización, recuperación y disponibilidad sin conexión siguen sin verificarse.
