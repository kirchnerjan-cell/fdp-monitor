#!/usr/bin/env python3
"""Rastergrafiken des App-Icons aus der Geometrie von icons/icon.svg erzeugen.

Einmal-Werkzeug: nur nötig, wenn sich das Icon ändert. Braucht Pillow
(`pip install pillow`) und ist deshalb keine Abhängigkeit der Website selbst –
die erzeugten Dateien liegen fertig im Repo.

    python3 icons/make-icons.py

Motiv (Variante A „Hürde" aus dem Design-Entwurf): drei dunkle Balken unter einer
gestrichelten Hürdenlinie auf Gelb. Unter 32 px entfällt die Linie und die Balken
werden breiter, sonst verschwimmt beides.
"""
import os

from PIL import Image, ImageDraw

HIER = os.path.dirname(os.path.abspath(__file__))
GELB = "#EFC41A"
DUNKEL = "#171A21"
SS = 8  # Supersampling-Faktor, danach heruntergerechnet -> weiche Kanten

# Alle Maße im 120er-Koordinatensystem von icon.svg.
BALKEN = [(22, 58, 16, 40), (46, 44, 16, 54), (70, 64, 16, 34)]
BALKEN_KLEIN = [(20, 58, 22, 42), (49, 42, 22, 58), (78, 66, 22, 34)]
HUERDE_Y, HUERDE_X1, HUERDE_X2, HUERDE_DICKE = 50, 14, 106, 5
STRICH, LUECKE = 9, 6


def zeichne(groesse, radius=27, mit_linie=True, randlos=False):
    """Ein Icon in <groesse> px. randlos=True füllt die ganze Fläche (iOS maskiert selbst)."""
    n = groesse * SS
    s = n / 120.0
    bild = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(bild)
    if randlos:
        d.rectangle([0, 0, n, n], fill=GELB)
    else:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=radius * s, fill=GELB)

    for x, y, w, h in (BALKEN if mit_linie else BALKEN_KLEIN):
        d.rounded_rectangle([x * s, y * s, (x + w) * s, (y + h) * s],
                            radius=(3 * s if mit_linie else 0), fill=DUNKEL)

    if mit_linie:
        y = HUERDE_Y * s
        dicke = max(1, round(HUERDE_DICKE * s))
        x = HUERDE_X1 * s
        while x < HUERDE_X2 * s:
            ende = min(x + STRICH * s, HUERDE_X2 * s)
            d.rectangle([x, y - dicke / 2, ende, y + dicke / 2], fill=DUNKEL)
            x = ende + LUECKE * s
    return bild.resize((groesse, groesse), Image.LANCZOS)


def main():
    # favicon.ico: 32 px mit Linie, 16 px in der vereinfachten Fassung.
    zeichne(32).save(os.path.join(HIER, "favicon.ico"), format="ICO",
                     sizes=[(32, 32), (16, 16)],
                     append_images=[zeichne(16, radius=24, mit_linie=False)])
    # Apple ignoriert den Alphakanal und stellt Transparenz je nach iOS-Version schwarz
    # dar. Das Motiv ist ohnehin deckend, deshalb ohne Alphakanal speichern.
    def ohne_alpha(bild):
        flach = Image.new("RGB", bild.size, GELB)
        flach.paste(bild, mask=bild.split()[3])
        return flach

    ohne_alpha(zeichne(180, randlos=True)).save(os.path.join(HIER, "apple-touch-icon.png"))
    for px in (192, 512):
        ohne_alpha(zeichne(px, randlos=True)).save(os.path.join(HIER, f"icon-{px}.png"))
    print("favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png geschrieben")


if __name__ == "__main__":
    main()
