# Cuentas y sincronización de Cheesit — 2 de noviembre de 2026

## Perfil personal — 3 de noviembre de 2026

El icono de persona del extremo derecho abre un desplegable con «Mi perfil» y «Ajustes». «Mi perfil» abre `#view=profile`, siempre dentro de la cuenta autenticada. La sincronización, su reintento, la sesión y las copias de recuperación se consultan en Ajustes → Cuenta y sincronización; no hay barra superior de cuenta. El menú se cierra al elegir una opción, pulsar fuera o usar Escape, y admite navegación con teclado. No acepta un propietario en la ruta ni incorpora perfiles públicos o funciones sociales. El nombre (80 caracteres), la biografía (300) y la foto se guardan en `AppData.personalProfile`, sin modificar `profile`, que sigue siendo el perfil de entrenamiento utilizado por las reglas de XP.

La foto se admite en JPG, PNG o WebP de hasta 8 MiB y 40 megapíxeles; el navegador recorta el centro, reduce a 384 × 384 y vuelve a codificar como JPEG, sin conservar los metadatos del archivo original. Se almacena una única imagen embebida de hasta 262.144 caracteres dentro del documento privado de la cuenta. No se crean buckets, enlaces públicos ni peticiones a servidores de imágenes. Cambiar o quitar la foto pasa por la misma cola, revisión y recibo que el resto de cambios; quitarla guarda `photo: null`. Los recibos históricos y las copias de recuperación mantienen su comportamiento anterior y pueden conservar versiones anteriores del perfil.

La identidad personal tiene su propia comparación de tres versiones: una edición del nombre puede combinarse con actividad guardada en otro dispositivo; dos cambios distintos de identidad requieren elegir una versión y conservan una copia de recuperación. La comparación muestra foto, nombre y biografía. Las copias JSON incluyen esta información, conservan el perfil actual al incorporar una copia antigua sin él y exigen resolver identidades divergentes. El editor protege los cambios sin guardar frente a navegación, recarga y actualizaciones automáticas.

Los contadores reutilizan `totals`: solo entrenamientos finalizados y series confirmadas válidas. El nivel usa exactamente el cálculo de la cabecera. Las seis sesiones recientes se ordenan por fecha de entrenamiento y desempatan por creación e ID, excluyendo borradores y eliminadas. Sus detalles conservan el regreso al perfil incluso después de recargar. Las cuentas nuevas muestran avatar predeterminado, cero actividad y el nivel inicial real del juego.

Se corrigió además el refresco inicial de una cuenta ya almacenada en caché: cuando la primera descarga cambia el documento, la vista montada se actualiza. Una edición sin guardar aplaza esa actualización hasta que pueda completarse con seguridad.

**Migración aplicada:** `supabase/migrations/20261102233213_personal_profiles.sql` amplía el validador existente; conserva sus comprobaciones anteriores, RLS, RPC y permisos. Se aplicó con autorización del usuario al proyecto `fwfmwyyufafaxckkdwrx`; la versión local coincide con el historial remoto. La consulta real acepta perfiles vacíos y mantiene denegada la ejecución directa del validador para `authenticated` y la escritura anónima. Los asesores conservan sus avisos anteriores, sin introducir avisos nuevos. Las pruebas funcionales completas usan Auth de prueba y PostgreSQL local, sin modificar perfiles reales.

Verificación de la versión aislada completada: **203 pruebas aprobadas, 0 fallos y 1 LIVE omitida**; **9 recorridos Chrome aprobados** (6 de cuentas y 3 de perfil), TypeScript, compilación y revisión de diff correctos. Se inspeccionaron las capturas responsive y el editor.

Pruebas del perfil: `tests/personal-profile.test.ts` cubre validación, copias, mezcla de cambios, SQL transaccional, CAS, borrado de foto y aislamiento RLS. `tests/personal-profile.spec.ts` recorre subida/cambio/eliminación de foto, persistencia offline, dos dispositivos, aislamiento de cuentas, actividad real, detalle, conflictos y tamaños 320/390/768/1440. Ejecutar esta última junto a `tests/accounts.spec.ts` con la configuración de fixture descrita abajo. Las capturas se guardan en `artifacts/personal-profile/`.

## Conexión de desarrollo verificada

