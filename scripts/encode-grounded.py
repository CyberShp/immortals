# Pillow exposes libwebp exact=True; sharp's WebP API discards invisible RGB.
import sys
from PIL import Image
w, h = map(int, sys.argv[1:3])
im = Image.frombytes('RGBA', (w, h), sys.stdin.buffer.read())
im.save(sys.stdout.buffer, format='WEBP', lossless=False, quality=86, alpha_quality=100, exact=True, method=6)
