"""Serve the frontend. Run from the frontend folder:  python serve.py

Change PORT below to use a different frontend port, then open http://localhost:<PORT> in Chrome.
(The backend port is separate: PORT in backend/.env, and apiBase in frontend/config.js.)
"""
import http.server
import os

PORT = int(os.environ.get("FRONTEND_PORT", 3000))   # <- change the frontend port here

os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".webmanifest": "application/manifest+json", ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # always load the latest JS/CSS while developing
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    # The page loads ~50 small JS modules at once. Python's default queue of 5 pending connections makes Windows
    # refuse some of them (net::ERR_CONNECTION_REFUSED), so allow more to wait.
    request_queue_size = 128


if __name__ == "__main__":
    # Threading: browsers open several connections at once; a single-threaded server would stall the page.
    with Server(("", PORT), Handler) as httpd:
        print(f"Frontend running at http://localhost:{PORT}  (Ctrl+C to stop)")
        httpd.serve_forever()
