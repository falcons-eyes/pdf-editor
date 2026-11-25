#!/usr/bin/env python3
"""PDF Overlay Editor v3 — A polished macOS PDF viewer & image overlay editor."""

import io
import json
import os
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pymupdf as fitz  # PyMuPDF (the bare "fitz" name is deprecated)
from PIL import Image, ImageTk

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD

    HAS_DND = True
except ImportError:
    HAS_DND = False

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
HANDLE_SIZE = 8
MIN_OVERLAY_SIZE = 8.0
THUMB_WIDTH = 130
MAX_UNDO = 60
MAX_RECENT = 10
CONFIG_DIR = Path.home() / ".pdf_overlay_editor"
CONFIG_FILE = CONFIG_DIR / "config.json"
DEFAULT_GEOMETRY = "1360x920"

LIGHT = {
    "canvas_bg": "#e8e8e8",
    "sidebar_bg": "#f0f0f0",
    "thumb_border": "#cccccc",
    "thumb_active": "#2563eb",
    "selection": "#2563eb",
    "handle_fill": "#2563eb",
    "handle_outline": "#ffffff",
    "panel_bg": "#f5f5f5",
    "status_bg": "#e0e0e0",
    "status_fg": "#333333",
    "sep": "#d0d0d0",
}

DARK = {
    "canvas_bg": "#2d2d2d",
    "sidebar_bg": "#1e1e1e",
    "thumb_border": "#444444",
    "thumb_active": "#5b9aff",
    "selection": "#5b9aff",
    "handle_fill": "#5b9aff",
    "handle_outline": "#1e1e1e",
    "panel_bg": "#252525",
    "status_bg": "#1a1a1a",
    "status_fg": "#cccccc",
    "sep": "#404040",
}


def _detect_dark_mode() -> bool:
    try:
        import subprocess
        r = subprocess.run(
            ["defaults", "read", "-g", "AppleInterfaceStyle"],
            capture_output=True, text=True,
        )
        return "dark" in r.stdout.lower()
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------
@dataclass
class Overlay:
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    path: str = ""
    x: float = 60.0
    y: float = 60.0
    width: float = 160.0
    height: float = 80.0
    opacity: float = 1.0
    rotation: int = 0  # 0, 90, 180, 270

    def snapshot(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_snapshot(d: dict) -> "Overlay":
        return Overlay(**d)


@dataclass
class Action:
    kind: str  # add, delete, move, resize, property
    page_index: int
    overlay_id: str
    before: Optional[dict]
    after: Optional[dict]


# ---------------------------------------------------------------------------
# Config Manager
# ---------------------------------------------------------------------------
class ConfigManager:
    def __init__(self):
        self.recent_files: List[str] = []
        self.geometry: str = DEFAULT_GEOMETRY
        self.sidebar_visible: bool = True
        self.right_panel_visible: bool = True
        self.last_zoom: float = 1.2
        self._load()

    def _load(self):
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text())
                self.recent_files = data.get("recent_files", [])[:MAX_RECENT]
                self.geometry = data.get("geometry", DEFAULT_GEOMETRY)
                self.sidebar_visible = data.get("sidebar_visible", True)
                self.right_panel_visible = data.get("right_panel_visible", True)
                self.last_zoom = data.get("last_zoom", 1.2)
            except Exception:
                pass

    def save(self):
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        data = {
            "recent_files": self.recent_files[:MAX_RECENT],
            "geometry": self.geometry,
            "sidebar_visible": self.sidebar_visible,
            "right_panel_visible": self.right_panel_visible,
            "last_zoom": self.last_zoom,
        }
        CONFIG_FILE.write_text(json.dumps(data, indent=2))

    def add_recent(self, path: str):
        path = os.path.abspath(path)
        if path in self.recent_files:
            self.recent_files.remove(path)
        self.recent_files.insert(0, path)
        self.recent_files = self.recent_files[:MAX_RECENT]
        self.save()


# ---------------------------------------------------------------------------
# Undo Manager
# ---------------------------------------------------------------------------
class UndoManager:
    def __init__(self):
        self._stack: List[Action] = []
        self._redo: List[Action] = []

    def push(self, action: Action):
        self._stack.append(action)
        if len(self._stack) > MAX_UNDO:
            self._stack.pop(0)
        self._redo.clear()

    def undo(self) -> Optional[Action]:
        if not self._stack:
            return None
        action = self._stack.pop()
        self._redo.append(action)
        return action

    def redo(self) -> Optional[Action]:
        if not self._redo:
            return None
        action = self._redo.pop()
        self._stack.append(action)
        return action

    @property
    def can_undo(self) -> bool:
        return len(self._stack) > 0

    @property
    def can_redo(self) -> bool:
        return len(self._redo) > 0

    def clear(self):
        self._stack.clear()
        self._redo.clear()


