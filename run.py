"""Run the dashboard: `python run.py` (dev server on http://localhost:8000).

`python run.py start` serves a production build instead.
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = "8000"  # must match the OAuth redirect URI (http://localhost:8000/auth/callback/)
NEXT = ROOT / "node_modules" / "next" / "dist" / "bin" / "next"


def need(tool):
    path = shutil.which(tool)  # npm is npm.cmd on Windows
    if not path:
        sys.exit(f"{tool} not found: install Node.js from https://nodejs.org")
    return path


def run(*args):
    """Run a command in the repo; Ctrl+C stops it cleanly instead of leaving it holding the port."""
    proc = subprocess.Popen(args, cwd=ROOT)
    try:
        return proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        return proc.wait()


if __name__ == "__main__":
    node = need("node")
    if not NEXT.exists() and run(need("npm"), "install"):
        sys.exit("npm install failed")
    # Call Next with node directly, not through npm.cmd: the batch wrapper's
    # "Terminate batch job (Y/N)?" on Ctrl+C can orphan the server on port 8000.
    if sys.argv[1:] == ["start"]:
        sys.exit(run(node, NEXT, "build") or run(node, NEXT, "start", "-p", PORT))
    sys.exit(run(node, NEXT, "dev", "-p", PORT))
