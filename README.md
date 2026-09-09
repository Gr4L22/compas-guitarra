# Compás

Demo web de práctica de guitarra. El audio del micrófono se procesa en el navegador.

## Publicación automática

GitHub Pages: `.github/workflows/deploy.yml` verifica el JavaScript, genera `dist/` y publica cada push a `main` o `master`. En Settings → Pages debe estar seleccionado GitHub Actions. Solo se publican `index.html`, `src/` y `.nojekyll`.

Vercel: importar este repositorio, elegir el preset Other y desplegar. `vercel.json` configura `npm run build` y el directorio `dist`. Los pushes a la rama de producción generan nuevos despliegues con la integración Git de Vercel.

Validación local: `npm run check` y `npm run build`. No hay dependencias npm que instalar. Servir `dist/` con `python3 -m http.server 8000 --directory dist`.

Primera versión de una guía de acordes para guitarra en español, sin instalación de dependencias.

## Abrir

Desde esta carpeta: `python3 -m http.server 8000`. Abrí http://localhost:8000 en el navegador. El micrófono requiere localhost o HTTPS.

## Uso

Elegí una progresión o escribí tu propia secuencia de acordes. Ajustá los BPM y empezá la práctica. En Aprender a mi ritmo, el micrófono estima el acorde mediante sus componentes de frecuencia y avanza después de una coincidencia sostenida. Hay un botón para avanzar manualmente. En Seguir el ritmo, cada acorde dura cuatro pulsos y la secuencia se repite. Los diagramas muestran las cuerdas de sexta a primera y los dedos numerados. Fa incluye cejilla.

Podés marcar tus rasgueos con el botón o la barra espaciadora (fuera de los controles), o activar el micrófono. En el modo rítmico, el micrófono detecta subidas de volumen localmente: no graba ni envía audio. Usá auriculares para que el metrónomo no cause detecciones falsas.

La métrica es el desvío absoluto promedio de los últimos 32 ataques respecto al pulso más cercano. Es una estimación básica, sensible al ruido y a la latencia del dispositivo. La medición rítmica no evalúa acordes correctos, rasgueos omitidos ni patrones complejos. El reconocimiento del modo Aprender es experimental, funciona con los nueve acordes disponibles y necesita validación con una guitarra real. Las progresiones son ejercicios; todavía no hay importación de canciones ni reconocimiento de melodías.
