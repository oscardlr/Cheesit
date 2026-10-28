# Propuesta compatible de economía v2

Estado: propuesta, sin activar. Las partidas existentes siguen usando las reglas actuales. Cambiar el peso corporal todavía recalcula el XP histórico; el editor de perfil muestra el efecto antes de guardar. Los récords repetidos de una misma sesión conservan por ahora su tratamiento anterior. Aplicar automáticamente otra fórmula reduciría XP, niveles y créditos ya obtenidos.

## Cambios propuestos

1. Cada sesión nueva guarda la versión de reglas y una instantánea del perfil usado para calcular sus recompensas. Actualizar el perfil afecta solo a sesiones posteriores.
2. Un récord paga una vez por ejercicio, modalidad y marca comparable en una sesión. Repetir 55 × 8 en seis series deja una marca premiada; mejorar después a 60 × 8 deja una segunda marca distinta. Los bloques repetidos del mismo ejercicio comparten esta clave.
3. Las recompensas de series confirmadas, finalización y récord se guardan con identificadores estables. Reintentar, recargar o importar el mismo evento no paga otra vez. Editar una serie muestra el ajuste antes de confirmar; borrar actividad usa eventos de ajuste, conserva objetos y explica cualquier saldo pendiente.

## Migración que debe aprobar el usuario

Ofrecer en Ajustes «Conservar mi progreso y usar las nuevas reglas desde ahora», con una vista previa descargable. Antes de confirmar, generar una copia v2 restaurable y comparar de forma explícita XP, nivel, créditos disponibles, déficit, cargas, objetos y cofres por nivel.

Al confirmar, en una única transacción local con comprobación de revisión:

- Congelar el total de XP de entrenamiento existente, su detalle por sesión y el perfil actual como origen legado. Conservar por separado el ledger permanente de objetivos.
- Guardar un punto de partida de créditos y déficit que reproduzca exactamente el saldo actual, incluidos ventas históricas y créditos temporales. El primer cálculo v2 debe coincidir antes y después; no crear créditos compensatorios a partir de un saldo ya limitado a cero.
- Mantener intactos transacciones, inventario, premios reservados, objetivos cobrados, usos de habilidades y niveles/cofres ya reclamados. No reconstruir ventas ni volver a sortear premios.
- Activar v2 únicamente para eventos posteriores al punto de corte. Restaurar una copia anterior o mezclar ramas exige detectar su versión; no convertir ni reemplazar una rama económica silenciosamente.

La nueva versión del respaldo debe validar ambos regímenes, la instantánea y el punto de corte. El importador debe preservar campos y detectar conflictos de migración. Una migración repetida con el mismo identificador devuelve el mismo resultado. Hasta implementar y probar estas garantías, el botón de migración no debe aparecer como operativo.

## Elecciones de recompensa ya compatibles

La apertura rápida y el revelado estático solo descubren el premio reservado: no cobran de nuevo ni cambian el sorteo. El giro completo mantiene cinco segundos por elección de animación.

Las nuevas compras ofrecen una opción explícita, desmarcada por defecto, para convertir una compañera que ya se obtuvo en equipo de su misma rareza. Los cofres gratuitos de ascenso permiten elegir ranura antes del sorteo; mantienen las probabilidades de rareza y recurren al resto del equipo de la rareza si no existe pieza en esa ranura. Ninguna elección cambia copias antiguas ni devuelve moneda. No se han asignado beneficios retroactivos a las compañeras duplicadas existentes.

## Pruebas necesarias para activar v2

- La vista previa y la migración producen exactamente el mismo resultado; cancelarla no escribe nada.
- Repetir importación/migración/apertura/finalización no duplica recompensas ni cobra cargas.
- Cambiar peso tras la migración no afecta el XP anterior; repetir el mismo récord no suma varios bonus.
- Conservar íntegros una partida con ventas legacy, déficit, habilidad consumida y apertura pendiente.
- Restaurar en instalación vacía y resolver ramas con versiones distintas sin borrar historial.
- Fallos de disco y conflictos de revisión dejan la copia y la partida anterior recuperables.
