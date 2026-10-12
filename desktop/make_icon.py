"""index.html의 픽셀 보석 로고(SVG)를 읽어 icon.ico로 만든다."""
import os
import re
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
COLORS = {"px-k": "#251e12", "px-a": "#e2570b", "px-d": "#a93f06", "px-w": "#fff6e0"}

html = open(os.path.join(HERE, "..", "index.html"), encoding="utf-8").read()
size = 256
cell = size // 12
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
for cls, d in re.findall(r'<path class="(px-[kadw])" d="([^"]+)"', html):
    for x, y, w, h in re.findall(r"M(\d+) (\d+)h(\d+)v(\d+)", d):
        x, y, w, h = map(int, (x, y, w, h))
        # 로고는 가로 12 x 세로 11칸. 세로는 가운데에 맞춘다
        draw.rectangle([x * cell, y * cell + cell // 2, (x + w) * cell - 1, (y + h) * cell + cell // 2 - 1], fill=COLORS[cls])
img.save(os.path.join(HERE, "icon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("icon.ico written")
