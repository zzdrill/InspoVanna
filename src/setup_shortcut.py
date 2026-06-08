"""Create a InspoVanna desktop shortcut with custom icon (Windows).

Uses PowerShell's WScript.Shell COM to create a .lnk shortcut —
no extra Python dependencies required.
Called automatically by run.bat on first run.
"""
import os
import sys
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)  # parent of src/


def create_shortcut():
    """Create a desktop shortcut pointing to run.bat with the custom icon."""
    if sys.platform != "win32":
        print("[INFO] Shortcut creation is Windows-only.")
        return False

    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    shortcut_path = os.path.join(desktop, "InspoVanna.lnk")

    if os.path.exists(shortcut_path):
        return True  # Already exists

    ico_path = os.path.join(BASE_DIR, "resource", "favicon.ico")
    bat_path = os.path.join(PROJECT_ROOT, "run.bat")

    if not os.path.isfile(ico_path):
        print(f"[WARN] Icon file not found: {ico_path}")
        return False

    # Use PowerShell to create the shortcut (no extra Python deps needed)
    ps_script = f'''
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut("{shortcut_path}")
$sc.TargetPath = "{bat_path}"
$sc.WorkingDirectory = "{PROJECT_ROOT}"
$sc.IconLocation = "{ico_path},0"
$sc.Description = "InspoVanna - AI创意工作室"
$sc.Save()
'''

    result = subprocess.run(
        ["powershell", "-Command", ps_script],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        print(f"[OK] Desktop shortcut created: {shortcut_path}")
        return True
    else:
        print(f"[WARN] Could not create shortcut: {result.stderr.strip()}")
        return False


if __name__ == "__main__":
    ok = create_shortcut()
    if not ok:
        sys.exit(1)
