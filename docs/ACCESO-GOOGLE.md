# Acceso con Google y contraseñas

## Implementación

Registro y recuperación exigen repetir la contraseña; la confirmación no se envía a Supabase. Si no coincide, se bloquea la operación. Cada campo tiene un ojo accesible por teclado, con nombre y estado anunciados, área táctil de 44 px y contraseña oculta de inicio. Cambiar de formulario elimina los valores de contraseña y vuelve a ocultar el campo.

«Continuar con Google» aparece en registro e inicio de sesión, junto al acceso por correo. Consulta la disponibilidad real del proveedor y usa `supabase.auth.signInWithOAuth` con `openid email profile` y selector de cuenta. No pide permisos de Drive, Gmail ni acceso offline de Google. Los tokens y la verificación del retorno los gestiona el SDK existente de Supabase; no se añade un protocolo de autenticación propio ni se cambia el flujo ya publicado de confirmación/recuperación por correo.

El retorno vuelve a `/?oauth=google` en el mismo origen que inició el acceso, mediante navegación de la ventana actual. No depende de una ventana emergente, y no fuerza el retorno de desarrollo a producción. La app conserva solo un marcador temporal sin credenciales para reconocer cancelación/Volver, muestra errores estáticos legibles y limpia la URL al terminar el procesamiento del SDK. No registra tokens ni muestra los detalles internos del proveedor.

Google y contraseña desembocan en el mismo `onAuthStateChange` y `AccountGate`. La nube, caché, cola, RLS y migración siguen ligadas a `user.id`. Se usa la vinculación automática de identidades de Supabase para el mismo correo verificado: no se busca ni se fusiona una cuenta por correo desde el navegador. El correo sin verificar no se considera prueba de propiedad. No se activa la vinculación manual de cuentas con correos distintos.

## Configuración externa

Proyecto Supabase: `fwfmwyyufafaxckkdwrx`. En la revisión inicial Google estaba desactivado y sus Client IDs y Client Secret estaban vacíos. Google Cloud solicitaba aceptar sus condiciones de uso; ese acuerdo y la introducción de credenciales se dejan al usuario en los paneles, sin secretos por el chat.

1. En Google Auth Platform, usar o crear el proyecto de Cheesit, configurar nombre y audiencia. Si está en modo de pruebas, añadir las cuentas de prueba permitidas. No activar facturación ni la prueba gratuita para este acceso.
2. Crear un cliente OAuth de tipo **Web application**. Orígenes: `https://cheesit-entrenos.vercel.app` y `http://localhost:3000`. Para la verificación aislada también se utiliza `http://localhost:3103`.
3. URI de redirección autorizada en Google: `https://fwfmwyyufafaxckkdwrx.supabase.co/auth/v1/callback`. Es la devolución de Google a Supabase; no sustituirla por la web de Cheesit.
4. Introducir Client ID y Client Secret directamente en Supabase → Authentication → Sign In / Providers → Google; habilitar el proveedor y guardar. Mantener desactivadas **Skip nonce checks** y **Allow users without an email**.
5. Supabase → URL Configuration: Site URL `https://cheesit-entrenos.vercel.app`; permitir exactamente `https://cheesit-entrenos.vercel.app/?oauth=google`, `http://localhost:3000/?oauth=google` y `http://localhost:3103/?oauth=google`, conservando las rutas de correo y recuperación ya existentes. Las Previews se permiten por sus URLs concretas, no con un comodín para todos los proyectos del equipo.
6. Vercel solo necesita las dos variables públicas de Supabase ya configuradas. **El Client Secret de Google no va en Vercel, en `NEXT_PUBLIC_*`, en `.env.example` ni en Git.** El proveedor se comprueba en cada intento, por lo que completar su configuración no exige recompilar.

## Verificación y límites

Las pruebas unitarias usan el SDK real para comprobar la URL, proveedor, permisos, retorno, proveedor deshabilitado y falta de red. No sustituyen una autenticación con Google real. Se comprueban además errores/cancelaciones sin exponer detalles y compatibilidad con los marcadores de recuperación por correo.

En navegador se verifica confirmación desigual bloqueada, ambos ojos, retorno de error, aviso con proveedor deshabilitado y tamaños móviles. La migración no se ejecuta automáticamente al entrar: conserva la revisión explícita y el original para ambos métodos de acceso.

Pendiente hasta completar la configuración externa: consentimiento de Google real, vuelta con sesión, verificación de que el ID de la cuenta de correo se conserva y de que no aumenta el número de usuarios al vincular el mismo correo verificado.

Móvil e instalación: la PWA usa el flujo web en la ventana actual y vuelve a su origen. Una vista de 390 px no equivale a un teléfono físico ni demuestra el comportamiento del contenedor instalado. Hay que probar Google en Safari/iOS y Chrome/Android desde navegador y desde la PWA instalada; comprobar permanencia en la app, recarga, sesión y migración. Si el sistema devuelve el acceso a otro contenedor con almacenamiento separado, no se promete compartir esa sesión con la PWA: se debe iniciar el acceso desde ese contenedor y comprobar el recorrido real antes de darlo por validado. No se transfieren tokens por portapapeles, parámetros entre aplicaciones ni mensajes a otros orígenes.

Fuentes: [Google con Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [vinculación de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking), [redirecciones](https://supabase.com/docs/guides/auth/redirect-urls).
