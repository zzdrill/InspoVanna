"""Generate favicon.ico and app icon files from Run_elephant.png.

Called automatically by run.bat / run.sh on first run.
Idempotent — skips generation if output files already exist.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(BASE_DIR, "resource", "Run_elephant.png")
ICO_OUTPUT = os.path.join(BASE_DIR, "resource", "favicon.ico")

ICO_SIZES = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def _crop_to_square(img):
    """Center-crop image to square."""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def generate_ico():
    """Generate multi-resolution favicon.ico from the source logo."""
    if not os.path.isfile(SOURCE):
        print(f"[WARN] Source image not found: {SOURCE}")
        return False

    if os.path.exists(ICO_OUTPUT):
        return True  # Already generated

    try:
        from PIL import Image
    except ImportError:
        print("[WARN] Pillow not installed, skipping icon generation.")
        print("       Run: pip install Pillow")
        return False

    img = Image.open(SOURCE).convert("RGBA")
    img = _crop_to_square(img)

    # Pillow's ICO format accepts 'sizes' to embed multiple resolutions
    img.save(
        ICO_OUTPUT,
        format="ICO",
        sizes=ICO_SIZES,
    )
    print(f"[ICON] Generated {ICO_OUTPUT}")
    return True


def generate_iconset():
    """Generate AppIcon.iconset/ folder for macOS iconutil.

    Returns the iconset directory path, or None on failure.
    """
    iconset_dir = os.path.join(BASE_DIR, "resource", "AppIcon.iconset")
    if os.path.isdir(iconset_dir):
        return iconset_dir  # Already generated

    if not os.path.isfile(SOURCE):
        print(f"[WARN] Source image not found: {SOURCE}")
        return None

    try:
        from PIL import Image
    except ImportError:
        print("[WARN] Pillow not installed, skipping iconset generation.")
        return None

    img = Image.open(SOURCE).convert("RGBA")
    img = _crop_to_square(img)

    # iconutil requires specific naming convention
    icon_sizes = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }

    os.makedirs(iconset_dir, exist_ok=True)
    for name, size in icon_sizes.items():
        resized = img.resize((size, size), Image.LANCZOS)
        resized.save(os.path.join(iconset_dir, name))

    print(f"[ICON] Generated {iconset_dir}")
    return iconset_dir


if __name__ == "__main__":
    ok = generate_ico()
    if not ok:
        sys.exit(1)
    if sys.platform == "darwin":
        generate_iconset()
