# Perfiles, seguidores y notificaciones en Cheesit

## Uso

El menú de perfil permite buscar por el comienzo del @usuario. Acepta `@Usuario`, espacios exteriores y mayúsculas; puntos y guiones bajos son literales. Los resultados y las listas de conexiones tienen páginas de veinte personas.

Ambos perfiles integran seguidores y seguidos en la cabecera, con números y etiquetas compactos. Cada contador abre su lista. La ficha social conserva biografía, foto, nombre, @, «Te sigue» y seguir/dejar de seguir. Las relaciones son independientes.

En **Mi perfil → Compartir actividad**, cada propietario decide si comparte nivel, XP, estadísticas y sesiones completadas, incluidas sus notas. Las cuentas existentes mantienen su actividad privada por defecto. El correo y los datos físicos siempre permanecen privados.

El corazón de la cabecera abre las notificaciones y muestra un punto si hay novedades. También se incluye acceso directo a entrenar. En móvil, el control de sonido sigue disponible en Ajustes.

## Perfiles e historial

`ProfileStats`, `ProfileWorkouts` y `WorkoutDetailContent` se reutilizan en los perfiles propios y ajenos. La actividad compartida incluye ejercicios, series, repeticiones, pesos, convenciones de carga, RPE/RIR, notas, duración y prescripciones. Se ordena por fecha, creación e ID descendentes y se pagina de veinte en veinte.

Las acciones de edición y borrado permanecen fuera del detalle compartido. Solo el propietario puede modificar su documento mediante el guardado autenticado existente. Borradores, temporizadores, perfil físico, preferencias y ledger del juego nunca se proyectan.

El resumen usa `totals` y `gameProgress`, las mismas funciones que el perfil propio, con el documento exacto confirmado por el protocolo CAS de sincronización. Solo publica números derivados, validados por la base de datos. El XP se guarda por temporada para resolver el cambio de año sin mostrar el nivel del año anterior. Los clientes antiguos invalidan el resumen para evitar cifras desfasadas; sus datos siguen siendo compatibles.

Desactivar compartir oculta sesiones y estadísticas inmediatamente en las siguientes consultas, también mediante enlaces directos. Los detalles abiertos vuelven a comprobar permisos al recuperar foco, reconectar y cada treinta segundos. Una sesión eliminada o sin permiso muestra «Entrenamiento no disponible».

## Notificaciones

- **Nuevo seguidor:** avatar, nombre, descripción y tiempo relativo. Abre el perfil del actor.
- **Entrenamiento completado compartido:** describe los grupos musculares y abre directamente la sesión mediante `#view=social&person=…&workout=…`.
- La lectura individual se confirma antes de navegar. «Marcar todas como leídas» actualiza en el servidor únicamente los avisos del destinatario autenticado.
- Los avisos se ordenan por fecha e ID descendentes. La paginación usa ambos campos para no perder elementos con la misma marca temporal.
- Se consulta al abrir, recuperar foco, reconectar y cada treinta segundos con la pestaña visible. Hay estados de carga, error, reintento y lista vacía, además del acceso para invitados.

El trigger de follows emite un aviso con clave única por relación. El trigger de cuentas detecta la primera finalización de una sesión y elige los seguidores del autor en ese momento, siempre que comparta su actividad. No hay autoavisos, duplicados por reintentos, avisos por ediciones posteriores ni avisos retroactivos al compartir un historial existente. El ledger privado conserva los IDs ya publicados incluso tras una retirada del historial.

El almacenamiento de notificaciones no incluye el título del entrenamiento. La descripción se resuelve con permisos actuales; al revocar la actividad o retirar la sesión, su contenido deja de aparecer en los avisos.

## Privacidad y persistencia