# ---------------------------------------------------------------------------
# Thumbnail Sidebar
# ---------------------------------------------------------------------------
class ThumbnailSidebar(tk.Frame):
    def __init__(self, parent, colors: dict, on_page_select=None):
        super().__init__(parent, bg=colors["sidebar_bg"])
        self.colors = colors
        self.on_page_select = on_page_select
        self.thumbnails: List[ImageTk.PhotoImage] = []
        self.page_count = 0
        self.current_page = 0

        title = tk.Label(
            self, text="Pages", font=("Helvetica", 12, "bold"),
            bg=colors["sidebar_bg"], fg=colors["status_fg"],
        )
        title.pack(pady=(8, 4))

        container = tk.Frame(self, bg=colors["sidebar_bg"])
        container.pack(fill=tk.BOTH, expand=True)

        self.canvas = tk.Canvas(
            container, bg=colors["sidebar_bg"], highlightthickness=0,
            width=THUMB_WIDTH + 20,
        )
        self.scrollbar = ttk.Scrollbar(container, orient=tk.VERTICAL, command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.inner = tk.Frame(self.canvas, bg=colors["sidebar_bg"])
        self.canvas_window = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.inner.bind("<Configure>", self._on_inner_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)
        self.canvas.bind("<MouseWheel>", self._on_mousewheel)

    def _on_inner_configure(self, _event):
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _on_canvas_configure(self, event):
        self.canvas.itemconfig(self.canvas_window, width=event.width)

    def _on_mousewheel(self, event):
        self.canvas.yview_scroll(int(-1 * event.delta), "units")

    def refresh(self, doc: fitz.Document):
        for w in self.inner.winfo_children():
            w.destroy()
        self.thumbnails.clear()
        self.page_count = len(doc)
        self.current_page = 0

        zoom = THUMB_WIDTH / max(doc[0].rect.width, 1) if self.page_count > 0 else 0.15
        for i in range(self.page_count):
            page = doc.load_page(i)
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            photo = ImageTk.PhotoImage(img)
            self.thumbnails.append(photo)

            frame = tk.Frame(self.inner, bg=self.colors["sidebar_bg"], padx=4, pady=3)
            frame.pack(fill=tk.X)

            lbl_img = tk.Label(
                frame, image=photo, bd=2, relief="solid",
                highlightthickness=0, bg=self.colors["thumb_border"],
            )
            lbl_img.pack()
            lbl_num = tk.Label(
                frame, text=str(i + 1), bg=self.colors["sidebar_bg"],
                fg=self.colors["status_fg"], font=("Helvetica", 10),
            )
            lbl_num.pack()

            for widget in (frame, lbl_img, lbl_num):
                widget.bind("<Button-1>", lambda e, idx=i: self._select(idx))

    def _select(self, idx: int):
        self.select_page(idx)
        if self.on_page_select:
            self.on_page_select(idx)

    def select_page(self, idx: int):
        self.current_page = idx
        for i, frame in enumerate(self.inner.winfo_children()):
            children = frame.winfo_children()
            if children:
                color = self.colors["thumb_active"] if i == idx else self.colors["thumb_border"]
                children[0].configure(bg=color)


# ---------------------------------------------------------------------------
# Overlay List Panel
# ---------------------------------------------------------------------------
class OverlayListPanel(tk.Frame):
    def __init__(self, parent, colors: dict, on_select=None, on_delete=None):
        super().__init__(parent, bg=colors["panel_bg"])
        self.colors = colors
        self.on_select = on_select
        self.on_delete = on_delete

        header = tk.Frame(self, bg=colors["panel_bg"])
        header.pack(fill=tk.X, padx=6, pady=(6, 2))
        tk.Label(
            header, text="Overlays", font=("Helvetica", 11, "bold"),
            bg=colors["panel_bg"], fg=colors["status_fg"],
        ).pack(side=tk.LEFT)

        self.tree = ttk.Treeview(self, columns=("name",), show="tree", height=6, selectmode="browse")
        self.tree.column("#0", width=0, stretch=False)
        self.tree.column("name", width=180)
        self.tree.pack(fill=tk.BOTH, expand=True, padx=6, pady=4)
        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        btn_frame = tk.Frame(self, bg=colors["panel_bg"])
        btn_frame.pack(fill=tk.X, padx=6, pady=(0, 6))
        ttk.Button(btn_frame, text="Delete", width=8, command=self._on_delete).pack(side=tk.RIGHT)

    def _on_tree_select(self, _event):
        sel = self.tree.selection()
        if sel and self.on_select:
            self.on_select(sel[0])

    def _on_delete(self):
        sel = self.tree.selection()
        if sel and self.on_delete:
            self.on_delete(sel[0])

    def refresh(self, overlays: List[Overlay], selected_id: Optional[str] = None):
        self.tree.delete(*self.tree.get_children())
        for ov in overlays:
            name = os.path.basename(ov.path)[:25]
            self.tree.insert("", "end", iid=ov.id, values=(name,))
        if selected_id and self.tree.exists(selected_id):
            self.tree.selection_set(selected_id)


# ---------------------------------------------------------------------------
# Overlay Properties Panel
# ---------------------------------------------------------------------------
class OverlayPropertiesPanel(tk.Frame):
    def __init__(self, parent, colors: dict, on_change=None):
        super().__init__(parent, bg=colors["panel_bg"])
        self.colors = colors
        self.on_change = on_change
        self._overlay: Optional[Overlay] = None
        self._original_pil: Optional[Image.Image] = None
        self._updating = False

        header = tk.Frame(self, bg=colors["panel_bg"])
        header.pack(fill=tk.X, padx=6, pady=(6, 2))
        tk.Label(
            header, text="Properties", font=("Helvetica", 11, "bold"),
            bg=colors["panel_bg"], fg=colors["status_fg"],
        ).pack(side=tk.LEFT)

        grid = tk.Frame(self, bg=colors["panel_bg"])
        grid.pack(fill=tk.X, padx=6, pady=4)

        self.entries: Dict[str, Any] = {}
        for row, (label, key) in enumerate([("X:", "x"), ("Y:", "y"), ("W:", "width"), ("H:", "height")]):
            tk.Label(
                grid, text=label, bg=colors["panel_bg"], fg=colors["status_fg"],
                width=3, anchor="e",
            ).grid(row=row, column=0, padx=(0, 4), pady=1)
            var = tk.StringVar()
            entry = ttk.Entry(grid, textvariable=var, width=8)
            entry.grid(row=row, column=1, pady=1, sticky="w")
            entry.bind("<Return>", lambda e, k=key: self._apply_field(k))
            entry.bind("<FocusOut>", lambda e, k=key: self._apply_field(k))
            self.entries[key] = entry
            self.entries[key + "_var"] = var

        sep = tk.Frame(self, bg=colors["sep"], height=1)
        sep.pack(fill=tk.X, padx=6, pady=6)

        # Opacity
        opacity_frame = tk.Frame(self, bg=colors["panel_bg"])
        opacity_frame.pack(fill=tk.X, padx=6, pady=2)
        tk.Label(opacity_frame, text="Opacity:", bg=colors["panel_bg"],
                 fg=colors["status_fg"]).pack(side=tk.LEFT)
        self.opacity_var = tk.DoubleVar(value=100.0)
        self.opacity_label = tk.Label(
            opacity_frame, text="100%", bg=colors["panel_bg"],
            fg=colors["status_fg"], width=5, anchor="e",
        )
        self.opacity_label.pack(side=tk.RIGHT)
        self.opacity_scale = ttk.Scale(
            opacity_frame, from_=0, to=100, orient=tk.HORIZONTAL,
            variable=self.opacity_var, command=self._on_opacity,
        )
        self.opacity_scale.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(4, 4))
        self.opacity_scale.bind("<ButtonRelease-1>", lambda e: self._commit("opacity"))

        # Rotation
        rot_frame = tk.Frame(self, bg=colors["panel_bg"])
        rot_frame.pack(fill=tk.X, padx=6, pady=2)
        tk.Label(rot_frame, text="Rotation:", bg=colors["panel_bg"],
                 fg=colors["status_fg"]).pack(side=tk.LEFT)
        self.rotation_var = tk.StringVar(value="0°")
        self.rotation_combo = ttk.Combobox(
            rot_frame, textvariable=self.rotation_var,
            values=["0°", "90°", "180°", "270°"], state="readonly", width=6,
        )
        self.rotation_combo.pack(side=tk.LEFT, padx=(4, 0))
        self.rotation_combo.bind("<<ComboboxSelected>>", self._on_rotation)

        # Scale slider
        size_frame = tk.Frame(self, bg=colors["panel_bg"])
        size_frame.pack(fill=tk.X, padx=6, pady=(6, 2))
        tk.Label(size_frame, text="Scale:", bg=colors["panel_bg"],
                 fg=colors["status_fg"]).pack(side=tk.LEFT)
        self.size_var = tk.DoubleVar(value=100.0)
        self.size_label = tk.Label(
            size_frame, text="100%", bg=colors["panel_bg"],
            fg=colors["status_fg"], width=5, anchor="e",
        )
        self.size_label.pack(side=tk.RIGHT)
        self.size_scale = ttk.Scale(
            size_frame, from_=1, to=300, orient=tk.HORIZONTAL,
            variable=self.size_var, command=self._on_size_slider,
        )
        self.size_scale.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(4, 4))
        self.size_scale.bind("<ButtonRelease-1>", lambda e: self._commit("size"))

        self.set_overlay(None)

    def _commit(self, change_type: str):
        """Slider released: let the app record one undo step for the whole drag."""
        if self._updating or self._overlay is None or not self.on_change:
            return
        self.on_change(change_type, None, True)

    def set_overlay(self, overlay: Optional[Overlay], original_pil: Optional[Image.Image] = None):
        self._overlay = overlay
        self._original_pil = original_pil
        self._updating = True
        state = "normal" if overlay else "disabled"

        for key in ("x", "y", "width", "height"):
            var = self.entries[key + "_var"]
            entry = self.entries[key]
            if overlay:
                var.set(f"{getattr(overlay, key):.1f}")
            else:
                var.set("")
            entry.configure(state=state)

        if overlay:
            self.opacity_var.set(overlay.opacity * 100)
            self.opacity_label.configure(text=f"{int(overlay.opacity * 100)}%")
            self.rotation_var.set(f"{overlay.rotation}°")
            if original_pil and original_pil.width > 0:
                pct = (overlay.width / original_pil.width) * 100
                self.size_var.set(pct)
                self.size_label.configure(text=f"{int(pct)}%")
        else:
            self.opacity_var.set(100)
            self.opacity_label.configure(text="100%")
            self.rotation_var.set("0°")
            self.size_var.set(100)
            self.size_label.configure(text="100%")

        self.opacity_scale.configure(state=state)
        self.size_scale.configure(state=state)
        self.rotation_combo.configure(state="readonly" if overlay else "disabled")
        self._updating = False

    def _apply_field(self, key: str):
        if self._updating or self._overlay is None:
            return
        var = self.entries[key + "_var"]
        try:
            val = float(var.get())
            val = max(MIN_OVERLAY_SIZE if key in ("width", "height") else 0, val)
            setattr(self._overlay, key, val)
            if self.on_change:
                self.on_change("field", key, True)
        except ValueError:
            pass

    def _on_opacity(self, _val):
        if self._updating or self._overlay is None:
            return
        val = self.opacity_var.get() / 100.0
        self.opacity_label.configure(text=f"{int(val * 100)}%")
        self._overlay.opacity = round(val, 2)
        if self.on_change:
            self.on_change("opacity", None, False)

    def _on_rotation(self, _event):
        if self._updating or self._overlay is None:
            return
        deg = int(self.rotation_var.get().replace("°", ""))
        self._overlay.rotation = deg
        if self.on_change:
            self.on_change("rotation", None, True)

    def _on_size_slider(self, _val):
        if self._updating or self._overlay is None or self._original_pil is None:
            return
        pct = self.size_var.get()
        self.size_label.configure(text=f"{int(pct)}%")
        orig_w = max(self._original_pil.width, 1)
        orig_h = max(self._original_pil.height, 1)
        self._overlay.width = max(MIN_OVERLAY_SIZE, (orig_w * pct) / 100.0)
        self._overlay.height = max(MIN_OVERLAY_SIZE, (orig_h * pct) / 100.0)
        if self.on_change:
            self.on_change("size", None, False)


