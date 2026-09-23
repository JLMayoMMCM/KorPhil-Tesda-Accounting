import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "Backend"

if __name__ == "__main__":
    sys.exit(subprocess.call([sys.executable, "manage.py", "runserver", *sys.argv[1:]], cwd=BACKEND_DIR))
