# Seguidores en Cheesit

## Uso

En el menú de perfil, **Buscar personas** busca por el comienzo del @usuario existente. Acepta `@Usuario`, `usuario`, espacios exteriores y mayúsculas. Los puntos y guiones bajos son literales; no son comodines. Las búsquedas y listas tienen páginas de veinte personas.

Los resultados muestran foto, nombre y @. Cada ficha social incluye la biografía, seguidores y seguidos, listas navegables, «Te sigue» y seguir/dejar de seguir. Las relaciones son independientes. Mi perfil conserva el resumen de actividad privado y añade los contadores y el enlace a la ficha social.

El modo invitado conserva su almacenamiento separado y explica que necesita una cuenta para las funciones sociales. Los estados de carga, resultados/listas vacíos, errores, falta de conexión y reintento tienen mensajes explícitos. Las lecturas y escrituras sociales tienen límite de espera. La interfaz cancela búsquedas anteriores, bloquea pulsaciones repetidas y solo confirma una acción después de releer el estado del servidor. Una respuesta perdida se reconcilia al reintentar sin duplicar follows.

## Privacidad y permisos

- `cheesit_accounts`, sus recibos y `cheesit_identities` conservan sus políticas privadas. No se modifica su contenido ni se amplía su acceso.
- `cheesit_social_profiles` es una proyección de cinco campos: identificador del propietario, @usuario, nombre visible, foto y biografía. Solo contiene cuentas con onboarding completado; solo los usuarios con sesión pueden leerla. La foto sigue siendo el JPEG preparado por la app, sin URLs remotas.
- Los triggers privados sincronizan exclusivamente esos campos al completar el perfil o confirmar un cambio en el documento de cuenta. No se depende de otra petición del navegador que pudiera fallar después del guardado. Los clientes no pueden escribir directamente en la proyección ni ejecutar los triggers.
- El correo permanece en Auth. Peso, altura, edad, sexo, entrenamientos, juego, preferencias y el resto del documento privado no se devuelven en ninguna consulta social.
- `cheesit_follows` tiene RLS, claves externas a perfiles completados, clave primaria compuesta y restricción contra seguirse a uno mismo. Solo se permite insertar/eliminar filas cuyo `follower_id` sea el UID autenticado. No se concede UPDATE.
- La lectura social y sus contadores usan un RPC `SECURITY INVOKER`, respetando RLS. No acceden a documentos privados ni a metadatos de Auth.
- Las conexiones son visibles entre personas con sesión, tal como indican los textos de privacidad. No hay feed, mensajes, notificaciones, solicitudes ni seguimientos recíprocos automáticos.

## Migraciones y proyecto conectado

La migración se creó con `supabase migration new social_follows` y se aplicó al proyecto autorizado Cheesit (`fwfmwyyufafaxckkdwrx`) mediante `apply_migration`. El archivo local usa la versión registrada por Supabase: `20261103140756_social_follows.sql`. Su huella coincide con la sentencia del historial remoto.

La migración solo añade las tablas, índices, políticas, RPC y triggers sociales y rellena la tabla nueva con los campos visibles de perfiles completados. No actualiza ni elimina cuentas o sus documentos. Antes y después de aplicarla, los tres documentos privados dieron el mismo recuento y la misma huella completa: `08aab5391239db61e5661b196a39b66f`.

Se recuperó también `20261103102339_onboarding_google_compatibility.sql` del historial remoto, donde ya estaba aplicada antes de este trabajo. Se conserva literalmente, con la misma huella, para que el historial local coincida con Supabase y se preserve el onboarding de Google. No se volvió a aplicar.

No hace falta aplicar ninguna migración social adicional al proyecto conectado. En otra base, aplicar las migraciones en orden con el flujo habitual del proyecto. No ejecutar resets ni volver a aplicar archivos que ya constan en el historial.

## Verificación

