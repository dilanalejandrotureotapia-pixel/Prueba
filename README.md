# JAB Motion Analyzer

Aplicación web académica para analizar cinemáticamente un golpe JAB de boxeo mediante MediaPipe Pose Landmarker.

## Archivos

- `index.html`: estructura visual.
- `style.css`: estilos y diseño responsive.
- `script.js`: MediaPipe, cálculos biomecánicos, detección de extensión y gráficos.

## Primera versión funcional

La aplicación permite:

1. cargar un video;
2. seleccionar brazo derecho o izquierdo;
3. detectar hombro, codo y muñeca;
4. calcular el ángulo del codo;
5. estimar la fase de extensión;
6. calcular ángulo inicial, máxima extensión, rango angular, duración y velocidad angular máxima;
7. dibujar el segmento del brazo sobre el video;
8. mostrar un gráfico ángulo-tiempo;
9. visualizar la cámara en vivo.

## Ejecución recomendada

No abras `index.html` solamente con doble clic si deseas probar todas las funciones.

### Opción A: Visual Studio Code + Live Server

1. Instala Visual Studio Code.
2. Abre esta carpeta.
3. Instala la extensión "Live Server".
4. Haz clic derecho sobre `index.html`.
5. Selecciona "Open with Live Server".

### Opción B: Python

Si Python está instalado:

```bash
python -m http.server 8000
```

Luego abre:

```text
http://localhost:8000
```

## Uso

1. Espera hasta ver "MediaPipe listo".
2. Presiona "Cargar video".
3. Selecciona el brazo analizado.
4. Presiona "Analizar JAB".
5. Espera a que el procesamiento llegue al 100 %.
6. Revisa resultados y gráfico.

## Recomendación de grabación

- utilizar un solo JAB por video;
- mantener visible hombro, codo y muñeca;
- grabar preferentemente de perfil;
- evitar movimiento de cámara;
- usar buena iluminación;
- evitar ropa que oculte el miembro superior;
- mantener todo el brazo dentro del encuadre.

## Limitaciones

- análisis principalmente 2D;
- sensible a la perspectiva;
- sensible a oclusiones;
- la frecuencia efectiva de análisis depende del video y del navegador;
- la velocidad angular es una estimación basada en diferencias entre muestras;
- no se calcula velocidad lineal absoluta del puño en m/s en esta versión;
- la herramienta no establece diagnóstico ni determina si una técnica es correcta o incorrecta.


## Versión 1.2 — Visualización biomecánica sincronizada

Esta actualización incorpora:

- reproducción normal del video después del análisis;
- landmarks hombro-codo-muñeca sobre el video;
- arco del ángulo del codo;
- valor angular dinámico junto a la articulación;
- trayectoria acumulada de la muñeca;
- clasificación visual de la fase:
  - guardia / preparación;
  - extensión;
  - máxima extensión;
  - retorno / fase posterior;
- HUD con fase, ángulo y tiempo;
- sincronización automática al reproducir, pausar o mover la barra del video.

La reproducción utiliza los landmarks ya calculados durante el análisis, por lo que no vuelve a ejecutar MediaPipe para cada cuadro.


## Versión 1.3 — Corrección de visualización del video

Se corrigió un problema de capas visuales en el que el placeholder
"Carga un video para comenzar" podía seguir apareciendo encima del video
aunque el archivo ya hubiese sido cargado y analizado.

La corrección incluye:

- `.empty-state[hidden] { display: none !important; }`
- ocultamiento explícito del placeholder al cargar el video;
- ocultamiento explícito al finalizar el análisis;
- restauración del placeholder solamente al reiniciar.


## Versión 1.4 — Corrección de alineación de landmarks

Se corrigió el desplazamiento de hombro, codo, muñeca, arco angular y trayectoria
cuando el video se muestra con franjas negras por diferencias de relación de aspecto.

La aplicación ahora calcula el rectángulo real ocupado por la imagen dentro de
`object-fit: contain` y aplica los offsets correspondientes antes de dibujar
los landmarks.


## Versión 1.5 — Superposición 1:1 video/canvas

Se reemplazó el sistema de compensación manual por una solución estructural:

- el video y el canvas están dentro del mismo `video-surface`;
- `video-surface` toma exactamente el tamaño visible del video;
- el canvas se superpone 1:1 al video;
- las coordenadas normalizadas se convierten directamente con:
  - `x = landmark.x × anchoVisible`
  - `y = landmark.y × altoVisible`
- se usa `ResizeObserver` para mantener la alineación al redimensionar;
- se incorpora `devicePixelRatio` solamente para mejorar nitidez, sin cambiar
  el sistema de coordenadas.

Esta versión elimina la dependencia de offsets por barras negras del contenedor.


## Versión 2.0 — Rediseño visual completo

Esta versión mantiene la lógica de detección y cálculo de la v1.5 y mejora
principalmente la presentación de la aplicación.

### Cambios visuales

- nombre del proyecto completamente en español:
  **Analizador Cinemático del JAB**;
- nueva jerarquía visual y estructura académica;
- HUD sobre el video rediseñado para evitar superposición de textos;
- tarjetas de resultados reorganizadas y con descripción de cada variable;
- controles de configuración más claros;
- leyenda visual para articulaciones, segmentos y trayectoria;
- gráfico principal integrado en un panel más limpio;
- sección metodológica y de limitaciones mejor presentada;
- diseño responsive mejorado para computador y teléfono;
- textos y botones completamente en español.

### Se mantiene sin cambios

- MediaPipe Pose Landmarker;
- detección de hombro, codo y muñeca;
- cálculo del ángulo del codo;
- fase de extensión;
- máxima extensión;
- rango angular;
- tiempo hasta máxima extensión;
- velocidad angular máxima;
- trayectoria de muñeca;
- superposición sincronizada sobre el video.


## Versión 2.1 — Parámetros específicos del JAB

Se incorporan dos métricas nuevas:

### Velocidad angular media de extensión

Representa qué tan rápidamente cambia el ángulo del codo desde el inicio
estimado del JAB hasta la máxima extensión:

`velocidad angular media = rango angular / tiempo de extensión`

Unidad: `°/s`.

No debe confundirse con velocidad lineal del puño en `m/s`, ya que la
aplicación no utiliza calibración espacial absoluta.

### Tiempo de retorno a guardia

Después de la máxima extensión, se busca el primer instante en que el ángulo
del codo vuelve aproximadamente al ángulo basal de guardia (tolerancia ±10°).

La interfaz distingue ahora:

- Guardia / preparación
- Extensión
- Máxima extensión
- Retorno a guardia
- Guardia recuperada

Si el retorno no ocurre dentro del video o no se detecta de forma estable,
la interfaz muestra `No detectado`.


## Versión 2.2 — HUD compacto inferior

Se modificó la superposición de información del video:

- Fase, ángulo y tiempo ahora aparecen en el borde inferior;
- las tarjetas son más pequeñas;
- se redujo el tamaño de fuente y padding;
- el HUD ocupa menos superficie del video;
- en dispositivos móviles se compacta aún más.
