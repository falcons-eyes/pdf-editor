#!/bin/bash
set -euo pipefail

APP_NAME="PDF Editor"
DMG_NAME="PDF_Editor"
VERSION="3.1"
BUNDLE_ID="com.pdfeditor.overlay"
VENV=".venv-build"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== PDF Editor Build Script ==="

# Build in an isolated venv so nothing from a global/conda env (torch, scipy,
# pandas…) gets bundled. Needs a Python that ships Tk (python.org installer).
# Override with: PYTHON=/path/to/python3 ./build.sh
find_python() {
    for p in "${PYTHON:-}" /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3 python3; do
        [ -n "$p" ] && command -v "$p" >/dev/null 2>&1 || continue
        if "$p" -c "import tkinter" >/dev/null 2>&1; then echo "$p"; return; fi
    done
    echo "ERROR: no Python 3 with tkinter found. Install it from python.org or set PYTHON=..." >&2
    exit 1
}

# Step 1: Build environment
echo "[1/5] Preparing build venv (${VENV})..."
if [ ! -x "${VENV}/bin/python" ]; then
    BASE_PY="$(find_python)"
    echo "    using ${BASE_PY}"
    "${BASE_PY}" -m venv "${VENV}"
fi
PY="${VENV}/bin/python"
"${PY}" -m pip install -q --upgrade pip
"${PY}" -m pip install -q -r requirements.txt

# Step 2: Generate icon
echo "[2/5] Generating app icon..."
"${PY}" create_icon.py

# Step 3: Clean previous builds
echo "[3/5] Cleaning previous builds..."
rm -rf build dist "${DMG_NAME}.dmg"

# Step 4: Build .app with PyInstaller
echo "[4/5] Building .app bundle with PyInstaller..."
"${PY}" -m PyInstaller \
    --name "${APP_NAME}" \
    --windowed \
    --icon app_icon.icns \
    --onedir \
    --noconfirm \
    --clean \
    --collect-all pymupdf \
    --collect-all tkinterdnd2 \
    --osx-bundle-identifier "${BUNDLE_ID}" \
    pdf_overlay_editor_v3.py 2>&1 | tail -5

if [ ! -d "dist/${APP_NAME}.app" ]; then
    echo "ERROR: .app bundle was not created!"
    exit 1
fi

# Patch Info.plist ("Set" if the key exists, otherwise "Add")
PLIST="dist/${APP_NAME}.app/Contents/Info.plist"
plist_set() {
    /usr/libexec/PlistBuddy -c "Set :$1 $3" "$PLIST" 2>/dev/null \
        || /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$PLIST"
}
plist_set NSHighResolutionCapable bool true
plist_set CFBundleShortVersionString string "${VERSION}"
plist_set CFBundleVersion string "${VERSION}"
plist_set LSMinimumSystemVersion string 11.0

# Register as a PDF editor so Finder "Open With…" lists the app
/usr/libexec/PlistBuddy -c "Delete :CFBundleDocumentTypes" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy \
    -c "Add :CFBundleDocumentTypes array" \
    -c "Add :CFBundleDocumentTypes:0 dict" \
    -c "Add :CFBundleDocumentTypes:0:CFBundleTypeName string 'PDF Document'" \
    -c "Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Editor" \
    -c "Add :CFBundleDocumentTypes:0:LSHandlerRank string Alternate" \
    -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes array" \
    -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string com.adobe.pdf" \
    "$PLIST"

# Info.plist changed after PyInstaller signed the bundle: re-sign (ad-hoc)
codesign --force --deep --sign - "dist/${APP_NAME}.app" 2>&1 | tail -2

echo "    .app bundle created: dist/${APP_NAME}.app ($(du -sh "dist/${APP_NAME}.app" | cut -f1))"

# Step 5: Create DMG with Applications symlink
echo "[5/5] Creating DMG..."

DMG_FINAL="${DMG_NAME}.dmg"
STAGING="dist/dmg_staging"
rm -rf "${STAGING}"
mkdir -p "${STAGING}"
cp -R "dist/${APP_NAME}.app" "${STAGING}/"
ln -s /Applications "${STAGING}/Applications"

hdiutil create \
    -volname "${APP_NAME}" \
    -srcfolder "${STAGING}" \
    -ov \
    -format UDZO \
    "${DMG_FINAL}"

rm -rf "${STAGING}"

FINAL_SIZE=$(du -sh "${DMG_FINAL}" | cut -f1)

echo ""
echo "=== Build Complete ==="
echo "  App:  dist/${APP_NAME}.app"
echo "  DMG:  ${DMG_FINAL}  (${FINAL_SIZE})"
echo ""
echo "To install: Open ${DMG_FINAL} and drag '${APP_NAME}' to Applications."
