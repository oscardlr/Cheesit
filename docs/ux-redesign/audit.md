# Auditoría previa del rediseño

Base: instantánea 7ee32f8 del proyecto local, incluidos sus cambios previos. Rama `codex/ux-redesign-20261103`, worktree `/private/tmp/cheesit-ux-20261103`. No se copiaron credenciales, configuración de Vercel ni datos de navegador. Revisión de código y navegación local antes de implementar.

| Área | Funciones que se conservan | Fricción observada / intervención |
| --- | --- | --- |
| Acceso | Cuenta, invitado, alta, confirmación, recuperación y onboarding | Mensajes duplicados y protagonismo de textos de marca. Jerarquía y textos claros, sin cambiar autorización. |
| Resumen | Periodos, estadísticas, rutinas sugeridas/propias, últimas marcas, nivel, equipo, pasiva, semana y objetivos | El personaje desplaza la acción principal fuera de la primera pantalla móvil. Priorizar empezar/retomar y compactar personaje + XP. |
| Sesión | Borradores, múltiples sesiones, confirmar series, carga/reps, RPE/RIR, descanso persistente, copiar, ordenar, sustituir, notas, finalizar y abandonar | Estado vacío sin acción próxima integrada, controles pequeños y acción final al fondo. Mejorar lectura, acciones y persistencia visible. |
| Rutinas | Crear, personalizar icono/color, prescripciones, ordenar, duplicar, archivar, restaurar, borrador y recuperación | Falta inicio directo desde la lista; archivo usa un símbolo ambiguo. Añadir inicio explícito y usar icono identificable. |
| Historial | Calendario, selección de día, varias sesiones, detalles, editar, repetir, convertir en rutina y eliminar con confirmación | Doble llamada a crear en días vacíos. Una acción por intención. |
| Progreso | Búsqueda global, selector, métricas, periodos, gráfico, comparaciones y tabla | Solo accesible desde otras pantallas; búsqueda vacía no da salida útil. Destino principal y estado vacío accionable. |
| Arcade | Objetivos, meta semanal, logros, mapa muscular, temporadas, cofres, probabilidades, inventario, aspectos, cargas, habilidades y animaciones | Texto y decoración excesivos; cambiar pestaña no refleja URL. Mantener todas las pestañas visibles, sincronizar navegación y mejorar tamaños. |
| Perfil | Nombre, foto, biografía, estadísticas, últimas sesiones, edición, errores y protección de cambios | Cabecera decorativa y manifiesto compiten con actividad. Compactar sin eliminar edición ni información. |
| Ajustes | Cuenta/sincronización, conflictos/migración, perfil de entrenamiento, catálogo/fichas, preferencias, importar/exportar y reset con confirmaciones | Títulos publicitarios y texto técnico de propuestas no activadas. Agrupar por tarea y mantener consecuencias de cambios y acciones destructivas. |
| Estados | Carga, errores de lectura/escritura, conflictos, borradores, importación, offline y celebraciones | Carga poco orientativa, mensajes duplicados y bienvenida superpuesta al contenido. Añadir carga visual accesible y convertir bienvenida en aviso discreto. |

Identidad conservada: logotipo, arte existente, fondos oscuros, lima `#d8ff3e`, violeta `#b8a0ff`, tipografía y personalidad deportiva/arcade. Sin modificar modelos, fórmulas, reglas de XP, economía, permisos, migraciones ni servicios.

Pruebas previstas: unitarias locales, TypeScript, compilación y flujos de navegador con datos ficticios, anchos 320/390/768/1440, teclado, recuperación de borrador, rutina → series → finalizar → historial/progreso, catálogo, preferencias, respaldo, Arcade y cuenta simulada. Las pruebas antiguas anteriores a AccountGate no se usarán sin adaptar su preparación: esperan acceso directo al resumen y la base `entrenos-local`, mientras el invitado actual requiere elección explícita y usa `cheesit-guest`.
