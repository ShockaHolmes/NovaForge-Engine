from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

PORT = 5173
ROOT = Path(__file__).parent.resolve()

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    os.chdir(ROOT)
    print(f"NovaForge Engine running at http://localhost:{PORT}")
    print("Press Ctrl+C to stop the server.")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
