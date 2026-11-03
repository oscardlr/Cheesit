# Segunda propuesta visual

Vista previa local: http://127.0.0.1:3017/#view=game&tab=overview

Worktree: `/private/tmp/cheesit-ux-20261103`.
Rama: `codex/visual-redesign-20261103`.
Primera propuesta conservada: rama `codex/ux-redesign-20261103`, commit `e32885f`.

## Dirección de diseño

Las cinco referencias del usuario se interpretan como inspiración de composición, sin copiar pantallas ni incorporar sus imágenes a la aplicación:

- Profundidad violeta y tamaños de tarjeta distintos para separar información principal y secundaria.
- Paneles compactos, superficies suaves y números protagonistas.
- Mapa muscular con frente/espalda, selección directa y actividad real.
- Portada de juego centrada en personaje, progreso y próximas recompensas.
- Tipografía con más espacio y contraste entre figuras, datos y acciones.

Se conservan los tokens lima/violeta, fondos oscuros, logotipo, arte del personaje, equipo, cofres y cheesits existentes. No se añaden estadísticas ficticias a la interfaz: los indicadores se calculan con los mismos módulos del juego.

## Qué ha cambiado

Arcade pasa a tener una portada con cinco accesos de tarea: personalizar el personaje, objetivos, mapa muscular, colección y preparar habilidades. El nivel y XP se presentan con el personaje; los cofres ganados ofrecen apertura gratuita desde la portada. Ascenso sigue accesible desde el progreso, y todos los cofres desde Recompensas o el saldo.

Las pantallas interiores mantienen los cinco apartados visibles y un enlace de vuelta a Inicio de Arcade. Las rutas anteriores siguen funcionando. Aspectos y Habilidades tienen URL propia, recarga, atrás/adelante y foco coherente. Cambiar una pestaña con teclado conserva su foco.

Colección abre el inventario directamente. El escenario del personaje, las ranuras y las animaciones aparecen al editar Aspectos; las habilidades muestran su selección y cargas sin atravesar el editor visual. No se modifica la lógica de equipamiento, pasivas, consumo, sorteos ni guardado.

El mapa muscular incorpora un selector frente/espalda; elegir un músculo cambia a la vista que lo contiene. La portada siempre usa el mes actual, aunque se haya consultado un mes histórico en el mapa.

El inicio combina sesión y semana en un bloque de tarjetas, con un nuevo tratamiento de estadísticas, rutinas y personaje. Navegación móvil flotante, formularios, calendario, perfil, catálogo, acceso y progreso comparten las nuevas superficies y jerarquía.

## Recorrido sugerido

1. Abre Arcade y compara su portada con la primera propuesta.
2. Usa Personalizar personaje, cambia entre Inventario, Aspectos y Habilidades y vuelve atrás.
3. Abre Cuerpo, selecciona un músculo y alterna frente/espalda.
4. Revisa Cofres y Ascenso; la apertura usa los mismos créditos y recompensas virtuales de antes.
5. Vuelve a Resumen y prueba una sesión, su borrador y el registro de series.

La vista principal mantiene los datos ficticios previamente importados. Las capturas también proceden de datos de prueba; algunas incluyen equipo y cheesit para revisar composición y estados equipados.

## Verificación

- TypeScript y compilación optimizada correctos; manifiesto offline de 84 recursos.
- 205 pruebas unitarias correctas; una omitida por requerir un servicio real.
- 15 pruebas de navegador correctas contra la compilación final: 320/390/768/1440 px, teclado, navegación, rutas de Arcade, mapa muscular, estados vacíos, borradores, series, finalización, historial, progreso, rutinas, preferencias, importación/exportación, apertura, equipamiento, cheesit, habilidad y consumo único de carga, recarga sin conexión.
- 9 pruebas de cuentas correctas con el simulador existente de Auth y PostgreSQL en memoria: alta, onboarding, persistencia, foto, edición, conflictos, separación entre cuentas, sincronización y reset con confirmación.
- Verificación visual del personaje con cheesit: ambos quedan dentro de la tarjeta en 320 y 390 px.
- `git diff --check` correcto. Sin cambios en modelos, economía, permisos, datos de producción, migraciones, dependencias, recursos de marca o configuración de despliegue.

Evidencia: [Arcade escritorio](previews/arcade-desktop.png), [Arcade móvil](previews/arcade-mobile.png), [personaje equipado](previews/arcade-equipped.png), [inicio](previews/home-desktop.png), [interfaz](browser-tests.log), [cuentas](account-tests.log), [unitarias](unit-tests.log), [compilación](build.log).

## Límites y publicación

No se ha publicado, desplegado, fusionado ni enviado ningún cambio a GitHub o Vercel. La app original sigue intacta. Las pruebas de cuentas no contactan con Supabase real; no verifican correo ni JWT del proveedor. Queda revisión de Safari y de dispositivos iOS/Android físicos. No se afirma conformidad WCAG completa.

Para reabrir la vista previa si se detiene:

```sh
cd /private/tmp/cheesit-ux-20261103
npm start -- --hostname 127.0.0.1 --port 3017
```
