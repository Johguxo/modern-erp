# Prototipo de diseño

Copia de las 8 pantallas del prototipo (lienzo de diseño de LinkUs). Cada archivo `.dc.html` es una pantalla:

| Archivo | Pantalla | MVP |
|---|---|---|
| `Main.dc.html` | 1 · Bandeja de solicitudes | Sí |
| `NuevoSOF.dc.html` | 2 · Nuevo SOF con catálogo | Sí |
| `DetalleSOF.dc.html` | 3 · Detalle y línea de tiempo | Sí |
| `Cotizaciones.dc.html` | 4 · Comparación de cotizaciones con IA | Fase 2 |
| `Tablero.dc.html` | 5 · Tablero | Fase 3 |
| `CorreoHK.dc.html` | 6 · Correo de aprobación para Hong Kong | Fase 2 |
| `MovilAprobar.dc.html` | 7 · Aprobación desde el celular | Responsive de la 3 |
| `MovilWhatsApp.dc.html` | 8 · Notificación por WhatsApp | Fase 3 |

## Fuente

El original es el canvas de diseño **"LinkUs – Prototipo Plataforma de Compras y Almacén"**: https://claude.ai/artifact/9FBU3uH9hBRsg6q7HdLuA3. El 19 nov 2026 se verificó que estas 8 copias son idénticas byte a byte a las del canvas. Si el canvas cambia, se vuelve a copiar aquí; el repo es la referencia que leen los agentes.

- Tamaño de referencia: pantallas de escritorio (1–5) de 1280×820 y fluidas (`expand: fill`); correo (6) de 720×760; móviles (7–8) de 390×844.
- Nota del canvas: prototipo **no funcional** hecho para la reunión de alcance con el cliente. Los datos son de ejemplo y la marca LinkUs es provisional (falta el logo oficial).

**Cómo leerlos:** el HTML usa un formato propio del lienzo (`<x-dc>`, `<sc-for>`, `<sc-if>`, huecos `{{valor}}`) y al final trae un `<script type="text/x-dc">` con una clase `Component` que contiene los datos de ejemplo y la interacción. No se ejecutan en el navegador tal cual: sirven como referencia de estructura, textos, estados y estilos inline. Implementar con React + Tailwind + shadcn según `docs/ui/mapa-pantallas.md` y `docs/ui/design-tokens.md`.
