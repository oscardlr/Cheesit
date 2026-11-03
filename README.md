# Cheesit

Aplicación web móvil para registrar entrenamientos de fuerza, instalable como PWA. Incluye acceso con Supabase, sincronización por cuenta y caché sin conexión. Configuración, pruebas y límites: [Cuentas y sincronización](docs/CUENTAS-Y-SINCRONIZACION.md). La especificación completa está en [ESPECIFICACION-ENTRENOS.md](ESPECIFICACION-ENTRENOS.md).

## Ejecutar

Con Node.js 24:

```sh
npm ci
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). Para probar el service worker y la carga sin conexión se necesita una compilación de producción:

```sh
npm run build
npm start
```

## Mejoras del 28 de octubre de 2026

Respaldos restaurables con borradores incompletos, protección de escrituras entre pestañas, errores recuperables y caché offline verificada por compilación. El registro incluye descanso persistente, duración, notas, RPE/RIR opcional, copiar todas las series, reordenar/sustituir ejercicios, repetir sesiones y convertirlas en rutinas. Las rutinas admiten rangos, carga objetivo y descanso; se permiten varias sesiones en un día con metas por días distintos.

Progreso dispone de búsqueda global, gráficos y tabla de carga externa total, repeticiones y volumen. El 1RM estimado se limita a movimientos con barra admitidos. Los ejercicios propios conservan modalidad, convención y músculos por sesión. Perfil y preferencias están en Ajustes. Los cofres respetan movimiento reducido y ofrecen revelado rápido, manteniendo el giro completo de cinco segundos como opción.

Detalle por fases, evidencia y límites: [informe de implementación](docs/IMPLEMENTACION-MEJORAS-2026-10-28.md). La [economía v2](docs/PROPUESTA-ECONOMIA-V2.md) es una propuesta sin activar: no se han cambiado automáticamente las reglas históricas de XP/créditos ni conectado la sincronización remota.

## Experiencia de entrenamiento

La interfaz usa una identidad oscura con violeta y lima, una ilustración 3D propia, navegación adaptable a móvil y escritorio y animaciones que respetan el movimiento reducido del dispositivo. Las rutinas sugeridas se pueden personalizar antes de guardarlas.

Cada serie válida y confirmada suma XP según repeticiones, carga relativa y mejora personal, hasta 130 XP; terminar una sesión añade 200 XP, con bonus de 75 XP por serie de récord comparable y 100 XP por trabajar tres grupos musculares. El personaje progresa por año natural, del nivel 1 al 99: el primer escalón requiere 800 XP y el máximo 363.580 XP acumulados en el año. El progreso se calcula desde los registros guardados: editar o volver a confirmar una serie no duplica puntos. Las cuentas recogen peso, altura, edad y sexo una sola vez al completar el registro; el modo invitado utiliza referencias internas sin preguntas personales; registra el peso de una mancuerna y el peso total en barra. Las referencias son orientativas del juego, sin percentiles demográficos inventados. Curva, simulaciones y migración: [docs/blocks-4-5-integration.md](docs/blocks-4-5-integration.md).

Las series muestran contadores ascendentes sin bloquear la siguiente entrada; finalizar abre un jackpot con confeti, desglose y objetivos conquistados. Las subidas de nivel muestran al atleta pixelado ascendiendo escaleras. Al entrar, una animación de cuatro fotogramas reproduce un press de banca. Todos los botones tienen respuesta sonora; sonido y efectos tienen controles persistentes y respetan el movimiento reducido.

En **Arcade** encontrarás 52 objetivos con recompensas de XP automáticas: 17 semanales y 35 de trayectoria. Cada recompensa se concede una sola vez; «A tu ritmo» permite elegir los días de entrenamiento por semana. También hay logros, mapa muscular anterior y posterior, cofres, armario y camino de niveles. El mapa, las series y los niveles musculares usan el mes natural seleccionado, por defecto el actual. Los músculos reinician cada día 1 y el personaje cada 1 de enero, conservando entrenamientos, récords, colección y estadísticas anteriores. Cuerpo y Ascenso permiten consultar temporadas históricas.

Cada 5 XP históricos generan un crédito virtual y empiezas con 100 de bienvenida; el reinicio anual no modifica el saldo. Los cofres comprados mezclan tipos de recompensa con rarezas y probabilidades visibles. Cada nivel del 2 al 99 desbloquea un cofre gratuito por año, con equipo aleatorio entre todas las ranuras. La animación completa de la ruleta dura cinco segundos y abre el contenido después. Movimiento reducido, efectos apagados y «Revelar ahora» usan un revelado estático del mismo premio reservado. Recargar recupera la apertura sin repetir el sorteo ni enseñar el premio en la colección. Puedes equipar y quitar piezas en cinco ranuras y una compañera, y ver tu personaje en Resumen. Los objetos obtenidos no se pueden vender. El inventario agrupa las copias del mismo equipo o compañera y muestra su cantidad sobre la tarjeta, por ejemplo `3x`. Las frases antiguas se convierten una sola vez en créditos por su identidad original, sin conceder XP.

El armario incluye **35 piezas**, cuatro compañeras adultas y cinco animaciones articuladas: reposo, caminar, entrenar, victoria y poder. Las tres nuevas colecciones incluyen 15 sprites pixel art violeta, lima y oro, cada uno con su habilidad. En el armario se pueden probar y pausar los movimientos, y filtrar por colección. Aspectos reúne equipo y compañeras con filtros por ranura y muestra los diseños pendientes en gris, con la etiqueta «Sin desbloquear». La apariencia desbloqueada es permanente, incluso al agotar su habilidad. Cada copia de equipo aporta una carga, sea cual sea su rareza. Las habilidades se seleccionan por separado: una activa para la próxima sesión y una carga al terminar si aporta un bonus. Los bonus se guardan con la sesión, sin aplicarse retroactivamente al cambiar de objeto. Los entrenamientos nuevos usan automáticamente el verde de la interfaz. Reglas y equilibrio: [docs/EQUIPO-V3.md](docs/EQUIPO-V3.md); arte y prompts: [docs/RECURSOS-ARCADE-V3.md](docs/RECURSOS-ARCADE-V3.md).

Los cofres comprados mezclan 73,33 % equipo y 26,67 % compañeras, usando pesos exactos sin frases y conservando precios y probabilidades de rareza. Los cofres de nivel garantizan equipo. Las copias incluyen colección, movimientos, consumos de habilidades, aspectos, compañera, recompensas de objetivos, perfil, apertura pendiente, temporadas, conversiones y preferencias. Los registros antiguos de frases se conservan para auditoría, sin mostrarse en la colección. Las versiones anteriores están documentadas en [docs/EVOLUCION-ARCADE-V2.md](docs/EVOLUCION-ARCADE-V2.md), [docs/LOOT-V2.md](docs/LOOT-V2.md) y [docs/GAMIFICACION.md](docs/GAMIFICACION.md).

Los ejercicios del catálogo con mancuernas muestran su convención junto a los campos: el peso se introduce por mancuerna y la XP utiliza la carga de las dos en movimientos bilaterales, o la individual en movimientos alternos o con una sola mancuerna. Los perfiles antiguos que registraban la pareja conservan su aviso y sus datos.

El navegador debe abrir la aplicación e iniciar sesión con conexión al menos una vez. El almacenamiento de Safari y el de una PWA instalada pueden ser independientes. Los datos de esta versión se guardan en IndexedDB de este navegador; no existe una copia remota. Exporta una copia JSON y guárdala en un lugar privado. Las escrituras comprueban una revisión atómica. Cuando otra pestaña guarda cambios, la desactualizada protege lo pendiente para exportarlo y exige recargar; no sobrescribe el historial en silencio.

## Verificación

### Publicación en Vercel y uso móvil

URL pública: [https://cheesit-entrenos.vercel.app](https://cheesit-entrenos.vercel.app). Proyecto `cheesit-entrenos` en el espacio `financial-ai`, conectado al repositorio `oscardlr/Cheesit`. Las ramas generan previews y la rama `main` publica producción mediante la integración GitHub–Vercel. La vinculación local queda en `.vercel/project.json`, excluida de Git.

La aplicación se puede alojar en Vercel como proyecto Next.js con `npm ci` y `npm run build`, usando Node.js 24. La publicación no necesita variables de Supabase mientras siga utilizándose el almacenamiento local. En producción, dejar `NEXT_PUBLIC_TEST_CREDITS` sin definir o establecerlo a `0`.

`.vercelignore` excluye entornos locales, dependencias, compilaciones previas, pruebas y artefactos del envío. Las credenciales y la vinculación local de Vercel también están excluidas de Git. Publicar no requiere subir los entrenamientos: los datos permanecen en el navegador.

Desde la URL pública HTTPS, en iPhone abrir Safari y elegir **Compartir → Añadir a pantalla de inicio**. En Android abrir Chrome y elegir **Instalar aplicación** o **Añadir a pantalla de inicio**. Abrirla con conexión y esperar al aviso «Disponible sin conexión» antes de probarla sin red. Las actualizaciones se aplican con «Guardar y actualizar» y protegen las ediciones pendientes.

El dominio publicado tiene un almacenamiento distinto de `localhost`; para llevar el historial al móvil, exportar una copia JSON desde la instalación anterior e importarla desde la nueva. No hay sincronización automática entre dispositivos. Conservar la copia en un lugar privado y comprobar la importación antes de borrar el original.

Para publicar, comprobar el destino, validar una rama aislada y revisar su preview antes de fusionarla en `main`. La integración GitHub–Vercel genera el despliegue de producción; no es necesario ejecutar además un despliegue manual.

### Créditos temporales de prueba

Esta instalación local tiene `NEXT_PUBLIC_TEST_CREDITS=1000000` en `.env.local` (excluido de Git). Añade un millón de créditos de prueba y muestra un aviso en Cofres. No cambia XP, entrenamientos ni niveles.

**Antes de preparar la versión final:** eliminar esa variable o ponerla a `0`, recompilar y reiniciar. Las compras financiadas en pruebas y las ventas guardadas de versiones anteriores quedan marcadas con `testFunded`; no generan deuda ni saldo real al retirar la ayuda. Los objetos y aspectos obtenidos se conservan. Las pruebas normales de navegador esperan el modo de créditos temporales desactivado; recompilar con la variable a `0` antes de ejecutar esa batería.

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
```

