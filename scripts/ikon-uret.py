"""Uygulama ikonlarini uretir. Tek kaynak: burasi. Yeniden calistirmak icin:
    python scripts/ikon-uret.py
"""
from PIL import Image, ImageDraw
from pathlib import Path
import math

KOK = Path(__file__).resolve().parent.parent
HEDEF = KOK / "src-tauri" / "icons"
HEDEF.mkdir(parents=True, exist_ok=True)

N = 1024          # ana cizim cozunurlugu (sonra kucultulur)
MOR_UST = (140, 112, 255)
MOR_ALT = (92, 60, 220)


def gradyan_kare(n: int) -> Image.Image:
    """Kosegen gradyanli, yuvarlak koseli kare."""
    g = Image.new("RGB", (n, n))
    px = g.load()
    for y in range(n):
        for x in range(n):
            t = (x / n * 0.35) + (y / n * 0.65)
            px[x, y] = tuple(
                round(MOR_UST[i] + (MOR_ALT[i] - MOR_UST[i]) * t) for i in range(3)
            )
    maske = Image.new("L", (n, n), 0)
    ImageDraw.Draw(maske).rounded_rectangle(
        [0, 0, n - 1, n - 1], radius=int(n * 0.225), fill=255
    )
    out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    out.paste(g, (0, 0), maske)
    return out


def ikon() -> Image.Image:
    im = gradyan_kare(N)
    d = ImageDraw.Draw(im)
    mx = my = N / 2
    r = N * 0.27          # saat kadrani yaricapi
    kalinlik = int(N * 0.055)

    # Kadran halkasi
    d.ellipse([mx - r, my - r, mx + r, my + r], outline=(255, 255, 255, 255), width=kalinlik)

    # Akrep (kisa, saat 10 yonu) ve yelkovan (uzun, saat 2 yonu)
    def kol(aci_derece: float, uzunluk: float, kal: int):
        a = math.radians(aci_derece - 90)
        d.line(
            [mx, my, mx + math.cos(a) * uzunluk, my + math.sin(a) * uzunluk],
            fill=(255, 255, 255, 255), width=kal, joint="curve",
        )

    kol(300, r * 0.52, kalinlik)       # akrep
    kol(60, r * 0.74, int(kalinlik * 0.8))  # yelkovan
    d.ellipse([mx - kalinlik * 0.6, my - kalinlik * 0.6,
               mx + kalinlik * 0.6, my + kalinlik * 0.6], fill=(255, 255, 255, 255))

    # Sag ustte bildirim noktasi (hatirlatma vurgusu)
    nr = N * 0.085
    nx, ny = mx + r * 0.92, my - r * 0.92
    d.ellipse([nx - nr * 1.5, ny - nr * 1.5, nx + nr * 1.5, ny + nr * 1.5],
              fill=(20, 20, 28, 255))
    d.ellipse([nx - nr, ny - nr, nx + nr, ny + nr], fill=(255, 92, 120, 255))
    return im


def main():
    kaynak = ikon()
    for ad, boyut in [
        ("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256),
        ("icon.png", 512), ("tepsi.png", 64),
    ]:
        kaynak.resize((boyut, boyut), Image.LANCZOS).save(HEDEF / ad)

    # Windows .ico - exe'ye gomulur, coklu boyut icerir
    kaynak.resize((256, 256), Image.LANCZOS).save(
        HEDEF / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("Ikonlar uretildi ->", HEDEF)


if __name__ == "__main__":
    main()
