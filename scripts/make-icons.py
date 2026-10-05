"""Draws Clarivi's app icon (D76): an open white ring with rounded ends and a
white dot in its opening, on Link blue (the Phase 1a placeholder, finished).

Writes plain PNGs with the standard library only, so no image tools are needed.
Run: python3 scripts/make-icons.py
"""
import math
import struct
import zlib
from pathlib import Path

BLUE = (0x0A, 0x60, 0xD8)
WHITE = (0xFF, 0xFF, 0xFF)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
SAMPLES = 4  # supersampling per axis, for smooth edges


RING = 0.28  # the ring's middle, as a share of the icon's width
HALF = 0.055  # half the ring's thickness
GAP = 40  # the opening on the right, in degrees either side of level
DOT = (0.79, 0.5, 0.065)  # the dot in the opening: centre and radius
ENDS = [(0.5 + RING * math.cos(math.radians(a)), 0.5 - RING * math.sin(math.radians(a))) for a in (GAP, -GAP)]


def in_mark(x: float, y: float) -> bool:
    # Coordinates are 0..1. A thick ring, open on the right like a "C", with
    # rounded ends, and a dot in the opening. All of it sits inside the
    # middle 80%, so it survives the round mask Android uses ("maskable").
    dx, dy = x - 0.5, y - 0.5
    if abs(math.hypot(dx, dy) - RING) <= HALF and not -GAP <= math.degrees(math.atan2(-dy, dx)) <= GAP:
        return True
    if any(math.hypot(x - ex, y - ey) <= HALF for ex, ey in ENDS):
        return True
    return math.hypot(x - DOT[0], y - DOT[1]) <= DOT[2]


def png(size: int) -> bytes:
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            hits = sum(
                in_mark((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size)
                for sx in range(SAMPLES)
                for sy in range(SAMPLES)
            )
            a = hits / (SAMPLES * SAMPLES)
            row += bytes(round(b * (1 - a) + w * a) for b, w in zip(BLUE, WHITE))
        rows.append(bytes(row))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")


for name, size in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
    (OUT / name).write_bytes(png(size))
    print("wrote", name)
