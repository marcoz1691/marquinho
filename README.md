# Sitio web de notaría (Ecuador)

Sitio estático, minimalista y responsive. Sin dependencias ni build.

## Editar contenido
- `data/notaria.json`: nombre, notario, dirección, teléfonos, WhatsApp, correo, horario, mapa y redes (reemplaza los `[EDITAR]`).
- `data/tramites.json`: categorías, trámites, requisitos, pasos y preguntas frecuentes.
- `data/tarifas.json`: SBU e IVA para la calculadora (verificar con el Reglamento vigente del Consejo de la Judicatura).

## Ver en local
```
python3 -m http.server 8000
```
Abrir http://localhost:8000 (no funciona con `file://` porque carga JSON).

## Publicar
GitHub Pages (rama y carpeta raíz), Netlify o cualquier hosting estático.