- `cheesit_accounts`, `cheesit_identities` y los recibos mantienen su acceso privado mediante RLS. El correo permanece en Auth.
- `cheesit_social_profiles` proyecta identificador, @, nombre, foto, biografía y `activity_shared`. Solo contiene perfiles completados y solo los usuarios con sesión pueden leerlos. La foto sigue siendo el JPEG preparado por la app, sin URLs remotas.
- Los clientes solo pueden cambiar la columna de privacidad de su propio perfil. No pueden editar identidades ajenas ni escribir en las proyecciones de entrenamientos.
- Las tablas nuevas de actividad y notificaciones tienen RLS y privilegios mínimos. Cada persona solo puede leer sus avisos y actualizar su columna de lectura. No puede crear, borrar ni atribuir avisos a otra persona.
- Los triggers privilegiados están en `cheesit_private`, con `search_path` vacío y sin permiso de ejecución para clientes. Las consultas y la actualización de lectura son `SECURITY INVOKER`.
- La tabla privada de publicaciones tiene RLS sin políticas y sin privilegios de cliente: denegación por defecto. El asesor la señala de forma informativa; únicamente la usan los triggers internos. [Referencia del asesor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Las proyecciones no disponibles se conservan con una marca. La migración no elimina ni resetea cuentas, documentos privados, historiales, usuarios, recibos previos ni conexiones existentes.

## Migraciones y proyecto conectado

Están aplicadas en Cheesit (`fwfmwyyufafaxckkdwrx`):

- `20261103140756_social_follows.sql`: perfiles visibles y seguidores.
- `20261103194247_social_activity_notifications.sql`: privacidad de actividad, proyecciones, notificaciones y resumen numérico confirmado con el guardado de cuenta.

La nueva migración se creó con `supabase migration new social_activity_notifications` y se renombró a la versión registrada por Supabase tras `apply_migration`. No se ejecutaron resets ni se reaplicaron migraciones anteriores. En otra base, aplicar los archivos en orden mediante el flujo habitual del proyecto.

Antes y después de la nueva migración se comprobaron las **4 cuentas existentes**. La huella de sus documentos, revisiones, tombstones y marcadores de migración permaneció idéntica: `0e1a4c5cd87478a396964bbe532d9ad5`. No se escribieron ni borraron datos de cuentas reales durante las pruebas.

El asesor remoto conserva las advertencias previas de dos RPC privilegiados y protección de contraseñas filtradas desactivada. No se modifican esos controles desde esta ampliación. Referencias: [RPC privilegiados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Verificación

Resultado final: **219 pruebas unitarias/de integración aprobadas**, una prueba LIVE optativa omitida por falta de credenciales, **12 pruebas Chrome aprobadas**, TypeScript y build de producción correctos.

- `tests/account-transport-upgrade.test.ts`: recupera recibos de operaciones anteriores a la actualización, sin repetir escrituras ni aceptar documentos alterados.
- `tests/social-activity-database.test.ts`: resumen idéntico al del propietario, privacidad y permisos entre cuentas, eventos de finalización, borradores, edición, lectura persistente individual/global, seguidores posteriores, retirada de sesiones, paginación y compatibilidad de clientes antiguos.
- `tests/social-activity.spec.ts`: dos contextos Chrome, finalizar desde el editor real y sincronizar, recibir el aviso, abrir su detalle, recargar, conservar lectura, revocar permisos, errores HTTP, desconexión, modo invitado y acceso a entrenar.
- Regresión de `social.spec.ts`, `personal-profile.spec.ts` y `profile-menu.spec.ts`: conexiones, búsqueda, edición de perfiles, navegación, avatar, cambios entre dispositivos y modo sin conexión.
- `supabase/tests/social_activity_readonly.sql`: comprobación remota en transacción de solo lectura con claims de dos cuentas existentes. No crea usuarios ni muta historiales o follows.
- `npm test`, `npm run typecheck` y `npm run build`.

Las pruebas de escritura utilizan exclusivamente cuentas sintéticas en PostgreSQL local (PGlite). El servicio Auth/PostgREST de pruebas utiliza RLS/RPC reales de PostgreSQL, pero no pretende demostrar entrega de correo, validación JWT de Supabase ni funcionamiento en dispositivos físicos.

Capturas en `artifacts/social-activity/profile-{320,390,768,1440}.png` y `artifacts/social-activity/notifications.png`. Se comprueba que no haya desbordamientos y que los contadores permanezcan compactos.

Para Chrome, compilar y arrancar una instancia **aislada** con configuración de pruebas:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55440 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_fixture npm run build
npm start -- --port 3100 --hostname 127.0.0.1
```

En otra terminal:

```sh
CHEESIT_ACCOUNTS_FIXTURE=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
npx playwright test tests/social-activity.spec.ts tests/social.spec.ts \
  tests/personal-profile.spec.ts tests/profile-menu.spec.ts --workers=1
```

Las pruebas de modo sin conexión necesitan un build de producción, no `next dev`. No publicar el build del fixture. El build principal se ha realizado con la configuración normal. La base conectada está preparada. El frontend se publica mediante la integración GitHub–Vercel, conservando la configuración de producción.