La prueba de navegador utiliza Chrome instalado y un servidor de producción en `localhost:3000`. Añadir `PLAYWRIGHT_PRODUCTION=1` para incluir la comprobación de caché y arranque offline; `node scripts/verify-offline-builds.mjs` verifica además dos compilaciones reales. Las pruebas unitarias no requieren servidor.

Para comprobar otra instancia local, configura `PLAYWRIGHT_BASE_URL` con su URL. Las pruebas de navegador cubren registro y recuperación de sesiones, celebraciones, XP, niveles, preferencias, descarte de cambios históricos, objetivos, mapa corporal, apertura de cofres e inventario agrupado sin ventas. Comprueban 24 combinaciones de pantalla y anchura (320, 390, 768 y 1440 px) y generan capturas en `test-results/`. Reinicia el servidor de producción después de recompilar para que sirva los recursos de la versión nueva.

## Estado y límites

Están implementados el registro local de rutinas y sesiones, la confirmación explícita de series, calendario, estadísticas, comparaciones y exportación/importación del formato local. Se incluye la instalación PWA y una caché del shell; la carga sin red se ha comprobado en Chromium, no en un iPhone físico.

No están terminados la cuenta ni la sincronización entre dispositivos. Hay una migración SQL y un cliente remoto preparados, pero no conectados ni validados contra un servicio real. Tampoco se ha probado el aislamiento de usuarios, la recuperación, la restauración de copias ni la operación en producción. Consulta [docs/SERVIDOR.md](docs/SERVIDOR.md) antes de usar esa infraestructura.

Quedan las ilustraciones del catálogo, importadores de formatos ajenos y pruebas en iPhone/Android físicos. El catálogo incluye fichas de texto originales; el informe de implementación documenta el alcance probado. El catálogo recoge los 34 nombres enumerados en la tabla: el documento los cuenta como 33 por error. Los borradores conservan el texto parcial y se restauran por identificador; las series confirmadas se validan estrictamente.
