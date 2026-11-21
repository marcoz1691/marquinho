# Servidor estático para las pruebas de Playwright.
# `python3 -m http.server` solo deja 5 conexiones en cola: con varios navegadores en paralelo
# rechaza algunas y la página falla con "Failed to fetch". Este usa una cola más grande.
# Aplica los encabezados de vercel.json (CSP incluida), para que las pruebas corran con la misma política que producción.
import http.server
import json
import pathlib
import re
import sys

REGLAS = [(re.compile("^" + r["source"] + "$"), r["headers"])
          for r in json.loads((pathlib.Path(__file__).parent.parent / "vercel.json").read_text()).get("headers", [])]


class Manejador(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        ruta = self.path.split("?")[0]
        for patron, encabezados in REGLAS:
            if patron.match(ruta):
                for h in encabezados:
                    self.send_header(h["key"], h["value"])
        super().end_headers()


http.server.ThreadingHTTPServer.request_queue_size = 256
puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
http.server.test(HandlerClass=Manejador, ServerClass=http.server.ThreadingHTTPServer, port=puerto, bind="127.0.0.1")
