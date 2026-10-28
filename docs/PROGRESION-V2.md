# Progresión adaptativa y niveles musculares

## Perfil inicial y comparación

El perfil inicial solicitado es hombre, 20 años, 70 kg y 180 cm. Puede editarse y exportarse con los datos de la aplicación. La carga bilateral de dos mancuernas se interpreta por defecto como **peso de cada mancuerna**; si se elige peso de la pareja se utiliza la suma introducida. Los movimientos unilaterales no duplican la carga.

No se ha encontrado una norma poblacional válida que permita convertir ese perfil exacto en un promedio o percentil para cada uno de los 34 ejercicios, sus máquinas, sus variantes y su técnica. Los estudios de deportistas o de personas entrenadas tampoco representan a toda la población. La aplicación muestra **referencias orientativas del juego**, normalizadas por peso corporal, y progreso respecto al historial personal. No presenta los puntos como un diagnóstico, un percentil real ni una prescripción de cargas.

Edad, sexo y altura se conservan como información del perfil; no se les aplican multiplicadores inventados. Cambiar el perfil o la convención de mancuernas recalcula el historial con esa configuración actual, pues las sesiones antiguas no guardaban esos datos por serie.

## XP por serie

Solo las series confirmadas y válidas aportan XP al progreso guardado. La interfaz puede previsualizar la recompensa de una serie válida antes de confirmarla.

`XP = 30 base + repsXP + cargaXP + progresoXP`

- `repsXP = 2 × mínimo(repeticiones, 15)`.
- En carga externa, `cargaXP = mínimo(40, redondear(20 × cargaEfectiva / referenciaKg))`.
- En ejercicios de peso corporal, `cargaXP = 10`; las repeticiones y el progreso personal aportan el resto.
- `progresoXP = mínimo(30, redondear(100 × máximo(0, rendimiento / mejorRendimientoAnterior − 1)))`. Sin una serie anterior comparable terminada, el bonus es cero.
- Rendimiento externo: `cargaEfectiva × (1 + mínimo(repeticiones, 15) / 30)`. Es un **índice del juego**, no una estimación de 1RM fuera de su rango válido.
- Rendimiento corporal: `mínimo(repeticiones, 30)`.
- Solo se comparan el mismo ejercicio y modalidad con sesiones terminadas de fechas anteriores. Las series del mismo día no se dan bonus unas a otras. Los borradores no establecen nuevas referencias históricas.
- Máximo 130 XP por serie. Los límites evitan que introducir cantidades extremas multiplique indefinidamente la recompensa; no se necesita entrenar al fallo para registrar esfuerzo.

Referencias de juego por peso corporal para barra: banca `1 × peso`, sentadilla `1,25 ×`, peso muerto convencional `1,5 ×`, rumano `1,2 ×`, press militar `0,6 ×` y remo con barra `0,8 ×`. Estos factores son **decisiones de equilibrio del juego**, no promedios clínicos o poblacionales. Los otros movimientos usan la carga relativa al peso corporal sin asignarles una norma específica; las máquinas solo se comparan con el mismo identificador del historial.

Ejemplos con el perfil inicial:

| Serie de banca | Sin historial | Con referencia anterior 50 kg × 8 |
| --- | ---: | ---: |
| 50 kg × 8 | 60 XP | 60 XP |
| 55 kg × 8 | 62 XP | 72 XP |
| 50 kg × 10 | 64 XP | 69 XP |

Terminar una sesión mantiene 200 XP adicionales, 100 XP por trabajar tres grupos principales y 75 XP por cada serie de récord comparable. Los bonus de terminar se muestran separados de las series ya ganadas. Los niveles generales mantienen los umbrales 0, 1.000, 2.250, 3.750… XP.

## Estimación informativa de fuerza

La estimación de Brzycki `kg × 36 / (37 − repeticiones)` se muestra solo con una a diez repeticiones, carga positiva y banca con barra, sentadilla con barra o peso muerto convencional. Con más repeticiones, otros movimientos, ejercicios de peso corporal, máquinas o ejercicios personalizados se omite. No se infiere que una serie fue al fallo: al no registrar esfuerzo percibido ni repeticiones en reserva, la cifra es aproximada y no define lo que debes intentar levantar.

## Cada músculo tiene su nivel

- Cada músculo recibe el XP adaptativo de las series en las que participa: 100 % como principal y 50 % como secundario. Puede conservar medios puntos.
- No recibe el bonus global por finalizar ni el bonus de récord de 75 XP; sí recibe la mejora personal incluida en cada serie.
- El primer ascenso muscular requiere 500 XP y cada siguiente 100 XP más: inicios 0, 500, 1.100, 1.800…
- El nivel se calcula con todo el historial confirmado hasta hoy. Elegir 7, 14 o 30 días cambia el mapa de actividad reciente, **no borra el nivel de toda la trayectoria**.
- Una serie eliminada o desconfirmada deja de aportar experiencia. Recargar o volver a confirmar no acumula dos premios. Los identificadores repetidos se cuentan una sola vez.
- Los ejercicios personalizados conservan la asignación aproximada por grupo. El nivel es un indicador de actividad registrada dentro del juego; el color del mapa no mide recuperación ni crecimiento muscular real.

## Fuentes consultadas

- [ACSM, actualización de entrenamiento de fuerza de 2026](https://acsm.org/resistance-training-guidelines-update-2026/): respalda la individualización y la constancia como base del entrenamiento; no proporciona una media para cada perfil exacto ni los multiplicadores de este juego.
- [Brzycki aplicado y evaluado en banca, sentadilla y peso muerto (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8471343/): documenta la ecuación utilizada para la estimación informativa. El índice arcade de rendimiento es una fórmula distinta, declarada arriba.
- [Whisenant y colaboradores, validación de ecuaciones de banca (2003)](https://pubmed.ncbi.nlm.nih.gov/12741856/): muestra que la validez de la predicción depende del número de repeticiones y estudia una muestra específica de jugadores universitarios, no una población general de hombres de 70 kg.

## Verificación de dominio

Las pruebas comprueban aumento de XP con carga y repeticiones, límites, datos inválidos, referencias personales de fechas anteriores, convención de mancuernas, normalización por peso sin multiplicadores demográficos inventados, estimación de 1RM limitada, concordancia entre previsualización y cálculo total, identificadores repetidos, niveles musculares históricos, participación secundaria y recálculo después de editar o eliminar actividad.
