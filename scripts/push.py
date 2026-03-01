import subprocess
import sys

if len(sys.argv) < 2:
    print("Usage: python scripts/push.py \"commit message\"")
    sys.exit(1)

message = sys.argv[1]
subprocess.run(["git", "add", "."], check=True)
subprocess.run(["git", "commit", "-m", message], check=True)
