"""Generate a simple app icon for PDF Editor."""

import shutil
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


FONT_PATH = "/System/Library/Fonts/Supplemental/Arial.ttf"


def create_icon():
    # Generate all icons at 1024 then downscale for quality
    iconset_dir = Path("app_icon.iconset")
    iconset_dir.mkdir(exist_ok=True)

    base_size = 1024
    img = Image.new("RGBA", (base_size, base_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rect background
    margin = 40
    draw.rounded_rectangle(
        [margin, margin, base_size - margin, base_size - margin],
        radius=180, fill="#1e3a5f",
    )

    # "PDF" text
    font_big = ImageFont.truetype(FONT_PATH, 320)
    bbox = draw.textbbox((0, 0), "PDF", font=font_big)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((base_size - tw) // 2, (base_size - th) // 2 - 100),
        "PDF", fill="white", font=font_big,
    )

    # "Editor" subtext
    font_small = ImageFont.truetype(FONT_PATH, 160)
    bbox2 = draw.textbbox((0, 0), "Editor", font=font_small)
    sw2 = bbox2[2] - bbox2[0]
    draw.text(
        ((base_size - sw2) // 2, (base_size - th) // 2 - 100 + th + 30),
        "Editor", fill="#8ab4f8", font=font_small,
    )

    # Save all required sizes
    needed = {16: "16x16", 32: "16x16@2x", 32: "32x32", 64: "32x32@2x",
              128: "128x128", 256: "128x128@2x", 256: "256x256",
              512: "256x256@2x", 512: "512x512", 1024: "512x512@2x"}

    # Use explicit list to avoid duplicate key issues
    pairs = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]

    for size, filename in pairs:
        resized = img.resize((size, size), Image.LANCZOS)
        resized.save(iconset_dir / filename)

    # Convert to .icns
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset_dir), "-o", "app_icon.icns"],
        check=True,
    )
    print("Created app_icon.icns")
    shutil.rmtree(iconset_dir)


if __name__ == "__main__":
    create_icon()
