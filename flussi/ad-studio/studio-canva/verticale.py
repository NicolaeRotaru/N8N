# Mette in verticale (9:16) le foto da studio per storie e reel: la foto intera, larga quanto la storia, col centro al 40%
# dell'altezza; sopra e sotto il colore del suo fondo, con un passaggio morbido. Scrive hd/_MG_<codice>v.jpg.
# Uso (nella cartella di lavoro): python3 verticale.py T63 T89 D19 ...   · con --taglia x0,y0,x1,y1 (frazioni) si toglie
# prima un bordo, es. il set fotografico che si vede in un angolo: python3 verticale.py T64 --taglia 0.05,0.27,0.90,1
import sys
from PIL import Image
args = sys.argv[1:]; taglio = None
if '--taglia' in args:
    i = args.index('--taglia'); taglio = [float(v) for v in args[i + 1].split(',')]; del args[i:i + 2]
def media(im, box): return im.crop(box).resize((1, 1), Image.BOX).getpixel((0, 0))
for c in args:
    im = Image.open(f'hd/_MG_{c}.jpg').convert('RGB')
    if taglio: W, H = im.size; im = im.crop((int(W * taglio[0]), int(H * taglio[1]), int(W * taglio[2]), int(H * taglio[3])))
    Wv, Hv = 1440, 2560
    pic = im.resize((Wv, round(im.height * Wv / im.width)), Image.LANCZOS); h = pic.height
    top = media(pic, (0, 0, Wv, int(h * 0.06))); bot = media(pic, (0, h - int(h * 0.06), Wv, h)); y0 = int(Hv * 0.40 - h / 2)
    f = Image.new('RGB', (Wv, Hv))
    for y in range(Hv):
        t = min(1, max(0, (y - y0) / h)); f.paste(tuple(int(top[k] + (bot[k] - top[k]) * t) for k in range(3)), (0, y, Wv, y + 1))
    b = int(h * 0.16); m = Image.new('L', pic.size, 255)
    for y in range(b):
        a = int(255 * (y / b) ** 1.6); m.paste(a, (0, y, Wv, y + 1)); m.paste(a, (0, h - 1 - y, Wv, h - y))
    f.paste(pic, (0, y0), m); f.save(f'hd/_MG_{c}v.jpg', quality=92); print(c, 'verticale')
