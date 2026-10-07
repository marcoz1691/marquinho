# Servidor estático para las pruebas de Playwright.
# `python3 -m http.server` solo deja 5 conexiones en cola: con varios navegadores en paralelo
# rechaza algunas y la página falla con "Failed to fetch". Este usa una cola más grande.
import http.server
import sys

http.server.ThreadingHTTPServer.request_queue_size = 256
puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler, ServerClass=http.server.ThreadingHTTPServer, port=puerto, bind="127.0.0.1")
