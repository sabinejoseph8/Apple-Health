"""Draws Clarivi's placeholder app icon: an open white ring on Link blue.

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


def in_ring(x: float, y: float) -> bool:
    # Coordinates are 0..1. A thick ring, open on the right like a "C".
    dx, dy = x - 0.5, y - 0.5
    r = math.hypot(dx, dy)
    if not 0.22 <= r <= 0.33:
        return False
    angle = math.degrees(math.atan2(-dy, dx))
    return not -40 <= angle <= 40


def png(size: int) -> bytes:
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            hits = sum(
                in_ring((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size)
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
