"""Serve the frontend. Run from the frontend folder:  python serve.py

Change PORT below to use a different frontend port, then open http://localhost:<PORT> in Chrome.
(The backend port is separate: PORT in backend/.env, and apiBase in frontend/config.js.)
"""
import http.server
import os

PORT = int(os.environ.get("FRONTEND_PORT", 3000))   # <- change the frontend port here

os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # always load the latest JS/CSS while developing
        super().end_headers()


if __name__ == "__main__":
    # ThreadingHTTPServer: browsers open several connections at once; a single-threaded server would stall the page.
    with http.server.ThreadingHTTPServer(("", PORT), Handler) as httpd:
        print(f"Frontend running at http://localhost:{PORT}  (Ctrl+C to stop)")
        httpd.serve_forever()
