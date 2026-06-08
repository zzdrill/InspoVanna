"""Create a DreamHub.app bundle on macOS with custom icon.

Generates a proper .app bundle that can be double-clicked in Finder,
placed in the Dock, or moved to /Applications.
Called automatically by run.sh on first run.
"""
import os
import sys
import plistlib
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)  # parent of src/


def create_app_bundle():
    """Create DreamHub.app with icon and launcher script."""
    if sys.platform != "darwin":
        print("[INFO] .app bundle creation is macOS-only.")
        return False

    app_dir = os.path.join(PROJECT_ROOT, "DreamHub.app")
    if os.path.exists(app_dir):
        return True  # Already exists

    contents_dir = os.path.join(app_dir, "Contents")
    resources_dir = os.path.join(contents_dir, "Resources")
    macos_dir = os.path.join(contents_dir, "MacOS")

    os.makedirs(resources_dir, exist_ok=True)
    os.makedirs(macos_dir, exist_ok=True)

    # --- Info.plist ---
    plist = {
        "CFBundleName": "DreamHub",
        "CFBundleDisplayName": "DreamHub",
        "CFBundleIdentifier": "com.dreamhub.app",
        "CFBundleVersion": "1.0.0",
        "CFBundleShortVersionString": "1.0.0",
        "CFBundlePackageType": "APPL",
        "CFBundleIconFile": "AppIcon",
        "CFBundleExecutable": "launch.sh",
        "CFBundleInfoDictionaryVersion": "6.0",
    }
    with open(os.path.join(contents_dir, "Info.plist"), "wb") as f:
        plistlib.dump(plist, f)

    # --- Launcher script ---
    launch_script = os.path.join(macos_dir, "launch.sh")
    run_sh = os.path.join(PROJECT_ROOT, "run.sh")
    with open(launch_script, "w") as f:
        f.write(f"#!/bin/bash\ncd \"{PROJECT_ROOT}\"\n\"{run_sh}\"\n")
    os.chmod(launch_script, 0o755)

    # --- Generate icon ---
    _generate_icns(resources_dir)

    print(f"[OK] App bundle created: {app_dir}")
    print("     You can drag it to /Applications or the Dock.")
    print("     First launch: right-click → Open (to bypass Gatekeeper).")
    return True


def _generate_icns(resources_dir):
    """Generate AppIcon.icns from Run_elephant.png using iconutil."""
    # Use setup_icon to generate the iconset folder
    from setup_icon import generate_iconset

    iconset_dir = generate_iconset()
    if not iconset_dir:
        print("[WARN] Could not generate iconset, skipping .icns creation.")
        return

    icns_path = os.path.join(resources_dir, "AppIcon.icns")
    try:
        subprocess.run(
            ["iconutil", "-c", "icns", "-o", icns_path, iconset_dir],
            check=True,
            capture_output=True,
        )
        print(f"[ICON] Generated {icns_path}")
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"[WARN] iconutil failed: {e}")
        print("       The .app will work but without a custom icon.")


if __name__ == "__main__":
    ok = create_app_bundle()
    if not ok:
        sys.exit(1)
