import qrcode
import io
from reportlab.lib.pagesizes import A5
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.utils import ImageReader
from PIL import Image

A5_W, A5_H = A5  # 419.5 x 595.3 points

NAVY    = HexColor('#0054A5')
NAVY_DK = HexColor('#003d7a')
GOLD    = HexColor('#C9A96E')
CREAM   = HexColor('#F7F5F1')
INK     = HexColor('#111118')
MUTED   = HexColor('#6d6a65')
WHITE   = white

def make_qr(url):
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return ImageReader(buf)

def draw_banner1(c):
    w, h = A5_W, A5_H

    # Background
    c.setFillColor(NAVY)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Top gold bar
    c.setFillColor(GOLD)
    c.rect(0, h - 6, w, 6, fill=1, stroke=0)

    # Bottom gold bar
    c.rect(0, 0, w, 4, fill=1, stroke=0)

    # Subtle decorative circle behind content
    c.setFillColor(HexColor('#003d7a'))
    c.circle(w / 2, h / 2 + 20, 160, fill=1, stroke=0)

    # BURMELIN logo text
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 22)
    c.drawCentredString(w / 2, h - 52, 'BURMELIN')

    # Gold line under logo
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.line(w/2 - 30, h - 62, w/2 + 30, h - 62)

    # "We have a gift for you"
    c.setFillColor(GOLD)
    c.setFont('Helvetica', 10)
    c.drawCentredString(w / 2, h - 90, 'W E  H A V E  A  G I F T  F O R  Y O U')

    # 10% Off — big
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 72)
    c.drawCentredString(w / 2, h - 175, '10%')

    c.setFont('Helvetica-Bold', 32)
    c.drawCentredString(w / 2, h - 215, 'Off')

    # Gold accent line
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.line(40, h - 235, w - 40, h - 235)

    # Your Purchase
    c.setFillColor(GOLD)
    c.setFont('Helvetica', 11)
    c.drawCentredString(w / 2, h - 255, 'Y O U R  P U R C H A S E')

    # Instruction text
    c.setFillColor(HexColor('#b8d0ee'))
    c.setFont('Helvetica', 10)
    c.drawCentredString(w / 2, h - 285, 'Leave us a Google Review and show it')
    c.drawCentredString(w / 2, h - 300, 'to our staff to receive your gift.')

    # QR code
    qr_img = make_qr('https://g.page/r/CbTQDha-pwVtEAE/review')
    qr_size = 110
    qr_x = (w - qr_size) / 2
    qr_y = h - 435

    # White rounded box behind QR
    c.setFillColor(WHITE)
    c.roundRect(qr_x - 8, qr_y - 8, qr_size + 16, qr_size + 16, 8, fill=1, stroke=0)
    c.drawImage(qr_img, qr_x, qr_y, qr_size, qr_size)

    # Scan text
    c.setFillColor(HexColor('#b8d0ee'))
    c.setFont('Helvetica', 9)
    c.drawCentredString(w / 2, h - 450, 'Scan to leave a Google Review')

    # Stars
    c.setFillColor(GOLD)
    c.setFont('Helvetica-Bold', 16)
    stars = '★  ★  ★  ★  ★'
    c.drawCentredString(w / 2, h - 478, stars)

    # burmelin.com footer
    c.setFillColor(HexColor('#7aa8d4'))
    c.setFont('Helvetica', 9)
    c.drawCentredString(w / 2, 20, 'burmelin.com  ·  5 Stores in Bangkok')


def draw_banner2(c):
    w, h = A5_W, A5_H

    # Background cream
    c.setFillColor(CREAM)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Top navy bar
    c.setFillColor(NAVY)
    c.rect(0, h - 6, w, 6, fill=1, stroke=0)

    # Bottom navy bar
    c.rect(0, 0, w, 4, fill=1, stroke=0)

    # BURMELIN logo
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 22)
    c.drawCentredString(w / 2, h - 52, 'BURMELIN')

    # Navy line under logo
    c.setStrokeColor(NAVY)
    c.setLineWidth(0.8)
    c.line(w/2 - 30, h - 62, w/2 + 30, h - 62)

    # Now Available Online
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 10)
    c.drawCentredString(w / 2, h - 90, 'N O W  A V A I L A B L E  O N L I N E')

    # Main headline
    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 28)
    c.drawCentredString(w / 2, h - 140, 'Shop BURMELIN')

    c.setFont('Helvetica', 22)
    c.drawCentredString(w / 2, h - 168, 'from Anywhere')

    # Divider
    c.setStrokeColor(HexColor('#e0ddd7'))
    c.setLineWidth(0.8)
    c.line(40, h - 188, w - 40, h - 188)

    # Feature list
    features = [
        'Browse our full collection online',
        'Order via WhatsApp in minutes',
        'All colors & sizes available',
        'Fast delivery across Bangkok',
    ]
    c.setFillColor(INK)
    c.setFont('Helvetica', 11)
    start_y = h - 212
    for feat in features:
        c.setFillColor(NAVY)
        c.setFont('Helvetica-Bold', 13)
        c.drawString(54, start_y, '✓')
        c.setFillColor(INK)
        c.setFont('Helvetica', 11)
        c.drawString(72, start_y, feat)
        start_y -= 22

    # burmelin.com box
    c.setFillColor(NAVY)
    c.roundRect(32, h - 360, w - 64, 52, 8, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 24)
    c.drawCentredString(w / 2, h - 338, 'burmelin.com')
    c.setFillColor(HexColor('#a8c4e0'))
    c.setFont('Helvetica', 9)
    c.drawCentredString(w / 2, h - 354, 'Visit us online today')

    # QR code
    qr_img = make_qr('https://burmelin.com')
    qr_size = 100
    qr_x = (w - qr_size) / 2
    qr_y = h - 488

    # White box behind QR
    c.setFillColor(WHITE)
    c.roundRect(qr_x - 8, qr_y - 8, qr_size + 16, qr_size + 16, 6, fill=1, stroke=0)
    c.setStrokeColor(HexColor('#e0ddd7'))
    c.setLineWidth(0.5)
    c.roundRect(qr_x - 8, qr_y - 8, qr_size + 16, qr_size + 16, 6, fill=0, stroke=1)
    c.drawImage(qr_img, qr_x, qr_y, qr_size, qr_size)

    # Scan text
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 9)
    c.drawCentredString(w / 2, h - 504, 'Scan to visit our website')

    # Footer
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 9)
    c.drawCentredString(w / 2, 20, 'Terminal 21 Asok  ·  Terminal 21 Rama 3  ·  Nana Square')


# --- Generate Banner 1 ---
out1 = r'C:\Users\BURMELIN\OneDrive\Desktop\Burmelin Merge\BURMELIN_Banner_GoogleReview.pdf'
c1 = canvas.Canvas(out1, pagesize=A5)
draw_banner1(c1)
c1.save()
print('Banner 1 saved:', out1)

# --- Generate Banner 2 ---
out2 = r'C:\Users\BURMELIN\OneDrive\Desktop\Burmelin Merge\BURMELIN_Banner_Website.pdf'
c2 = canvas.Canvas(out2, pagesize=A5)
draw_banner2(c2)
c2.save()
print('Banner 2 saved:', out2)
