# Compás interactivo

Vista independiente en `/interactivo/`, desde la rama `codex/interactive-practice`.

La pista muestra seis cuerdas y el traste de cada nota. Incluye cuerdas al aire,
una escala de Do y un arreglo didáctico de Oda a la alegría. La velocidad y la
exigencia se eligen antes del recorrido. Reiniciar permite cambiarlas.

El modo micrófono requiere un ataque nuevo y una altura compatible dentro de
la ventana temporal elegida. YIN estima la altura de notas individuales;
dos observaciones estables confirman cada ataque. La compensación de latencia
es ajustable. El sonido se analiza localmente, sin grabaciones ni subidas.
El modo demostración sintetiza las notas, sin otorgar puntos.

La afinación prevista es estándar, sin cejilla. La app reconoce altura, no puede
determinar físicamente en qué cuerda se produjo la misma nota. Varias cuerdas
simultáneas, ruido, micrófonos y latencia afectan los resultados. Los controles
para principiantes amplían ambos márgenes. Conviene usar auriculares.

`npm run check` verifica sintaxis, estimación de altura a 44,1/48/96 kHz,
notas desafinadas y la lógica de puntuación con un reloj y entrada de audio
sintetizados: ataques separados, nota sostenida, silencio, errores, pausa,
liberación del micrófono y demostración sin puntos.
`npm run build` genera `dist/`. La prueba acústica con guitarra y micrófono
físicos queda a cargo del usuario; las pruebas sintetizadas no la sustituyen.