La aplicación local está conectada a **Cheesit**, proyecto Supabase `fwfmwyyufafaxckkdwrx` (eu-west-1). Antes de conectar se comprobó que no tenía tablas públicas, migraciones ni usuarios. Se aplicaron las cinco migraciones de `supabase/migrations/`, en orden, y su historial remoto coincide con las versiones locales. En la verificación inicial no se publicó en producción ni se cambió la configuración de Vercel. La publicación posterior se prepara desde un worktree aislado y añade exclusivamente las tres variables públicas de `.env.example`, con créditos de prueba desactivados.

`.env.local` contiene la URL y la clave **publicable** obtenida del proyecto; está ignorado por Git y tiene permisos 600. Se conservó la configuración local anterior. No se han obtenido credenciales administrativas, contraseñas de base de datos ni claves `service_role`. Las contraseñas elegidas por el usuario se introdujeron directamente en la app/panel y no se guardaron en el código ni en el chat. El archivo local de pruebas ya no contiene la contraseña temporal utilizada inicialmente.

Auth mantiene Email/Password con confirmación de correo, sin usuarios anónimos. Site URL de publicación es `https://cheesit-entrenos.vercel.app`; se conservan las redirecciones de localhost y se añaden las dos rutas exactas de acceso y recuperación del dominio público. El registro y la recuperación reales entregaron correo y se completaron en el navegador. **Sigue activo el correo integrado limitado de Supabase**: antes de admitir usuarios externos hay que configurar SMTP propio directamente en el panel, sin pasar sus credenciales por el chat. Véase [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Para reproducir esta configuración en otro entorno de desarrollo:

1. Comprobar el proyecto de destino y aplicar solo las migraciones que falten, por orden.
2. Copiar `.env.example` a `.env.local` y completar las dos variables públicas. Nunca usar claves administrativas en `NEXT_PUBLIC_*`.
3. Configurar en Auth el origen y las redirecciones exactas del entorno; conservar la confirmación de correo.
4. Recompilar: Next incorpora las variables públicas al construir. Sin configuración el acceso queda cerrado y el historial antiguo permanece intacto.
5. Repetir las pruebas de dos cuentas y el recorrido de correo. La suite LIVE requiere credenciales de pruebas introducidas localmente; no se solicitan por el chat.

Se consultaron las guías instaladas de Next para autenticación, componentes cliente/servidor y variables de entorno. Referencias: [eventos de sesión](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [funciones de base de datos](https://supabase.com/docs/guides/database/functions).

## Datos y protocolo

`AccountGate` aísla la UI por cuenta; `EntrenosApp` recibe una instancia de persistencia ligada a un propietario, sin un propietario global mutable. Se reutilizan Supabase Auth y el importador/validador ya preparados. El protocolo previo `entrenos_entities` solo guardaba tres tipos, con operaciones independientes y sin el juego. Se conserva como contrato v1; **no se envía el mismo cambio por ambos protocolos**.

El protocolo activo v2 guarda `AppData` completo en `cheesit_accounts`: sesiones finalizadas, borradores de entrenamiento y sus textos parciales, rutinas y su borrador, fichas propias, perfil, preferencias, metas, inventario, equipo, habilidades consumidas, apertura de cofre pendiente, objetivos cobrados, conversiones históricas, progreso y bloqueos de cofres por temporada. Son los campos actuales de `model.ts` y `GameState`. Los ajustes de sonido y efectos dejan de escribirse en una preferencia compartida entre cuentas. La preferencia local antigua solo se lee durante la migración.

`cheesit_commit_account` exige `auth.uid() = p_expected_owner`. Las tablas solo conceden SELECT con RLS al propietario; no hay INSERT/UPDATE/DELETE directos para clientes. La función usa búsqueda de esquemas fija, bloqueo transaccional por propietario, comprobación de revisión y recibos con UUID y huella SHA-256 del contenido. Estado y recibo se confirman juntos. Repetir una operación devuelve el mismo resultado; reutilizar el UUID con otro contenido se rechaza. La validación de estructura, identificadores, fechas, series, perfil, compras, metas y premios de objetivos/pasivas se ejecuta en PostgreSQL antes de escribir. Las pasivas capturadas no se sustituyen al editar sesiones antiguas.

La tabla v1 y su cola preparada no se borran. Como no había un flujo conectado a ellas en la app anterior, no se presupone que contengan una cuenta completa: si se usaron manualmente fuera de esta aplicación, hay que revisar e incorporar esos datos por separado antes de cambiar ese cliente. En este proyecto concreto se verificó que las tablas v1 estaban vacías antes de conectar.

## Caché, cola y concurrencia

IndexedDB `cheesit-accounts-v2` guarda por usuario la base descargada, el estado de trabajo, las operaciones en vuelo y los conflictos. Cada cambio local y su estado pendiente se confirman en una transacción estricta. La operación enviada queda congelada en disco antes de hacer la petición. Un corte antes o después del acuse permite reintentar el mismo UUID sin repetir premios ni compras.

La nube proporciona la revisión base. Se descarga al abrir cuenta, al volver la conexión/foco y cada 15 segundos con la página visible. Se envían cambios automáticamente después del guardado local. Los estados distinguen guardando, sincronizado, pendiente de conexión, error y conflicto. Un guardado local modificado nunca es un acuse remoto. Se puede reintentar desde Ajustes → Cuenta y sincronización.

Aunque se confirma un documento completo para mantener unida la economía, **no se sobrescribe una revisión remota distinta con una copia local antigua**. Se hace una comparación de tres versiones por registro de rutina/ejercicio, borrador y preferencias. El historial, perfil y juego se tratan como un bloque económico: si dos dispositivos modifican ese bloque, la UI exige elegir una versión y conserva ambas. No suma compras ni cargas independientes. Las diferencias se muestran con nombres, fechas, series e inventario, sin exigir archivos JSON.

También se conserva la base que veía el editor: un guardado que coincide con una descarga no elimina registros recién recibidos. Las pulsaciones y guardados sucesivos del mismo editor se consideran una continuación, y un guardado retrasado de una versión anterior no puede recuperar un borrador ya finalizado.

Las eliminaciones generan marcas monotónicas que el servidor exige y no permite retirar. Un dispositivo atrasado, una importación repetida o una elección de una rama antigua no puede resucitar esos IDs. La restauración de un registro eliminado con el mismo ID no está implementada.

Entre pestañas, una revisión local se compara atómicamente en IndexedDB; BroadcastChannel solo avisa. Una pestaña desactualizada protege su edición y ofrece **Recuperar cambios de las pestañas**. Las diferencias compatibles se combinan y las incompatibles pasan a revisión. No depende de Web Locks para mantener esta garantía.

Cerrar sesión conserva la cola de esa cuenta, oculta su información y permite continuarla al volver a entrar con el mismo usuario. Si quedan cambios pendientes, se explica que permanecen en ese navegador y se pide elegir si salir conservándolos. Una edición histórica o rutina abierta exige guardar/descartar antes de salir. Un cambio de sesión en otra pestaña intenta confirmar también la edición preparada localmente antes de liberar su instancia; no la envía como el siguiente usuario.

Las copias de conflictos se pueden revisar en **Mi cuenta → Revisar copias de conflictos**, e incorporar con el mismo flujo de revisión. Son privadas de la cuenta en la UI, pero IndexedDB no está cifrado: quien tenga acceso administrativo al perfil del navegador puede inspeccionar su almacenamiento. La app no promete borrado físico ni cifrado de dispositivo al cerrar sesión.

## Migración del historial anterior

Se lee `entrenos-local/state/local` sin ejecutar su antigua normalización con escritura al leer. El original no se modifica ni se elimina, incluso después de una incorporación correcta. Se conserva una fuente congelada con huella SHA-256, más las preferencias locales antiguas cuando existen.

Después del acceso aparece una explicación con el número de registros y la opción de revisar e incorporar. Se reutiliza la combinación validada de respaldos para conservar IDs, cargas y convenciones, fechas, borradores y juego; no se concede ninguna misión al importar. Perfil y preferencias divergentes tienen una decisión explícita. La migración queda ligada a una cuenta mediante una reclamación atómica antes de encolarla. No se ofrecerá automáticamente a una segunda cuenta.

Un marcador de migración se guarda en el mismo documento/transacción que sus datos. Antes del acuse remoto la UI lo llama pendiente. Reiniciar, repetir la acción o perder una respuesta no duplica registros ni economía. Los registros eliminados en la cuenta se filtran mediante sus marcas. Ante un fallo, el original y el estado pendiente siguen disponibles.

Las economías con compras/usos independientes no se suman. Si una selección de economía resulta incompatible con las habilidades del historial combinado, se exige elegir historial, perfil y juego como un bloque; las rutinas/fichas compatibles se siguen incorporando y las fuentes originales se conservan. No se inventan cargas para hacer encajar las dos ramas. Antes de sustituir una rama se guarda una copia de recuperación del estado anterior de la cuenta.

## Verificación contra Supabase real

- Registro aceptado; acceso bloqueado antes de confirmar el correo. Confirmación abierta por el usuario, sesión visible en Cheesit y usuario confirmado en Auth.
- Recuperación enviada y completada por el usuario en Cheesit. Se comprobó el rechazo de la contraseña temporal anterior; la nueva contraseña no fue leída ni almacenada por el agente.
- Inicio de sesión verificado por `getUser`, renovación con `refreshSession`, persistencia tras recargar y cierre local que conserva la otra sesión. Dos clientes SDK independientes recuperaron el mismo registro remoto. Son sesiones separadas de prueba, no dos teléfonos físicos.
- Dos cuentas reales iniciaron sesión en la UI. La cuenta técnica no mostró la rutina privada temporal de la principal. En PostgreSQL remoto, con roles `authenticated` y claims de cada usuario, se probaron lecturas cruzadas de datos y recibos (cero filas), RPC con otro propietario (rechazado) y escritura directa (denegada). Las peticiones HTTP anónimas a tablas y RPC recibieron 401/42501. Las comprobaciones cruzadas de bajo nivel usaron contextos SQL con claims; no se presenta la batería HTTP LIVE de dos contraseñas como ejecutada.
- Escritura, lectura desde otra sesión, reintento del mismo UUID/recibo y conflicto por revisión antigua comprobados con el SDK real. Se rechazó también la reaparición de IDs eliminados en la base remota, conservando sus marcas.
- Migración representativa en la cuenta técnica: 17 sesiones finalizadas, dos borradores, cinco rutinas, dos ejercicios propios, borrador de rutina, perfil, preferencias e inventario. Comparación íntegra de datos y economía al aplicar el RPC, repetición exacta con el mismo recibo y sin duplicados ni nuevos premios. La recuperación de una interrupción antes del acuse y la UI de conflictos se verifican además en la batería local descrita abajo.
- En Chrome conectado a Supabase real: arranque y recarga sin red mediante el shell PWA; una sesión de 50 kg × 8 confirmada y finalizada sin conexión; otra recarga mantuvo el historial y la cola. La base remota aún no contenía esa sesión. Al restaurar la red se subió una sola vez (revisión 7); recargar/sincronizar no cambió la economía ni duplicó el registro.
- La prueba real descubrió y corrigió el orden de rutinas/fichas al combinar versiones, el mensaje de conexión que se confundía con sesión caducada y la entrega del logotipo desde la caché offline. Se verificó de nuevo el estado «Pendiente de conexión» sin solicitar otro acceso.
- Se retiraron las muestras activas de ambas cuentas usando el RPC y marcas de borrado; la cuenta técnica se conserva para futuras pruebas. Los recibos y las copias de recuperación conservan evidencia de prueba. El historial personal del origen público anterior no se ha trasladado a localhost ni se ha modificado.

### Asesores del proyecto

La revisión de seguridad informa dos avisos de funciones `SECURITY DEFINER` ejecutables por `authenticated`: los dos RPC previstos, con `search_path` fijo, propietario comprobado y ejecución anónima denegada. No son permisos generales de escritura; se verificaron los rechazos cruzados. Referencia del aviso: [0029 authenticated_security_definer_function_executable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

El asesor de rendimiento señala dos políticas del protocolo v1 que evalúan `auth.uid()` por fila y un índice v1 aún sin uso en esta base nueva. El protocolo activo usa `(select auth.uid())`. No se modificó el contrato v1 solo para silenciar avisos: [0003 auth_rls_initplan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), [0005 unused_index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Controles locales

- `npm test`: **198 aprobadas, 0 fallos, 1 omitida**. La omitida es la suite HTTP LIVE optativa, que requiere las dos contraseñas de pruebas en un archivo local; no se cuenta como superada. Se ejecutaron las comprobaciones reales indicadas arriba sin guardar las contraseñas elegidas por el usuario.
- `npm run typecheck`, `npm run build` y `git diff --check`: correctos. La compilación final usa el proyecto Supabase real de desarrollo, sin el servicio de pruebas.
- Chrome, `accounts.spec.ts`: **6 aprobadas** con el SDK, el servicio Auth de pruebas y PostgreSQL local. Incluye registro/confirmación, recuperación, sesión persistente, dos dispositivos, cambio de cuenta, arranque offline real desde el shell PWA, entrenamiento offline y subida posterior, cierre con cola pendiente, migración y conflicto de perfil/economía con recuperación.
- Chrome, `accounts-no-config.spec.ts`: **1 aprobada**; conserva un estado local sembrado y bloquea el registro de actividad sin servicio configurado. Sin desbordamiento horizontal en 320, 390, 768 y 1440 px.
- La muestra de migración contiene 17 sesiones terminadas y dos borradores de entrenamiento, uno con texto parcial, cinco rutinas, un borrador de rutina incompleto, perfil, preferencias y economía/inventario. Se comprueban conservación, interrupción después de guardar y antes del acuse, reinicio e idempotencia.
- Pendientes: esperar la caducidad natural de un JWT/enlace y repetir acceso, suite LIVE HTTP completa con dos contraseñas locales y dispositivos físicos. La entrega/confirmación/recuperación de correo y las políticas remotas sí se verificaron como se detalla arriba.

## Pruebas reproducibles

```sh
npm test
npm run typecheck
npm run build
```

`npm test` incluye PostgreSQL real en WASM (PGlite), con roles `anon`/`authenticated` y `auth.uid()` alimentado por claims locales. Prueba el SQL nuevo, denegación anónima y cruzada entre dos usuarios, escritura directa denegada, CAS, recibos, borrados, validación transaccional y una muestra de historial real representativa con economía. No sustituye a la infraestructura Auth/JWT de Supabase.

La batería de Chrome usa el SDK real con un servicio Auth/PostgREST **de prueba local** y el RPC/RLS de PostgreSQL. En una terminal, compilar y arrancar una instancia aislada:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55440 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_fixture npm run build
npm start -- --port 3100 --hostname 127.0.0.1
```

En otra terminal:

```sh
CHEESIT_ACCOUNTS_FIXTURE=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
npx playwright test tests/accounts.spec.ts --workers=1
```

Parar esa instancia y volver a ejecutar `npm run build` con la configuración normal al terminar; no publicar la compilación del fixture. Para el acceso sin configuración, ejecutar `CHEESIT_NO_CONFIG_TEST=1 npx playwright test tests/accounts-no-config.spec.ts` contra una compilación sin variables de Supabase. Los antiguos `.spec.ts` que arrancan directamente en Resumen o siembran el antiguo almacenamiento local corresponden al contrato anónimo anterior: no son pruebas de aceptación del nuevo acceso y necesitan preparar una cuenta y la caché v2 antes de reutilizarse. No se han presentado como una batería completa superada.

La prueba LIVE está desactivada por defecto. Crear un archivo local ignorado `.env.accounts-test` con las dos variables públicas, `CHEESIT_LIVE_TESTS=1`, `CHEESIT_TEST_EMAIL_A`, `CHEESIT_TEST_PASSWORD_A`, `CHEESIT_TEST_EMAIL_B` y `CHEESIT_TEST_PASSWORD_B`. Usar dos cuentas de pruebas confirmadas de un proyecto de desarrollo; luego:

```sh
node --env-file=.env.accounts-test --import tsx --test tests/accounts-live.test.ts
```

Esta prueba comprueba acceso al servicio real, dos cuentas, lectura y escritura cruzadas, revisión, reintento y borrado. Solo añade y elimina su propia rutina de prueba; deja la marca de borrado y sus recibos. El recorrido de correo debe comprobarse además con los buzones de pruebas: registro → confirmar → volver a la app → solicitar recuperación → abrir enlace → cambiar contraseña → acceso con la nueva contraseña, y rechazo del enlace caducado.

## Límites pendientes antes de usarlo con datos reales

- Configurar SMTP propio antes de admitir público externo. Quedan la caducidad natural de tokens/enlaces y la suite LIVE HTTP completa con dos contraseñas introducidas localmente. Las migraciones, el recorrido de correo integrado y RLS del proyecto real ya están verificados.
- La PWA se verifica con Chromium; quedan Safari/iPhone y Android físicos, cuotas de almacenamiento y expulsión de caché del sistema.
- El documento tiene un límite de 16 MiB y se descarga completo. El protocolo prioriza consistencia y conservación de la economía; una cuenta muy grande necesitará paginación por revisiones y archivado de recibos con un protocolo de retención seguro. No purgar marcas ni recibos unilateralmente.
- Los conflictos de actividad son conservadores y pueden requerir elegir una rama completa. No hay fusión automática de dos economías gastadas independientemente.
- No se han añadido amigos, chats, publicaciones ni challenges. Los resultados de esta guía describen las comprobaciones previas; el commit y despliegue de publicación se identifican en la PR de cuentas.

## Google y mejoras de contraseña

El registro y la recuperación incluyen confirmación de contraseña y controles para mostrarla. Se añade Google como acceso alternativo, usando el mismo aislamiento y migración por usuario. Configuración externa, pruebas y límites del regreso desde móvil/PWA: [Acceso con Google](ACCESO-GOOGLE.md).
