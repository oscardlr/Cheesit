# Entrenar y feed social

Esta versión reorganiza la navegación como Feed, Resumen, Entrenar, Progreso y Arcade. Entrenar muestra primero el inicio de sesión, después los splits existentes y finalmente las rutinas y su creación. El calendario abre Progreso y conserva sus sesiones y accesos por fecha. Se mantienen el rediseño de producción, Arcade, acceso con Google, controles de contraseña y navegación con recuperación del desplazamiento.

Los entrenamientos nuevos permiten publicar mediante un switch activado inicialmente, añadir un texto y adjuntar una foto de la galería o capturarla con la cámara. La cámara solo sube la captura después de aceptarla y detiene sus pistas al cerrarse. Los entrenamientos sin publicar siguen guardándose en el historial privado.

El feed global, la pestaña Siguiendo, los perfiles y los enlaces directos comparten los mismos permisos. Las fotos se descargan desde un bucket privado autenticado. Las publicaciones admiten likes, comentarios, eliminación de comentarios propios, enlaces compartibles y notificaciones de interacciones. El servidor pagina por fecha y UUID sin descargar todas las cuentas. Las notas privadas no se proyectan al feed.

La privacidad del perfil y el gimnasio se configuran en Ajustes. El gimnasio es un campo opcional del documento de cuenta, guardado mediante la sincronización CAS existente, y aparece encima de la biografía. El resumen semanal se muestra el sábado y domingo según Madrid. Los nuevos pesos usan la fecha actual de Madrid al guardar; corregir un registro conserva su fecha original.

## Estado de publicación

La base de datos ya tiene aplicadas estas migraciones, con sus versiones reales:

- `20261104192629_workout_feed.sql`
- `20261104192645_workout_publication_caption.sql`
- `20261104192654_profile_gym.sql`
- `20261104192712_social_interactions.sql`

La comprobación posterior conserva las 6 cuentas y los 20 entrenamientos existentes. Antes de sanear la proyección social, la migración guarda las 20 filas de entrenamientos proyectados y los 5 resúmenes anteriores en `cheesit_private.social_projection_archive`, con RLS y sin acceso para `anon` ni `authenticated`. Los documentos originales de cuenta no se reescriben y ningún entrenamiento histórico se publica automáticamente. También se conservan las preferencias previas de privacidad.

El frontend está pendiente de publicación. No se ha marcado esta versión como desplegada.

## Comprobaciones

La copia de publicación parte del commit `50330f6` de producción, cuyo árbol empieza por `125a610`, e integra únicamente los cambios de este chat.

- TypeScript correcto y build de producción completado; manifiesto sin conexión de 94 recursos.
- 251 pruebas unitarias y de integración aprobadas; una prueba LIVE opcional omitida.
- 11 casos distintos de Chrome aprobados: feed global y Siguiendo, paginación, fotos, cámara, privacidad, interacciones, notificaciones, gimnasio, calendario, splits, resumen semanal y fecha del peso.
- El modo invitado de producción permanece activo en la misma pestaña tras recargar; las pruebas de esta versión respetan ese comportamiento.
- La verificación final de recuperación sin conexión y conversión del historial anterior se ejecuta contra un build de producción aislado, sin usar cuentas reales.

Los fixtures y builds con claves locales de prueba no forman parte del despliegue. Se publica el código y Vercel compila con la configuración real del proyecto.