# ---------------------------------------------------------------------------
# Status Bar
# ---------------------------------------------------------------------------
class StatusBar(tk.Frame):
    def __init__(self, parent, colors: dict):
        super().__init__(parent, bg=colors["status_bg"], height=24)
        self.colors = colors
        self.pack_propagate(False)

        self.left_var = tk.StringVar(value="No document")
        self.center_var = tk.StringVar(value="")
        self.right_var = tk.StringVar(value="")

        tk.Label(
            self, textvariable=self.left_var, bg=colors["status_bg"],
            fg=colors["status_fg"], anchor="w", padx=10, font=("Helvetica", 11),
        ).pack(side=tk.LEFT, fill=tk.X, expand=True)
        tk.Label(
            self, textvariable=self.center_var, bg=colors["status_bg"],
            fg=colors["status_fg"], anchor="center", padx=10, font=("Helvetica", 11),
        ).pack(side=tk.LEFT)
        tk.Label(
            self, textvariable=self.right_var, bg=colors["status_bg"],
            fg=colors["status_fg"], anchor="e", padx=10, font=("Helvetica", 11),
        ).pack(side=tk.RIGHT)


# ---------------------------------------------------------------------------
# Main Application
# ---------------------------------------------------------------------------
class PdfOverlayEditorV3:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.config = ConfigManager()
        self.undo_mgr = UndoManager()
        self.colors = DARK if _detect_dark_mode() else LIGHT

        # State
        self.doc: Optional[fitz.Document] = None
        self.pdf_path: Optional[str] = None
        self.page_index = 0
        self.zoom = self.config.last_zoom
        self.fit_mode: Optional[str] = None  # "width", "page", or None

        self.overlays_by_page: Dict[int, List[Overlay]] = {}
        self.selected_overlay_id: Optional[str] = None
        self.overlay_images: Dict[str, Image.Image] = {}  # path -> PIL

        # Canvas draw state
        self.page_photo = None
        self.canvas_image_id = None
        self.overlay_draw_cache: Dict[str, Tuple[Any, int]] = {}
        self.selection_rect_id = None
        self.handle_ids: Dict[str, int] = {}

        # Drag state
        self.dragging = False
        self.resizing = False
        self._resize_handle = "br"
        self._resize_anchor_right = 0.0
        self._resize_anchor_bottom = 0.0
        self.drag_offset_x = 0.0
        self.drag_offset_y = 0.0
        self._pre_drag_snapshot: Optional[dict] = None
        # Snapshot of the selected overlay before property-panel edits (for undo)
        self._prop_before: Optional[dict] = None

        self._setup_window()
        self._setup_menu()
        self._build_ui()
        self._bind_shortcuts()
        self._setup_dnd()

    # ---- Window ----
    def _setup_window(self):
        self.root.title("PDF Editor")
        self.root.minsize(800, 600)
        style = ttk.Style()
        try:
            style.theme_use("aqua")
        except Exception:
            style.theme_use("clam")

        # Always center on screen on launch
        self.root.geometry(DEFAULT_GEOMETRY)
        self._center_window()

        self.root.protocol("WM_DELETE_WINDOW", self._on_quit)
        try:
            self.root.createcommand("tk::mac::Quit", self._on_quit)
            # Finder "Open With…" / drop on the Dock icon
            self.root.createcommand("::tk::mac::OpenDocument", self._on_open_documents)
        except Exception:
            pass

    def _on_open_documents(self, *paths):
        for path in paths:
            self._open_dropped_path(path)

    def _center_window(self):
        self.root.update_idletasks()
        # Parse the size from DEFAULT_GEOMETRY
        w, h = DEFAULT_GEOMETRY.split("x")
        w, h = int(w), int(h)
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - w) // 2
        y = (sh - h) // 2
        self.root.geometry(f"{w}x{h}+{x}+{y}")

    def _on_quit(self):
        self.config.geometry = self.root.geometry()
        self.config.last_zoom = self.zoom
        self.config.save()
        self.root.destroy()

    # ---- Menu ----
    def _setup_menu(self):
        menubar = tk.Menu(self.root)

        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="Open PDF…", accelerator="⌘O", command=self.open_pdf)
        file_menu.add_command(label="Add Overlay Image…", accelerator="⌘⇧O", command=self.open_overlay_image)
        file_menu.add_separator()
        self.recent_menu = tk.Menu(file_menu, tearoff=0)
        file_menu.add_cascade(label="Open Recent", menu=self.recent_menu)
        self._rebuild_recent_menu()
        file_menu.add_separator()
        file_menu.add_command(label="Export PDF…", accelerator="⌘S", command=self.export_pdf)
        menubar.add_cascade(label="File", menu=file_menu)

        edit_menu = tk.Menu(menubar, tearoff=0)
        edit_menu.add_command(label="Undo", accelerator="⌘Z", command=self.do_undo)
        edit_menu.add_command(label="Redo", accelerator="⌘⇧Z", command=self.do_redo)
        edit_menu.add_separator()
        edit_menu.add_command(label="Delete Overlay", accelerator="⌫", command=self.delete_selected_overlay)
        edit_menu.add_command(label="Duplicate to Next Page", accelerator="⌘D", command=self.duplicate_overlay)
        menubar.add_cascade(label="Edit", menu=edit_menu)

        view_menu = tk.Menu(menubar, tearoff=0)
        view_menu.add_command(label="Zoom In", accelerator="⌘+", command=lambda: self.change_zoom(0.15))
        view_menu.add_command(label="Zoom Out", accelerator="⌘-", command=lambda: self.change_zoom(-0.15))
        view_menu.add_command(label="Actual Size", accelerator="⌘1", command=self.zoom_actual)
        view_menu.add_command(label="Fit to Width", accelerator="⌘2", command=self.zoom_fit_width)
        view_menu.add_command(label="Fit to Page", accelerator="⌘3", command=self.zoom_fit_page)
        view_menu.add_separator()
        view_menu.add_command(label="Toggle Sidebar", accelerator="⌘\\", command=self.toggle_sidebar)
        view_menu.add_command(label="Toggle Properties", command=self.toggle_right_panel)
        menubar.add_cascade(label="View", menu=view_menu)

        self.root.config(menu=menubar)

    def _rebuild_recent_menu(self):
        self.recent_menu.delete(0, tk.END)
        for p in self.config.recent_files:
            name = os.path.basename(p)
            self.recent_menu.add_command(label=name, command=lambda path=p: self._open_pdf_path(path))
        if self.config.recent_files:
            self.recent_menu.add_separator()
            self.recent_menu.add_command(label="Clear Recent", command=self._clear_recent)

    def _clear_recent(self):
        self.config.recent_files.clear()
        self.config.save()
        self._rebuild_recent_menu()

    # ---- Build UI ----
    def _build_ui(self):
        # Toolbar
        self.toolbar = tk.Frame(self.root, bg=self.colors["panel_bg"], height=40)
        self.toolbar.pack(side=tk.TOP, fill=tk.X)
        self.toolbar.pack_propagate(False)
        self._build_toolbar()

        # Status bar
        self.statusbar = StatusBar(self.root, self.colors)
        self.statusbar.pack(side=tk.BOTTOM, fill=tk.X)

        # Main paned window
        self.main_pane = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        self.main_pane.pack(fill=tk.BOTH, expand=True)

        # Sidebar
        self.sidebar = ThumbnailSidebar(self.main_pane, self.colors, on_page_select=self._on_sidebar_page)
        if self.config.sidebar_visible:
            self.main_pane.add(self.sidebar, weight=0)

        # Center canvas
        center = tk.Frame(self.main_pane, bg=self.colors["canvas_bg"])
        self.main_pane.add(center, weight=1)

        self.canvas = tk.Canvas(center, bg=self.colors["canvas_bg"], highlightthickness=0)
        self.hbar = ttk.Scrollbar(center, orient=tk.HORIZONTAL, command=self.canvas.xview)
        self.vbar = ttk.Scrollbar(center, orient=tk.VERTICAL, command=self.canvas.yview)
        self.canvas.configure(xscrollcommand=self.hbar.set, yscrollcommand=self.vbar.set)
        self.vbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.hbar.pack(side=tk.BOTTOM, fill=tk.X)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # Right panel
        self.right_panel = tk.Frame(self.main_pane, bg=self.colors["panel_bg"], width=210)
        self.overlay_list = OverlayListPanel(
            self.right_panel, self.colors,
            on_select=self._on_overlay_list_select,
            on_delete=self._on_overlay_list_delete,
        )
        self.overlay_list.pack(fill=tk.X)

        sep = tk.Frame(self.right_panel, bg=self.colors["sep"], height=1)
        sep.pack(fill=tk.X, padx=4, pady=2)

        self.props_panel = OverlayPropertiesPanel(
            self.right_panel, self.colors, on_change=self._on_property_change,
        )
        self.props_panel.pack(fill=tk.BOTH, expand=True)

        if self.config.right_panel_visible:
            self.main_pane.add(self.right_panel, weight=0)

        # Canvas events
        self.canvas.bind("<ButtonPress-1>", self.on_mouse_down)
        self.canvas.bind("<B1-Motion>", self.on_mouse_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_mouse_up)
        self.canvas.bind("<MouseWheel>", self._on_mousewheel)
        self.canvas.bind("<Configure>", self._on_canvas_resize)

        self._show_welcome()

    def _build_toolbar(self):
        tb = self.toolbar
        pad = {"padx": 3, "pady": 4}

        ttk.Button(tb, text="Open PDF", command=self.open_pdf).pack(side=tk.LEFT, **pad)
        ttk.Button(tb, text="Add Image", command=self.open_overlay_image).pack(side=tk.LEFT, **pad)

        ttk.Separator(tb, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=6, pady=4)

        ttk.Button(tb, text="◀", width=3, command=self.prev_page).pack(side=tk.LEFT, **pad)
        self.page_var = tk.StringVar(value="0 / 0")
        self.page_entry = ttk.Entry(tb, textvariable=self.page_var, width=8, justify="center")
        self.page_entry.pack(side=tk.LEFT, **pad)
        self.page_entry.bind("<Return>", self._on_page_entry)
        ttk.Button(tb, text="▶", width=3, command=self.next_page).pack(side=tk.LEFT, **pad)

        ttk.Separator(tb, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=6, pady=4)

        ttk.Button(tb, text="−", width=3, command=lambda: self.change_zoom(-0.15)).pack(side=tk.LEFT, **pad)
        self.zoom_var = tk.StringVar(value=f"{int(self.zoom * 100)}%")
        tk.Label(
            tb, textvariable=self.zoom_var, bg=self.colors["panel_bg"],
            fg=self.colors["status_fg"], width=6, font=("Helvetica", 11),
        ).pack(side=tk.LEFT, **pad)
        ttk.Button(tb, text="+", width=3, command=lambda: self.change_zoom(0.15)).pack(side=tk.LEFT, **pad)

        ttk.Separator(tb, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=6, pady=4)

        ttk.Button(tb, text="Fit Width", command=self.zoom_fit_width).pack(side=tk.LEFT, **pad)
        ttk.Button(tb, text="Fit Page", command=self.zoom_fit_page).pack(side=tk.LEFT, **pad)

        ttk.Separator(tb, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=6, pady=4)

        ttk.Button(tb, text="Export PDF", command=self.export_pdf).pack(side=tk.LEFT, **pad)

    def _show_welcome(self):
        self.canvas.delete("all")
        cx, cy = 400, 300
        self.canvas.create_text(
            cx, cy - 20, text="PDF Editor",
            font=("Helvetica", 24, "bold"), fill=self.colors["status_fg"],
        )
        self.canvas.create_text(
            cx, cy + 20, text="Open a PDF to start  (⌘O)",
            font=("Helvetica", 14), fill=self.colors["status_fg"],
        )
        if HAS_DND:
            self.canvas.create_text(
                cx, cy + 50, text="or drop a PDF file here",
                font=("Helvetica", 12), fill="#888888",
            )

    # ---- Shortcuts ----
    def _bind_shortcuts(self):
        r = self.root
        r.bind("<Command-o>", lambda e: self.open_pdf())
        r.bind("<Command-Shift-O>", lambda e: self.open_overlay_image())
        r.bind("<Command-s>", lambda e: self.export_pdf())
        r.bind("<Command-z>", lambda e: self.do_undo())
        r.bind("<Command-Shift-Z>", lambda e: self.do_redo())
        r.bind("<Command-minus>", lambda e: self.change_zoom(-0.15))
        r.bind("<Command-equal>", lambda e: self.change_zoom(0.15))
        r.bind("<Command-plus>", lambda e: self.change_zoom(0.15))
        r.bind("<Command-Key-1>", lambda e: self.zoom_actual())
        r.bind("<Command-Key-2>", lambda e: self.zoom_fit_width())
        r.bind("<Command-Key-3>", lambda e: self.zoom_fit_page())
        r.bind("<Command-backslash>", lambda e: self.toggle_sidebar())
        r.bind("<Command-d>", lambda e: self.duplicate_overlay())
        r.bind("<Left>", lambda e: self._arrow_key("left", e))
        r.bind("<Right>", lambda e: self._arrow_key("right", e))
        r.bind("<Delete>", self._delete_key)
        r.bind("<BackSpace>", self._delete_key)

    @staticmethod
    def _is_text_input(widget) -> bool:
        return isinstance(widget, (ttk.Entry, tk.Entry))

    def _delete_key(self, event):
        # Backspace inside the X/Y/W/H or page fields edits text, not the overlay
        if self._is_text_input(event.widget):
            return
        self.delete_selected_overlay()

    def _arrow_key(self, direction: str, event):
        # Don't navigate pages when typing in an entry
        if self._is_text_input(event.widget):
            return
        if direction == "left":
            self.prev_page()
        else:
            self.next_page()

    # ---- DnD ----
    def _setup_dnd(self):
        if not HAS_DND:
            return
        try:
            self.canvas.drop_target_register(DND_FILES)
            self.canvas.dnd_bind("<<Drop>>", self._on_dnd_drop)
        except Exception:
            pass

    def _on_dnd_drop(self, event):
        # Tcl list: handles several files and paths with spaces ({/a b.pdf})
        paths = self.root.tk.splitlist(event.data)
        # Open a PDF first so images dropped together land on it
        paths = sorted(paths, key=lambda p: not p.lower().endswith(".pdf"))
        for path in paths:
            self._open_dropped_path(path)

    def _open_dropped_path(self, path: str):
        if not os.path.isfile(path):
            return
        ext = os.path.splitext(path)[1].lower()
        if ext == ".pdf":
            self._open_pdf_path(path)
        elif ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
            self._add_overlay_from_path(path)

    # ---- PDF ----
    def open_pdf(self):
        path = filedialog.askopenfilename(filetypes=[("PDF files", "*.pdf")])
        if path:
            self._open_pdf_path(path)

    def _open_pdf_path(self, path: str):
        if not os.path.isfile(path):
            messagebox.showerror("Error", f"File not found:\n{path}")
            return
        try:
            doc = fitz.open(path)
        except Exception as e:
            messagebox.showerror("Open PDF failed", str(e))
            return

        self.doc = doc
        self.pdf_path = path
        self.page_index = 0
        self.overlays_by_page.clear()
        self.overlay_images.clear()
        self.selected_overlay_id = None
        self.undo_mgr.clear()

        self.config.add_recent(path)
        self._rebuild_recent_menu()
        self.sidebar.refresh(doc)
        self.sidebar.select_page(0)
        self._update_page_var()
        self.statusbar.left_var.set(f"{os.path.basename(path)} — {len(doc)} pages")
        self.root.title(f"PDF Editor — {os.path.basename(path)}")
        self.render_page()

    # ---- Overlay ----
    def open_overlay_image(self):
        path = filedialog.askopenfilename(filetypes=[
            ("Image files", ("*.png", "*.jpg", "*.jpeg", "*.webp", "*.bmp")),
            ("All files", "*.*"),
        ])
        if path:
            self._add_overlay_from_path(path)

    def _add_overlay_from_path(self, path: str):
        page = self.current_page()
        if page is None:
            messagebox.showinfo("No PDF", "Open a PDF first.")
            return
        try:
            img = Image.open(path).convert("RGBA")
        except Exception as e:
            messagebox.showerror("Open image failed", str(e))
            return

        self.overlay_images[path] = img
        default_width = min(max(page.rect.width * 0.22, 80), page.rect.width * 0.75)
        ratio = img.height / img.width if img.width else 0.5
        ov = Overlay(path=path, x=60, y=60, width=default_width, height=default_width * ratio)

        if self.page_index not in self.overlays_by_page:
            self.overlays_by_page[self.page_index] = []
        self.overlays_by_page[self.page_index].append(ov)

        self.undo_mgr.push(Action("add", self.page_index, ov.id, None, ov.snapshot()))
        self.selected_overlay_id = ov.id
        self.render_page()
        self._refresh_panels()
        self.statusbar.center_var.set(f"Added: {os.path.basename(path)}")

    def delete_selected_overlay(self):
        ov = self._get_selected_overlay()
        if ov is None:
            return
        overlays = self.overlays_by_page.get(self.page_index, [])
        self.undo_mgr.push(Action("delete", self.page_index, ov.id, ov.snapshot(), None))
        overlays[:] = [o for o in overlays if o.id != ov.id]
        self.selected_overlay_id = None
        self.render_page()
        self._refresh_panels()

    def duplicate_overlay(self):
        ov = self._get_selected_overlay()
        if ov is None or self.doc is None:
            return
        next_page = self.page_index + 1
        if next_page >= len(self.doc):
            return
        new_ov = Overlay(
            path=ov.path, x=ov.x, y=ov.y, width=ov.width, height=ov.height,
            opacity=ov.opacity, rotation=ov.rotation,
        )
        if next_page not in self.overlays_by_page:
            self.overlays_by_page[next_page] = []
        self.overlays_by_page[next_page].append(new_ov)
        self.undo_mgr.push(Action("add", next_page, new_ov.id, None, new_ov.snapshot()))
        self.statusbar.center_var.set(f"Duplicated to page {next_page + 1}")

    # ---- Undo / Redo ----
    def do_undo(self):
        action = self.undo_mgr.undo()
        if action:
            self._apply_undo_redo(action, undo=True)

    def do_redo(self):
        action = self.undo_mgr.redo()
        if action:
            self._apply_undo_redo(action, undo=False)

    def _apply_undo_redo(self, action: Action, undo: bool):
        page_idx = action.page_index
        if page_idx not in self.overlays_by_page:
            self.overlays_by_page[page_idx] = []
        overlays = self.overlays_by_page[page_idx]

        if action.kind == "add":
            if undo:
                overlays[:] = [o for o in overlays if o.id != action.overlay_id]
                self.selected_overlay_id = None
            else:
                overlays.append(Overlay.from_snapshot(action.after))
                self.selected_overlay_id = action.overlay_id
        elif action.kind == "delete":
            if undo:
                overlays.append(Overlay.from_snapshot(action.before))
                self.selected_overlay_id = action.overlay_id
            else:
                overlays[:] = [o for o in overlays if o.id != action.overlay_id]
                self.selected_overlay_id = None
        else:
            snap = action.before if undo else action.after
            for i, o in enumerate(overlays):
                if o.id == action.overlay_id:
                    overlays[i] = Overlay.from_snapshot(snap)
                    self.selected_overlay_id = action.overlay_id
                    break

        if page_idx == self.page_index:
            self.render_page()
            self._refresh_panels()

    # ---- Page Nav ----
    def prev_page(self):
        if self.doc is None or self.page_index <= 0:
            return
        self.page_index -= 1
        self.selected_overlay_id = None
        self._on_page_change()

    def next_page(self):
        if self.doc is None or self.page_index >= len(self.doc) - 1:
            return
        self.page_index += 1
        self.selected_overlay_id = None
        self._on_page_change()

    def _on_page_entry(self, _event):
        text = self.page_var.get().strip()
        try:
            num = int(text.split("/")[0].strip())
        except (ValueError, IndexError):
            self._update_page_var()
            return
        if self.doc is None:
            return
        num = max(1, min(num, len(self.doc)))
        self.page_index = num - 1
        self.selected_overlay_id = None
        self._on_page_change()

    def _on_page_change(self):
        self._update_page_var()
        self.sidebar.select_page(self.page_index)
        self.render_page()
        self._refresh_panels()

    def _on_sidebar_page(self, idx: int):
        if self.doc is None or idx == self.page_index:
            return
        self.page_index = idx
        self.selected_overlay_id = None
        self._update_page_var()
        self.render_page()
        self._refresh_panels()

    def _update_page_var(self):
        total = len(self.doc) if self.doc else 0
        self.page_var.set(f"{self.page_index + 1} / {total}")
        self.zoom_var.set(f"{int(self.zoom * 100)}%")

    # ---- Zoom ----
    def change_zoom(self, delta: float):
        if self.doc is None:
            return
        self.fit_mode = None
        self.zoom = min(max(round(self.zoom + delta, 2), 0.2), 5.0)
        self._update_page_var()
        self.render_page()

    def zoom_actual(self):
        if self.doc is None:
            return
        self.fit_mode = None
        self.zoom = 1.0
        self._update_page_var()
        self.render_page()

    def zoom_fit_width(self):
        if self.doc is None:
            return
        page = self.current_page()
        cw = self.canvas.winfo_width() - 4
        if cw > 50 and page:
            self.zoom = cw / page.rect.width
            self.fit_mode = "width"
            self._update_page_var()
            self.render_page()

    def zoom_fit_page(self):
        if self.doc is None:
            return
        page = self.current_page()
        cw = self.canvas.winfo_width() - 4
        ch = self.canvas.winfo_height() - 4
        if cw > 50 and ch > 50 and page:
            self.zoom = min(cw / page.rect.width, ch / page.rect.height)
            self.fit_mode = "page"
            self._update_page_var()
            self.render_page()

    def _on_canvas_resize(self, _event):
        if self.fit_mode == "width":
            self.zoom_fit_width()
        elif self.fit_mode == "page":
            self.zoom_fit_page()

    def _on_mousewheel(self, event):
        if event.state & 0x8:  # Cmd held
            self.change_zoom(0.1 if event.delta > 0 else -0.1)
        else:
            self.canvas.yview_scroll(int(-1 * event.delta), "units")

    # ---- Panels ----
    def toggle_sidebar(self):
        panes = self.main_pane.panes()
        sid = str(self.sidebar)
        if sid in panes:
            self.main_pane.forget(self.sidebar)
            self.config.sidebar_visible = False
        else:
            self.main_pane.insert(0, self.sidebar, weight=0)
            self.config.sidebar_visible = True

    def toggle_right_panel(self):
        panes = self.main_pane.panes()
        pid = str(self.right_panel)
        if pid in panes:
            self.main_pane.forget(self.right_panel)
            self.config.right_panel_visible = False
        else:
            self.main_pane.add(self.right_panel, weight=0)
            self.config.right_panel_visible = True

    # ---- Render ----
    def current_page(self) -> Optional[fitz.Page]:
        if self.doc is None:
            return None
        return self.doc.load_page(self.page_index)

    def _get_selected_overlay(self) -> Optional[Overlay]:
        if self.selected_overlay_id is None:
            return None
        for ov in self.overlays_by_page.get(self.page_index, []):
            if ov.id == self.selected_overlay_id:
                return ov
        return None

    def _get_overlay_original(self, ov: Overlay) -> Optional[Image.Image]:
        if ov.path in self.overlay_images:
            return self.overlay_images[ov.path]
        try:
            img = Image.open(ov.path).convert("RGBA")
            self.overlay_images[ov.path] = img
            return img
        except Exception:
            return None

    def render_page(self):
        page = self.current_page()
        if page is None:
            return

        mat = fitz.Matrix(self.zoom, self.zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        self.page_photo = ImageTk.PhotoImage(img)

        self.canvas.delete("all")
        self.handle_ids.clear()
        self.selection_rect_id = None
        self.overlay_draw_cache.clear()

        self.canvas_image_id = self.canvas.create_image(0, 0, image=self.page_photo, anchor="nw")
        self.canvas.config(scrollregion=(0, 0, img.width, img.height))

        for ov in self.overlays_by_page.get(self.page_index, []):
            self._draw_overlay(ov)

        sel_ov = self._get_selected_overlay()
        if sel_ov:
            self._draw_selection_ui(sel_ov)

        self.statusbar.right_var.set(f"{int(self.zoom * 100)}%")
        n = len(self.overlays_by_page.get(self.page_index, []))
        self.statusbar.center_var.set(f"{n} overlay{'s' if n != 1 else ''}" if n else "")

    def _draw_overlay(self, ov: Overlay):
        original = self._get_overlay_original(ov)
        if original is None:
            return

        rotated = original
        if ov.rotation == 90:
            rotated = original.transpose(Image.ROTATE_270)
        elif ov.rotation == 180:
            rotated = original.transpose(Image.ROTATE_180)
        elif ov.rotation == 270:
            rotated = original.transpose(Image.ROTATE_90)

        w = max(int(round(ov.width * self.zoom)), 1)
        h = max(int(round(ov.height * self.zoom)), 1)
        preview = rotated.resize((w, h), Image.LANCZOS)

        if ov.opacity < 1.0:
            r, g, b, a = preview.split()
            a = a.point(lambda x: int(x * ov.opacity))
            preview = Image.merge("RGBA", (r, g, b, a))

        photo = ImageTk.PhotoImage(preview)
        cid = self.canvas.create_image(ov.x * self.zoom, ov.y * self.zoom, image=photo, anchor="nw")
        self.canvas.tag_raise(cid)
        self.overlay_draw_cache[ov.id] = (photo, cid)

    def _draw_selection_ui(self, ov: Overlay):
        left = ov.x * self.zoom
        top = ov.y * self.zoom
        right = left + ov.width * self.zoom
        bottom = top + ov.height * self.zoom

        self.selection_rect_id = self.canvas.create_rectangle(
            left, top, right, bottom,
            outline=self.colors["selection"], width=2, dash=(5, 3),
        )
        self.canvas.tag_raise(self.selection_rect_id)

        hs = HANDLE_SIZE
        for name, (cx, cy) in {
            "tl": (left, top), "tr": (right, top),
            "bl": (left, bottom), "br": (right, bottom),
        }.items():
            hid = self.canvas.create_rectangle(
                cx - hs, cy - hs, cx + hs, cy + hs,
                fill=self.colors["handle_fill"], outline=self.colors["handle_outline"], width=2,
            )
            self.handle_ids[name] = hid
            self.canvas.tag_raise(hid)

    # ---- Mouse ----
    def on_mouse_down(self, event):
        cx = self.canvas.canvasx(event.x)
        cy = self.canvas.canvasy(event.y)

        handle = self._hit_handle(cx, cy)
        if handle:
            ov = self._get_selected_overlay()
            if ov:
                self.resizing = True
                self._resize_handle = handle
                self._resize_anchor_right = ov.x + ov.width
                self._resize_anchor_bottom = ov.y + ov.height
                self._pre_drag_snapshot = ov.snapshot()
                return

        hit_ov = self._hit_overlay(cx, cy)
        if hit_ov:
            self.selected_overlay_id = hit_ov.id
            self.dragging = True
            self.drag_offset_x = cx - hit_ov.x * self.zoom
            self.drag_offset_y = cy - hit_ov.y * self.zoom
            self._pre_drag_snapshot = hit_ov.snapshot()
            self.render_page()
            self._refresh_panels()
            return

        if self.selected_overlay_id:
            self.selected_overlay_id = None
            self.render_page()
            self._refresh_panels()

    def on_mouse_drag(self, event):
        page = self.current_page()
        if page is None:
            return
        cx = self.canvas.canvasx(event.x)
        cy = self.canvas.canvasy(event.y)
        ov = self._get_selected_overlay()
        if ov is None:
            return

        if self.dragging:
            new_x = max(0, (cx - self.drag_offset_x) / self.zoom)
            new_y = max(0, (cy - self.drag_offset_y) / self.zoom)
            ov.x = min(new_x, max(page.rect.width - ov.width, 0))
            ov.y = min(new_y, max(page.rect.height - ov.height, 0))
            self._quick_move(ov)
            self.statusbar.center_var.set(f"({ov.x:.1f}, {ov.y:.1f})")
            return

        if self.resizing:
            px = cx / self.zoom
            py = cy / self.zoom
            h = self._resize_handle
            ar = self._resize_anchor_right
            ab = self._resize_anchor_bottom

            if h == "br":
                ov.width = max(px - ov.x, MIN_OVERLAY_SIZE)
                ov.height = max(py - ov.y, MIN_OVERLAY_SIZE)
            elif h == "bl":
                nx = min(px, ar - MIN_OVERLAY_SIZE)
                nx = max(0, nx)
                ov.width = ar - nx
                ov.height = max(py - ov.y, MIN_OVERLAY_SIZE)
                ov.x = nx
            elif h == "tr":
                ny = min(py, ab - MIN_OVERLAY_SIZE)
                ny = max(0, ny)
                ov.width = max(px - ov.x, MIN_OVERLAY_SIZE)
                ov.height = ab - ny
                ov.y = ny
            elif h == "tl":
                nx = min(px, ar - MIN_OVERLAY_SIZE)
                ny = min(py, ab - MIN_OVERLAY_SIZE)
                ov.x = max(0, nx)
                ov.y = max(0, ny)
                ov.width = ar - ov.x
                ov.height = ab - ov.y

            ov.width = min(ov.width, page.rect.width - ov.x)
            ov.height = min(ov.height, page.rect.height - ov.y)
            self.render_page()
            self._refresh_panels()
            self.statusbar.center_var.set(f"{ov.width:.1f} × {ov.height:.1f}")

    def on_mouse_up(self, _event):
        ov = self._get_selected_overlay()
        if ov and self._pre_drag_snapshot and (self.dragging or self.resizing):
            before = self._pre_drag_snapshot
            after = ov.snapshot()
            if before != after:
                kind = "move" if self.dragging else "resize"
                self.undo_mgr.push(Action(kind, self.page_index, ov.id, before, after))
            self._refresh_panels()

        self.dragging = False
        self.resizing = False
        self._pre_drag_snapshot = None

    def _hit_handle(self, cx: float, cy: float) -> Optional[str]:
        for name, hid in self.handle_ids.items():
            try:
                x1, y1, x2, y2 = self.canvas.coords(hid)
                if x1 <= cx <= x2 and y1 <= cy <= y2:
                    return name
            except Exception:
                pass
        return None

    def _hit_overlay(self, cx: float, cy: float) -> Optional[Overlay]:
        for ov in reversed(self.overlays_by_page.get(self.page_index, [])):
            l = ov.x * self.zoom
            t = ov.y * self.zoom
            if l <= cx <= l + ov.width * self.zoom and t <= cy <= t + ov.height * self.zoom:
                return ov
        return None

    def _quick_move(self, ov: Overlay):
        cache = self.overlay_draw_cache.get(ov.id)
        if cache:
            _, cid = cache
            self.canvas.coords(cid, ov.x * self.zoom, ov.y * self.zoom)
        self._update_selection_coords(ov)

    def _update_selection_coords(self, ov: Overlay):
        left = ov.x * self.zoom
        top = ov.y * self.zoom
        right = left + ov.width * self.zoom
        bottom = top + ov.height * self.zoom

        if self.selection_rect_id:
            self.canvas.coords(self.selection_rect_id, left, top, right, bottom)
            self.canvas.tag_raise(self.selection_rect_id)

        hs = HANDLE_SIZE
        for name, (cx, cy) in {
            "tl": (left, top), "tr": (right, top),
            "bl": (left, bottom), "br": (right, bottom),
        }.items():
            hid = self.handle_ids.get(name)
            if hid:
                self.canvas.coords(hid, cx - hs, cy - hs, cx + hs, cy + hs)
                self.canvas.tag_raise(hid)

    # ---- Panel callbacks ----
    def _refresh_panels(self):
        overlays = self.overlays_by_page.get(self.page_index, [])
        self.overlay_list.refresh(overlays, self.selected_overlay_id)
        self._sync_props_panel()

    def _sync_props_panel(self):
        sel_ov = self._get_selected_overlay()
        original = self._get_overlay_original(sel_ov) if sel_ov else None
        self.props_panel.set_overlay(sel_ov, original)
        self._prop_before = sel_ov.snapshot() if sel_ov else None

    def _on_overlay_list_select(self, overlay_id: str):
        if self.selected_overlay_id != overlay_id:
            self.selected_overlay_id = overlay_id
            self.render_page()
            self._sync_props_panel()

    def _on_overlay_list_delete(self, overlay_id: str):
        self.selected_overlay_id = overlay_id
        self.delete_selected_overlay()

    def _on_property_change(self, change_type: str, field_name: Optional[str], commit: bool):
        """commit=False while a slider is being dragged; True when the edit is final."""
        ov = self._get_selected_overlay()
        if ov is None:
            return
        page = self.current_page()
        if page:
            ov.x = max(0, min(ov.x, page.rect.width - MIN_OVERLAY_SIZE))
            ov.y = max(0, min(ov.y, page.rect.height - MIN_OVERLAY_SIZE))
            ov.width = max(MIN_OVERLAY_SIZE, min(ov.width, page.rect.width - ov.x))
            ov.height = max(MIN_OVERLAY_SIZE, min(ov.height, page.rect.height - ov.y))
        self.render_page()

        if not commit:
            return
        before = self._prop_before
        after = ov.snapshot()
        if before and before.get("id") == ov.id and before != after:
            self.undo_mgr.push(Action("property", self.page_index, ov.id, before, after))
        self._prop_before = after
        if change_type == "field":
            # Show clamped values back in the X/Y/W/H fields
            self._sync_props_panel()

    # ---- Export ----
    def export_pdf(self):
        if self.doc is None or self.pdf_path is None:
            messagebox.showinfo("No PDF", "Open a PDF first.")
            return
        if not any(self.overlays_by_page.values()):
            messagebox.showinfo("No overlays", "Add at least one overlay image first.")
            return

        missing = sorted({
            ov.path for ovs in self.overlays_by_page.values() for ov in ovs
            if self._get_overlay_original(ov) is None
        })
        if missing:
            names = "\n".join(os.path.basename(p) for p in missing)
            if not messagebox.askyesno(
                "Missing images",
                f"These overlay images can't be read (moved or deleted?):\n\n{names}\n\n"
                "Export without them?",
                icon="warning",
            ):
                return

        out_path = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            filetypes=[("PDF files", "*.pdf")],
            initialfile=os.path.splitext(os.path.basename(self.pdf_path))[0] + "_edited.pdf",
        )
        if not out_path:
            return
        if os.path.realpath(out_path) == os.path.realpath(self.pdf_path):
            messagebox.showerror(
                "Export failed",
                "Can't overwrite the original PDF.\nChoose a different file name.",
            )
            return

        try:
            out_doc = fitz.open(self.pdf_path)
            for page_num, overlays in self.overlays_by_page.items():
                page = out_doc.load_page(page_num)
                for ov in overlays:
                    original = self._get_overlay_original(ov)
                    if original is None:
                        continue

                    img = original
                    if ov.rotation == 90:
                        img = img.transpose(Image.ROTATE_270)
                    elif ov.rotation == 180:
                        img = img.transpose(Image.ROTATE_180)
                    elif ov.rotation == 270:
                        img = img.transpose(Image.ROTATE_90)

                    if ov.opacity < 1.0:
                        r, g, b, a = img.split()
                        a = a.point(lambda x, op=ov.opacity: int(x * op))
                        img = Image.merge("RGBA", (r, g, b, a))

                    buf = io.BytesIO()
                    img.save(buf, format="PNG")
                    buf.seek(0)

                    rect = fitz.Rect(ov.x, ov.y, ov.x + ov.width, ov.y + ov.height)
                    page.insert_image(rect, stream=buf.read(), keep_proportion=False, overlay=True)

            out_doc.save(out_path, deflate=True)
            out_doc.close()
        except Exception as e:
            messagebox.showerror("Export failed", str(e))
            return

        self.statusbar.left_var.set(f"Exported: {os.path.basename(out_path)}")
        messagebox.showinfo("Done", f"Saved PDF:\n{out_path}")


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
def main():
    if HAS_DND:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()
    PdfOverlayEditorV3(root)
    root.mainloop()


if __name__ == "__main__":
    main()