Resultado final: **216 pruebas unitarias/integración aprobadas y una LIVE omitida**, **27 casos de Chrome comprobados sobre el rediseño de producción**, `npm run typecheck`, `npm run build` con la configuración real y `git diff --check` correctos. Las capturas se revisaron visualmente después de esperar a que terminaran de cargar las listas. La ejecución inicial de Chrome aprobó 23 casos; tres esperas interrumpidas pasaron al repetirlas. La prueba de cambio de foto leía prematuramente la imagen anterior: se corrigió para esperar a la nueva foto y pasó la comprobación específica.

`npm test` prueba las políticas reales de PostgreSQL en PGlite, con dos usuarios distintos y un perfil incompleto: privacidad, denegación anónima, suplantación del seguidor, duplicados, autosseguimiento, UPDATE denegado, borrado ajeno sin efecto, direccionalidad, contadores/listas, búsqueda literal, paginación, sincronización de nombre/foto/biografía y cascadas. Las escrituras y borrados de prueba se ejecutan exclusivamente en bases locales aisladas, nunca en las cuentas existentes del proyecto conectado.

`supabase/tests/social_permissions.sql` es parte de esa prueba **local**. Crea registros sintéticos dentro de una transacción que se revierte y comprueba que las cuentas anteriores del fixture permanecen idénticas. No ejecutarlo en el proyecto conectado. El intento inicial de prueba remota con registros temporales fue cancelado sin ejecutarse; se sustituyó por la comprobación de solo lectura descrita a continuación.

En Supabase se ejecutó `supabase/tests/social_readonly.sql`, dentro de `BEGIN READ ONLY`: con claims de dos cuentas existentes, cada una ve la ficha social de la otra y solo su propio documento privado; no puede consultar la identidad ni los recibos ajenos. Comprueba también la búsqueda canónica, la ausencia de campos privados y los privilegios de tablas/funciones. No escribe cuentas ni follows. Por HTTP real, las dos tablas sociales y el RPC rechazan peticiones anónimas con `401 / 42501`.

El asesor remoto no añade avisos de seguridad para las funciones sociales. Persisten avisos anteriores sobre dos RPC privilegiados y protección de contraseñas filtradas desactivada. El índice nuevo de búsqueda figura como todavía sin uso en una base de tres cuentas; se conserva para las búsquedas al crecer el directorio. Referencias: [funciones privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [índices sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Las pruebas de Chrome usan el SDK y un servicio Auth/PostgREST de prueba conectado a PostgreSQL local. Cubren dos contextos de navegador, modo invitado, búsqueda sin @/con mayúsculas, navegación y recarga, listas, independencia de follows, edición sincronizada, carga de más resultados, errores 503, búsquedas desfasadas, desconexión y pérdida de respuesta después de guardar. Se comprueba que no haya desbordamiento a 320, 390, 768 y 1440 px; las capturas están en `artifacts/social/`. No se presenta el servicio Auth de prueba como dos sesiones reales de Supabase ni como dispositivos físicos.

Comandos reproducibles:

```sh
npm test
npm run typecheck
npm run build
```

Para Chrome, compilar y arrancar una instancia local de prueba:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55440 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_fixture npm run build
npm start -- --port 3100 --hostname 127.0.0.1
```

En otra terminal:

```sh
CHEESIT_ACCOUNTS_FIXTURE=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
npx playwright test tests/social.spec.ts tests/personal-profile.spec.ts \
  tests/profile-menu.spec.ts tests/onboarding.spec.ts tests/ux-redesign.spec.ts --workers=1
```

Después, detener esa instancia y ejecutar `npm run build` con la configuración normal. No publicar el build del fixture.

La carpeta original conserva su copia previa `EntrenosApp 2.tsx`. La publicación no la incluye ni cambia la configuración de TypeScript del rediseño ya publicado, que conserva esa referencia histórica fuera de la compilación.

## Límites

La publicación integra únicamente los cambios sociales sobre el rediseño ya publicado, conservando navegación, Arcade y acceso con Google. La migración remota está aplicada. Las comprobaciones de escritura entre usuarios se han completado en PostgreSQL local; en remoto se verifica lectura, RLS y privilegios sin modificar cuentas existentes. La prueba LIVE optativa de cuentas sigue necesitando credenciales introducidas por el usuario. Safari/iPhone y Android físicos quedan fuera de las pruebas de Chromium con tamaños móviles.
