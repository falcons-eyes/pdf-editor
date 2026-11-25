
import os
import tkinter as tk
from tkinter import filedialog, messagebox
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import fitz  # PyMuPDF
from PIL import Image, ImageTk


HANDLE_SIZE = 10
MIN_OVERLAY_SIZE = 8.0


@dataclass
class Overlay:
    path: str
    x: float = 60.0
    y: float = 60.0
    width: float = 160.0
    height: float = 80.0


class PdfOverlayEditor:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("PDF Overlay Editor")
        self.root.geometry("1280x900")

        self.doc: Optional[fitz.Document] = None
        self.pdf_path: Optional[str] = None
        self.page_index = 0
        self.zoom = 1.2
        self.page_photo = None
        self.canvas_image_id = None

        self.overlays_by_page: Dict[int, Overlay] = {}
        self.overlay_original_pil: Optional[Image.Image] = None
        self.overlay_preview_pil: Optional[Image.Image] = None
        self.overlay_photo = None
        self.overlay_canvas_id = None

        self.handle_ids: Dict[str, int] = {}
        self.selection_rect_id = None

        self.dragging_overlay = False
        self.resizing_overlay = False
        self.drag_offset_x = 0.0
        self.drag_offset_y = 0.0
        self.resize_anchor_x = 0.0
        self.resize_anchor_y = 0.0

        self._build_ui()
        self._bind_events()

    def _build_ui(self):
        top = tk.Frame(self.root)
        top.pack(side=tk.TOP, fill=tk.X, padx=8, pady=8)

        tk.Button(top, text="Open PDF", command=self.open_pdf).pack(side=tk.LEFT)
        tk.Button(top, text="Open Overlay Image", command=self.open_overlay_image).pack(side=tk.LEFT, padx=(6, 0))
        tk.Button(top, text="Prev Page", command=self.prev_page).pack(side=tk.LEFT, padx=(18, 0))
        tk.Button(top, text="Next Page", command=self.next_page).pack(side=tk.LEFT, padx=(6, 0))
        tk.Button(top, text="Zoom -", command=lambda: self.change_zoom(-0.1)).pack(side=tk.LEFT, padx=(18, 0))
        tk.Button(top, text="Zoom +", command=lambda: self.change_zoom(0.1)).pack(side=tk.LEFT, padx=(6, 0))
        tk.Button(top, text="Smaller Overlay", command=lambda: self.resize_overlay(0.9)).pack(side=tk.LEFT, padx=(18, 0))
        tk.Button(top, text="Larger Overlay", command=lambda: self.resize_overlay(1.1)).pack(side=tk.LEFT, padx=(6, 0))
        tk.Button(top, text="Export PDF", command=self.export_pdf).pack(side=tk.LEFT, padx=(18, 0))

        self.status_var = tk.StringVar(value="Open a PDF to start.")
        tk.Label(top, textvariable=self.status_var, anchor="w").pack(side=tk.LEFT, padx=(16, 0))

        size_frame = tk.Frame(self.root)
        size_frame.pack(side=tk.TOP, fill=tk.X, padx=8, pady=(0, 6))

        tk.Label(size_frame, text="Overlay Size").pack(side=tk.LEFT)
        self.size_var = tk.DoubleVar(value=100.0)
        self.size_slider = tk.Scale(
            size_frame,
            from_=1,
            to=300,
            orient=tk.HORIZONTAL,
            resolution=1,
            variable=self.size_var,
            command=self.on_size_slider,
            length=280,
        )
        self.size_slider.pack(side=tk.LEFT, padx=(8, 8))
        tk.Label(
            size_frame,
            text="Drag overlay to move. Drag blue corner handle or slider to resize. Can shrink below original size.",
            fg="#555",
        ).pack(side=tk.LEFT, padx=(8, 0))

        self.canvas = tk.Canvas(self.root, bg="#d9d9d9", highlightthickness=0)
        self.hbar = tk.Scrollbar(self.root, orient=tk.HORIZONTAL, command=self.canvas.xview)
        self.vbar = tk.Scrollbar(self.root, orient=tk.VERTICAL, command=self.canvas.yview)
        self.canvas.configure(xscrollcommand=self.hbar.set, yscrollcommand=self.vbar.set)

        self.vbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.hbar.pack(side=tk.BOTTOM, fill=tk.X)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        bottom = tk.Frame(self.root)
        bottom.pack(side=tk.BOTTOM, fill=tk.X, padx=8, pady=6)
        help_text = (
            "Tip: blue square = resize handle. Slider uses image's actual size as baseline and allows smaller-than-original."
        )
        tk.Label(bottom, text=help_text, anchor="w", fg="#555").pack(side=tk.LEFT)

    def _bind_events(self):
        self.canvas.bind("<ButtonPress-1>", self.on_mouse_down)
        self.canvas.bind("<B1-Motion>", self.on_mouse_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_mouse_up)
        self.root.bind("<Left>", lambda e: self.prev_page())
        self.root.bind("<Right>", lambda e: self.next_page())
        self.root.bind("<Command-minus>", lambda e: self.change_zoom(-0.1))
        self.root.bind("<Command-equal>", lambda e: self.change_zoom(0.1))
        self.root.bind("<Command-plus>", lambda e: self.change_zoom(0.1))
        self.canvas.bind("<MouseWheel>", self.on_mousewheel)

    def open_pdf(self):
        path = filedialog.askopenfilename(filetypes=[("PDF files", "*.pdf")])
        if not path:
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
        self.overlay_original_pil = None
        self._set_slider_percent(100.0)
        self.status_var.set(f"Loaded PDF: {os.path.basename(path)} ({len(doc)} pages)")
        self.render_page()

    def open_overlay_image(self):
        path = filedialog.askopenfilename(
            filetypes=[
                ("Image files", ("*.png", "*.jpg", "*.jpeg", "*.webp", "*.bmp")),
                ("PNG files", "*.png"),
                ("JPEG files", ("*.jpg", "*.jpeg")),
                ("WebP files", "*.webp"),
                ("Bitmap files", "*.bmp"),
                ("All files", "*.*"),
            ]
        )
        if not path:
            return

        page = self.current_page()
        if page is None:
            messagebox.showinfo("No PDF", "Open a PDF first.")
            return

        try:
            img = Image.open(path).convert("RGBA")
        except Exception as e:
            messagebox.showerror("Open image failed", str(e))
            return

        default_width = min(max(page.rect.width * 0.22, 80), page.rect.width * 0.75)
        ratio = img.height / img.width if img.width else 0.5
        overlay = Overlay(path=path, x=60, y=60, width=default_width, height=default_width * ratio)
        self.overlays_by_page[self.page_index] = overlay
        self.overlay_original_pil = img
        self._update_slider_from_overlay()
        self.status_var.set(f"Overlay image loaded for page {self.page_index + 1}: {os.path.basename(path)}")
        self.render_page()

    def current_page(self) -> Optional[fitz.Page]:
        if self.doc is None:
            return None
        return self.doc.load_page(self.page_index)

    def current_overlay(self) -> Optional[Overlay]:
        return self.overlays_by_page.get(self.page_index)

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
        self.overlay_canvas_id = None

        self.canvas_image_id = self.canvas.create_image(0, 0, image=self.page_photo, anchor="nw")
        self.canvas.config(scrollregion=(0, 0, img.width, img.height))

        overlay = self.current_overlay()
        if overlay:
            if self.overlay_original_pil is None or self._overlay_path() != overlay.path:
                self.overlay_original_pil = Image.open(overlay.path).convert("RGBA")
            self._draw_overlay(overlay)
            self._update_slider_from_overlay()

        total_pages = len(self.doc) if self.doc else 0
        self.root.title(f"PDF Overlay Editor — page {self.page_index + 1}/{total_pages}")

    def _overlay_path(self):
        ov = self.current_overlay()
        return ov.path if ov else None

    def _draw_overlay(self, overlay: Overlay):
        if self.overlay_original_pil is None:
            return

        w = max(int(round(overlay.width * self.zoom)), 1)
        h = max(int(round(overlay.height * self.zoom)), 1)
        preview = self.overlay_original_pil.resize((w, h), Image.LANCZOS)
        self.overlay_preview_pil = preview
        self.overlay_photo = ImageTk.PhotoImage(preview)

        left = overlay.x * self.zoom
        top = overlay.y * self.zoom
        self.overlay_canvas_id = self.canvas.create_image(left, top, image=self.overlay_photo, anchor="nw")
        self.canvas.tag_raise(self.overlay_canvas_id)
        self._draw_selection_ui(left, top, w, h)

    def _draw_selection_ui(self, left: float, top: float, width_px: float, height_px: float):
        right = left + width_px
        bottom = top + height_px

        self.selection_rect_id = self.canvas.create_rectangle(
            left, top, right, bottom,
            outline="#2563eb",
            width=2,
            dash=(5, 3),
        )
        self.canvas.tag_raise(self.selection_rect_id)

        handle_id = self.canvas.create_rectangle(
            right - HANDLE_SIZE,
            bottom - HANDLE_SIZE,
            right + HANDLE_SIZE,
            bottom + HANDLE_SIZE,
            fill="#2563eb",
            outline="white",
            width=2,
        )
        self.handle_ids = {"br": handle_id}
        self.canvas.tag_raise(handle_id)

    def _update_selection_ui(self):
        overlay = self.current_overlay()
        if overlay is None or self.selection_rect_id is None:
            return

        left = overlay.x * self.zoom
        top = overlay.y * self.zoom
        width_px = overlay.width * self.zoom
        height_px = overlay.height * self.zoom
        right = left + width_px
        bottom = top + height_px

        self.canvas.coords(self.selection_rect_id, left, top, right, bottom)

        handle_id = self.handle_ids.get("br")
        if handle_id:
            self.canvas.coords(
                handle_id,
                right - HANDLE_SIZE,
                bottom - HANDLE_SIZE,
                right + HANDLE_SIZE,
                bottom + HANDLE_SIZE,
            )
            self.canvas.tag_raise(handle_id)

        self.canvas.tag_raise(self.selection_rect_id)

    def _hit_test_overlay(self, canvas_x: float, canvas_y: float) -> Tuple[bool, bool]:
        handle_id = self.handle_ids.get("br")
        if handle_id:
            x1, y1, x2, y2 = self.canvas.coords(handle_id)
            if x1 <= canvas_x <= x2 and y1 <= canvas_y <= y2:
                return False, True

        if self.overlay_canvas_id is None:
            return False, False

        x1, y1, x2, y2 = self.canvas.bbox(self.overlay_canvas_id)
        if x1 <= canvas_x <= x2 and y1 <= canvas_y <= y2:
            return True, False

        return False, False

    def on_mouse_down(self, event):
        overlay = self.current_overlay()
        if overlay is None:
            return

        canvas_x = self.canvas.canvasx(event.x)
        canvas_y = self.canvas.canvasy(event.y)
        hit_overlay, hit_handle = self._hit_test_overlay(canvas_x, canvas_y)

        if hit_handle:
            self.resizing_overlay = True
            self.resize_anchor_x = overlay.x
            self.resize_anchor_y = overlay.y
            return

        if hit_overlay and self.overlay_canvas_id is not None:
            self.dragging_overlay = True
            x1, y1, _, _ = self.canvas.bbox(self.overlay_canvas_id)
            self.drag_offset_x = canvas_x - x1
            self.drag_offset_y = canvas_y - y1

    def on_mouse_drag(self, event):
        overlay = self.current_overlay()
        page = self.current_page()
        if overlay is None or page is None:
            return

        canvas_x = self.canvas.canvasx(event.x)
        canvas_y = self.canvas.canvasy(event.y)

        if self.dragging_overlay and self.overlay_canvas_id is not None:
            new_x_px = max(0, canvas_x - self.drag_offset_x)
            new_y_px = max(0, canvas_y - self.drag_offset_y)

            max_x_px = max(page.rect.width * self.zoom - overlay.width * self.zoom, 0)
            max_y_px = max(page.rect.height * self.zoom - overlay.height * self.zoom, 0)
            new_x_px = min(new_x_px, max_x_px)
            new_y_px = min(new_y_px, max_y_px)

            overlay.x = new_x_px / self.zoom
            overlay.y = new_y_px / self.zoom
            self.canvas.coords(self.overlay_canvas_id, new_x_px, new_y_px)
            self._update_selection_ui()
            self.status_var.set(f"Overlay position: x={overlay.x:.1f}, y={overlay.y:.1f} (page {self.page_index + 1})")
            return

        if self.resizing_overlay:
            new_w = max((canvas_x / self.zoom) - self.resize_anchor_x, MIN_OVERLAY_SIZE)
            new_h = max((canvas_y / self.zoom) - self.resize_anchor_y, MIN_OVERLAY_SIZE)

            new_w = min(new_w, page.rect.width - overlay.x)
            new_h = min(new_h, page.rect.height - overlay.y)

            overlay.width = new_w
            overlay.height = new_h
            self._redraw_overlay_only(overlay)
            self._update_slider_from_overlay()
            self.status_var.set(f"Overlay size: {overlay.width:.1f} × {overlay.height:.1f} pt")

    def on_mouse_up(self, _event):
        self.dragging_overlay = False
        self.resizing_overlay = False

    def on_mousewheel(self, event):
        self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _redraw_overlay_only(self, overlay: Overlay):
        if self.overlay_canvas_id:
            self.canvas.delete(self.overlay_canvas_id)
            self.overlay_canvas_id = None
        if self.selection_rect_id:
            self.canvas.delete(self.selection_rect_id)
            self.selection_rect_id = None
        for hid in self.handle_ids.values():
            self.canvas.delete(hid)
        self.handle_ids.clear()
        self._draw_overlay(overlay)

    def resize_overlay(self, scale: float):
        overlay = self.current_overlay()
        page = self.current_page()
        if overlay is None or page is None:
            return

        overlay.width *= scale
        overlay.height *= scale
        overlay.width = max(MIN_OVERLAY_SIZE, min(overlay.width, page.rect.width))
        overlay.height = max(MIN_OVERLAY_SIZE, min(overlay.height, page.rect.height))
        overlay.x = min(overlay.x, max(page.rect.width - overlay.width, 0))
        overlay.y = min(overlay.y, max(page.rect.height - overlay.height, 0))
        self._redraw_overlay_only(overlay)
        self._update_slider_from_overlay()

    def _get_overlay_percent(self) -> float:
        overlay = self.current_overlay()
        if overlay is None or self.overlay_original_pil is None or self.overlay_original_pil.width == 0:
            return 100.0
        return max(1.0, min((overlay.width / self.overlay_original_pil.width) * 100.0, 300.0))

    def _set_slider_percent(self, value: float):
        self.size_slider.set(value)

    def _update_slider_from_overlay(self):
        self._set_slider_percent(self._get_overlay_percent())

    def on_size_slider(self, raw_value: str):
        overlay = self.current_overlay()
        page = self.current_page()
        if overlay is None or page is None:
            return

        if self.overlay_original_pil is None:
            self.overlay_original_pil = Image.open(overlay.path).convert("RGBA")

        value = float(raw_value)
        orig_w = max(self.overlay_original_pil.width, 1)
        orig_h = max(self.overlay_original_pil.height, 1)
        target_w = max(MIN_OVERLAY_SIZE, (orig_w * value) / 100.0)
        target_h = max(MIN_OVERLAY_SIZE, (orig_h * value) / 100.0)

        max_ratio_w = page.rect.width / target_w if target_w else 1.0
        max_ratio_h = page.rect.height / target_h if target_h else 1.0
        page_fit_ratio = min(max_ratio_w, max_ratio_h, 1.0)

        overlay.width = max(MIN_OVERLAY_SIZE, target_w * page_fit_ratio)
        overlay.height = max(MIN_OVERLAY_SIZE, target_h * page_fit_ratio)
        overlay.x = min(overlay.x, max(page.rect.width - overlay.width, 0))
        overlay.y = min(overlay.y, max(page.rect.height - overlay.height, 0))
        self._redraw_overlay_only(overlay)

    def export_pdf(self):
        if self.doc is None or self.pdf_path is None:
            messagebox.showinfo("No PDF", "Open a PDF first.")
            return
        if not self.overlays_by_page:
            messagebox.showinfo("No overlays", "Add at least one overlay image first.")
            return

        out_path = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            filetypes=[("PDF files", "*.pdf")],
            initialfile=os.path.splitext(os.path.basename(self.pdf_path))[0] + "_signed.pdf",
        )
        if not out_path:
            return

        try:
            out_doc = fitz.open(self.pdf_path)
            for page_num, overlay in self.overlays_by_page.items():
                page = out_doc.load_page(page_num)
                rect = fitz.Rect(overlay.x, overlay.y, overlay.x + overlay.width, overlay.y + overlay.height)
                page.insert_image(rect, filename=overlay.path, keep_proportion=False, overlay=True)
            out_doc.save(out_path, deflate=True)
            out_doc.close()
        except Exception as e:
            messagebox.showerror("Export failed", str(e))
            return

        self.status_var.set(f"Exported: {out_path}")
        messagebox.showinfo("Done", f"Saved new PDF:\n{out_path}")

    def prev_page(self):
        if self.doc is None or self.page_index <= 0:
            return
        self.page_index -= 1
        self.render_page()

    def next_page(self):
        if self.doc is None or self.page_index >= len(self.doc) - 1:
            return
        self.page_index += 1
        self.render_page()

    def change_zoom(self, delta: float):
        if self.doc is None:
            return
        new_zoom = round(self.zoom + delta, 2)
        self.zoom = min(max(new_zoom, 0.3), 4.0)
        self.render_page()


def main():
    root = tk.Tk()
    PdfOverlayEditor(root)
    root.mainloop()


if __name__ == "__main__":
    main()
