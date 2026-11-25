"""py2app build script for PDF Editor."""

from setuptools import setup

APP = ["pdf_overlay_editor_v3.py"]
APP_NAME = "PDF Editor"

OPTIONS = {
    "argv_emulation": False,
    "iconfile": "app_icon.icns",
    "plist": {
        "CFBundleName": APP_NAME,
        "CFBundleDisplayName": APP_NAME,
        "CFBundleIdentifier": "com.pdfeditor.overlay",
        "CFBundleVersion": "3.0.0",
        "CFBundleShortVersionString": "3.0",
        "LSMinimumSystemVersion": "11.0",
        "NSHighResolutionCapable": True,
        "CFBundleDocumentTypes": [
            {
                "CFBundleTypeName": "PDF Document",
                "CFBundleTypeRole": "Editor",
                "LSItemContentTypes": ["com.adobe.pdf"],
                "CFBundleTypeExtensions": ["pdf"],
            }
        ],
    },
    "packages": ["fitz", "PIL"],
    "includes": ["tkinter", "tkinter.ttk", "tkinter.filedialog", "tkinter.messagebox"],
}

setup(
    name=APP_NAME,
    app=APP,
    options={"py2app": OPTIONS},
    setup_requires=["py2app"],
)
