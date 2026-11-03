# Revisión local del rediseño

Rama: `codex/ux-redesign-20261103`.
Worktree: `/private/tmp/cheesit-ux-20261103`.
Base: `7ee32f8`, instantánea del proyecto local con sus cambios previos.

## Probar

Vista previa: http://127.0.0.1:3017

1. Entra como invitado. El almacenamiento de este puerto es independiente del de la app actual.
2. Crea una rutina o empieza una sesión. Introduce carga y repeticiones, confirma una serie, recarga y continúa el borrador.
3. Finaliza y consulta el calendario y Progreso.
4. En Arcade prueba Objetivos, Cuerpo, Cofres, Colección y Ascenso. La URL conserva la pestaña y admite volver/avanzar.
5. En el menú de perfil abre Mi perfil y Ajustes. Siguen disponibles el catálogo, las preferencias y las copias JSON.

Para ver historial ficticio, importa `docs/ux-redesign/cheesit-demo.json` desde Ajustes → Importar datos. Los nombres llevan «Demo» y todos los registros son inventados. El archivo se valida con el mismo importador de la app. `node --import tsx scripts/create-ux-demo.ts` permite regenerarlo con fechas recientes.

Para reabrir si el servidor se ha detenido:

```sh
cd /private/tmp/cheesit-ux-20261103
npm start -- --hostname 127.0.0.1 --port 3017
```

Las dependencias están copiadas dentro del worktree, sin compartir escrituras con el proyecto original. No se copiaron `.env.local`, `.env.accounts-test`, `.vercel` ni estados de navegador. La vista previa principal no tiene configurado ningún servicio de cuentas real.

## Cambios

- Inicio centrado en empezar/retomar, seguido de actividad, rutinas y marcas. Personaje y XP reunidos en una tarjeta secundaria.
- Cinco destinos con texto en móvil; Progreso pasa a navegación principal. «Entrenar» sigue accesible desde la cabecera móvil y la barra lateral de escritorio.
- Inicio directo desde cada rutina. Duplicar, archivar y restaurar siguen disponibles.
- Preparación de sesión con formulario y envío por Enter; recuperación del modo invitado en la misma pestaña.
- Controles legibles, áreas táctiles mayores, foco visible y enlace para saltar al contenido.
- Búsqueda de ejercicios antes de los filtros, recuento de resultados y recuperación de búsquedas vacías.
- Ajustes y acceso con textos breves; advertencias de recalcular XP, cambios pendientes y borrado se conservan.
- Bienvenida discreta; estados de carga, errores, vacíos, guardado y navegación protegida.
- Colores, logotipo, ilustraciones, equipo, compañeras, fórmulas, economía y permisos conservados.

## Conservación de la base

La base incluía `src/components/EntrenosApp 2.tsx`, una copia antigua sin importadores que impedía compilar porque importaba `GamePreview`, un export ya inexistente. Se conserva íntegra como `docs/ux-redesign/reference/EntrenosApp-previous.tsx.txt`, fuera de la compilación. El proyecto original no se ha modificado.

La primera instantánea de aislamiento incluía un enlace temporal a dependencias; se sustituyó por una copia física ignorada por Git para que el worktree sea independiente.

## Límites

No se ha desplegado, publicado, fusionado ni enviado a un remoto. No se ha accedido a servicios ni datos de producción. Las pruebas de cuenta usan el simulador de Auth existente y PostgreSQL en memoria; no verifican envío real de correos, validación de JWT del proveedor ni dispositivos físicos. La comprobación adaptable usa Chrome; queda revisar Safari y Android/iOS físicos. No constituye una auditoría completa de accesibilidad WCAG.

## Resultado de las comprobaciones

- `npm test`: 205 pruebas correctas, 1 omitida por necesitar un servicio real. Sin fallos.
- `npm run typecheck`: correcto.
- `npm run build`: correcto con Turbopack, manifiesto offline de 84 recursos.
- `tests/ux-redesign.spec.ts`: 11 pruebas correctas contra la compilación local final, incluidos 320/390/768/1440 px, teclado, formularios, borradores, finalización, historial/progreso, catálogo, preferencias, respaldo, cofres, navegación y arranque offline.
- `onboarding.spec.ts`, `profile-menu.spec.ts`, `personal-profile.spec.ts`, `account-reset.spec.ts`: 9 pruebas correctas en una segunda compilación aislada con el simulador existente de Auth y PostgreSQL en memoria. Incluyen carga/cambio/borrado de foto, errores y reintentos, aislamiento entre cuentas, conflictos, sincronización y reset con confirmaciones. No hay llamadas a producción.
- `git diff --check`: correcto. Sin cambios respecto a la base en `src/lib`, `public`, `supabase`, dependencias o `next.config.ts`.
- Los 11 archivos existentes correspondientes al rediseño se compararon con la instantánea: el directorio original mantiene sus contenidos.

Evidencia: [móvil](previews/mobile.png), [escritorio](previews/desktop.png), [interfaz](browser-tests.log), [cuentas](account-tests.log), [unitarias](unit-tests.log), [compilación](build.log).

Los primeros intentos detectaron un dato ficticio con un color fuera del catálogo, un selector de etiqueta mejorable y una configuración de puerto incorrecta en el entorno de pruebas. Se corrigieron antes de los resultados anteriores. La comprobación offline de cuentas se repitió contra una compilación optimizada, puesto que el servidor de desarrollo no registra el service worker. No quedan fallos de estas baterías pendientes.

La vista previa abierta en esta conversación contiene seis entrenamientos y dos rutinas ficticias importados por la interfaz. Solo se usa el almacenamiento de invitado de este puerto.

## Segunda propuesta visual

La propuesta actual se documenta en [v2/REVIEW.md](v2/REVIEW.md). Añade la nueva portada y distribución de Arcade y una dirección visual más marcada a partir de las cinco referencias. La primera versión permanece en su rama local.
