# Mejoras de Cheesit · 28 de octubre de 2026

Implementación por fases sobre la app existente. Se conserva la identidad oscura, violeta y lima, los pesos introducidos, las preferencias y el modo local. No se ha desplegado ni activado ningún servicio externo. Los cosméticos y las animaciones añadidos simultáneamente en otro chat se han conservado; no forman parte del alcance de este informe.

## Fase 1 · Fiabilidad

- Los respaldos admiten borradores incompletos, nombres/fechas temporales y el texto exacto en edición. Las series confirmadas mantienen validación estricta. La recuperación de una rutina incompleta tiene un campo separado de las rutinas guardadas.
- Las series previstas exigen enteros entre 1 y 20. Duplicar rutinas produce nombres distintos dentro de los 80 caracteres, también con caracteres Unicode.
- IndexedDB compara una revisión dentro de la transacción. Una pestaña desactualizada no puede sobrescribir otra: conserva lo pendiente para exportar y exige recargar. El éxito se comunica después del commit; los errores ofrecen reintento y exportación.
- Todos los borradores de sesión se abren por identificador desde Resumen o su fecha. Una rutina pendiente se recupera sin sobrescribirla al navegar o intentar abrir otra.
- La convención de carga se conserva por bloque. El volumen representa carga externa efectiva × repeticiones: bilateral por unidad ×2; alterno y unilateral ×1; registros antiguos de pareja se usan una sola vez. Las repeticiones representan movimientos registrados; los lados no se duplican retrospectivamente. El historial conserva los números originales.
- Evolución agrupa bloques del mismo entrenamiento. Copiar crea las filas faltantes sin confirmarlas y adapta la carga a la convención del registro actual. Las metas semanales usan días distintos.
- La importación muestra las versiones en conflicto y permite conservar local, usar la copia o conservar ambas cuando es coherente. Las economías independientes requieren elegir una rama completa y validar los consumos relacionados.
- El revelado estático respeta movimiento reducido y efectos desactivados. La animación completa conserva cinco segundos. Revelar ahora no cambia el premio reservado ni cobra otra vez.
- El arranque offline verifica los recursos de una caché versionada por compilación. Hay preparación, fallo, reintento, reparación tras pérdida de caché y actualización explícita tras guardar. El aviso reserva espacio y no tapa controles.

Evidencia: regresiones de dominio que reprodujeron los fallos originales; casos de navegador con borradores inválidos, decimales, importación, dos pestañas y fallo de escritura inyectado; dos compilaciones reales con actualización, recuperación de caché y arranque sin red.

Pendiente: interrupciones físicas del proceso de escritura y almacenamiento en dispositivos reales. IndexedDB solicita durabilidad estricta; el navegador decide las garantías efectivas del soporte.

## Fase 2 · Registro y comodidad

- Encabezado compacto, duración y descanso configurable, pausa/reanudación y arranque automático opcional tras confirmar. Los contadores usan instantes persistidos, sin escribir cada segundo. Las sesiones históricas sin tiempos muestran duración no registrada.
- Rutinas con rangos de repeticiones, carga objetivo, descanso y notas. Las series preparadas conservan la confirmación manual. Notas por sesión y ejercicio; RPE/RIR opcionales.
- Copiar una o todas las series anteriores; sustituir y reordenar ejercicios durante la sesión; repetir sesiones y guardarlas como rutinas. La conversión de una sesión antigua adapta la carga objetivo sin duplicar físicamente el peso.
- Varias sesiones por día, conservando el cálculo semanal por fechas distintas.
- Resumen prioriza sesiones pendientes, próximas rutinas y últimas marcas. Buscador global de progreso y acceso desde la sesión y el detalle.
- Perfil accesible desde Ajustes, marca Cheesit coherente y guía de registro opcional. Estado navegable por URL, restauración de la sesión y protección de cambios al volver o actualizar.
- Ejercicios propios editables y archivables, con modalidad, convención y músculos directos/secundarios. Las sesiones conservan su instantánea. El catálogo incluye 34 fichas de texto originales con declaración CC BY 4.0.

Evidencia: recorridos de registro y recuperación, 13 regresiones nuevas de navegador y revisión de anchuras de 320/390/768/1440 px. Reflujo equivalente a 200 % y navegación por teclado en los editores y sus diálogos.

Pendiente: comprobación del teclado móvil, zoom nativo y lectores de pantalla en Safari/iPhone y Android físicos. La emulación de escritorio no sustituye esas comprobaciones.

## Fase 3 · Progreso y RPG

- Gráficos y tabla accesible de carga total, repeticiones, volumen y 1RM estimado. El 1RM se limita a banca, sentadilla y peso muerto con barra, de 1 a 10 repeticiones. No se extrapolan máquinas ni ejercicios propios.
- Objetivos relevantes al principio, filtros y resto plegado; los objetivos ya recompensados explican la meta congelada y el progreso actual.
- Los objetos ofrecen acciones separadas para usar aspecto y preparar habilidad, con cargas y consumo explicados. Las frases legacy obtenidas vuelven a estar disponibles sin reescribir ventas ni créditos.
- Opciones explícitas para evitar compañeras repetidas en futuros sorteos y elegir ranura en un cofre de ascenso; no se modifican premios antiguos ni probabilidades de rareza.
- Borrar actividad explica el ajuste de XP, créditos y déficit. El editor de perfil muestra el efecto de los cambios antes de guardar. Las celebraciones distinguen completar una sesión de subir de nivel.

Decisión pendiente de producto: [la propuesta de economía v2](PROPUESTA-ECONOMIA-V2.md) define cómo congelar recompensas históricas y evitar bonus repetidos sin reducir progreso existente. Se entrega como propuesta, sin botón operativo ni migración automática. Hasta aprobar e implementar esa migración, las fórmulas históricas de récords y peso del perfil conservan su comportamiento; esto se prueba explícitamente.

## Verificación

- `npm test`: 102/102 pruebas de dominio correctas.
- `npm run typecheck`: correcto.
- `NEXT_PUBLIC_TEST_CREDITS=0 npm run build`: correcto, precaché final generada con 29 recursos.
- `node scripts/verify-offline-builds.mjs`: dos compilaciones reales y 2/2 pruebas Chromium correctas.
- Batería completa contra producción local con `PLAYWRIGHT_PRODUCTION=1` y créditos de prueba desactivados: **56 correctas, 0 fallidas, 1 omitida** en 2 minutos. La omisión es exclusivamente el caso que exige dos compilaciones; ese mismo caso pasó en el harness específico, junto al arranque offline (2/2). Las pruebas antiguas se adaptaron a preferencias opcionales, restauración de URL, dos acciones por objeto, premios reclamados plegados y el arte SVG/raster; no se ocultaron errores de producto.

No se afirma compatibilidad física completa con iPhone/Android, ni sincronización remota operativa. El código remoto existente permanece sin conectar. No se han añadido nutrición, feed social ni entrenador de IA.
