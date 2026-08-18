#!/usr/bin/env python3
"""Genera los PNG del ícono de la app a partir de la misma geometría del SVG.

Existe porque iOS ignora los favicon SVG: el ícono de "agregar a pantalla de
inicio" tiene que ser PNG. El entorno no trae rsvg/imagemagick/cairo, así que
se rasteriza a mano con supersampling.

Uso: python3 scripts/make-icons.py
"""

import math
import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / 'public'

GREEN = (0x00, 0xA6, 0x50)
WHITE = (0xFF, 0xFF, 0xFF)

# Geometría en un lienzo de 100x100, igual que favicon.svg.
CORNER_RADIUS = 22.0
STROKE = 7.0
CART = [(17.0, 25.0), (25.5, 25.0), (34.5, 60.5), (70.0, 60.5), (79.0, 37.5), (29.5, 37.5)]
WHEELS = [(42.0, 73.5, 6.0), (66.0, 73.5, 6.0)]

SAMPLES = 3  # supersampling por eje


def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def inside_rounded_rect(x, y, size, radius):
    """El fondo: cuadrado de esquinas redondeadas."""
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return math.hypot(x - cx, y - cy) <= radius


def inside_cart(x, y):
    """Trazo del carrito: ruedas macizas y polilínea con extremos redondeados."""
    for wx, wy, r in WHEELS:
        if math.hypot(x - wx, y - wy) <= r:
            return True
    half = STROKE / 2
    for (ax, ay), (bx, by) in zip(CART, CART[1:]):
        if dist_to_segment(x, y, ax, ay, bx, by) <= half:
            return True
    return False


def render(size):
    """Devuelve los bytes RGBA de la imagen, con antialiasing por supersampling."""
    scale = 100.0 / size
    step = 1.0 / (SAMPLES + 1)
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            bg_hits = 0
            fg_hits = 0
            for sy in range(1, SAMPLES + 1):
                for sx in range(1, SAMPLES + 1):
                    x = (px + sx * step) * scale
                    y = (py + sy * step) * scale
                    if not inside_rounded_rect(x, y, 100.0, CORNER_RADIUS):
                        continue
                    bg_hits += 1
                    if inside_cart(x, y):
                        fg_hits += 1
            total = SAMPLES * SAMPLES
            if bg_hits == 0:
                row += bytes((0, 0, 0, 0))
                continue
            # Mezcla verde y blanco según cuánta superficie cubre el trazo.
            k = fg_hits / bg_hits
            color = tuple(round(g + (w - g) * k) for g, w in zip(GREEN, WHITE))
            row += bytes((*color, round(255 * bg_hits / total)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    raw = b''.join(b'\x00' + r for r in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    path.write_bytes(png)
    return len(png)


def main():
    OUT_DIR.mkdir(exist_ok=True)
    for name, size in [
        ('apple-touch-icon.png', 180),
        ('icon-192.png', 192),
        ('icon-512.png', 512),
    ]:
        target = OUT_DIR / name
        written = write_png(target, render(size), size)
        print(f'{name:24} {size}x{size}  {written:>7} bytes')


if __name__ == '__main__':
    main()
