import subprocess
import sys

if len(sys.argv) < 2:
    print("Usage: python scripts/push.py \"commit message\"")
    sys.exit(1)

message = sys.argv[1]
subprocess.run(["git", "add", "."], check=True)
subprocess.run(["git", "commit", "-m", message], check=True)
result = subprocess.run(["git", "push"], capture_output=True)
if result.returncode != 0:
    branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True).stdout.strip()
    subprocess.run(["git", "push", "--set-upstream", "origin", branch], check=True)
