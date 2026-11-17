#!/usr/bin/env python3
"""Maakt beheer.html (de beheer-app) uit index.html, met een eigen app-profiel in de <head>.
Draai dit na elke wijziging aan index.html:  python3 scripts/make-beheer.py
"""
import os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
R = [
    ('<title>SKB BHV — Online BHV-cursus &amp; examen</title>', '<title>SKB BHV Beheer</title>'),
    ('<link rel="icon" type="image/png" href="/favicon-64.png">', '<link rel="icon" type="image/png" href="/icon-beheer-192.png">'),
    ('<link rel="apple-touch-icon" href="/apple-touch-icon.png">', '<link rel="apple-touch-icon" href="/apple-touch-icon-beheer.png">'),
    ('<link rel="manifest" href="/manifest.json">',
     '<link rel="manifest" href="/manifest-beheer.json">\n<meta name="theme-color" content="#0B0D10">\n'
     '<meta name="apple-mobile-web-app-title" content="SKB Beheer">\n<meta name="mobile-web-app-capable" content="yes">\n'
     '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="robots" content="noindex,nofollow">'),
]
for a, b in R:
    if s.count(a) != 1:
        sys.exit('Niet gevonden of dubbel: ' + a)
    s = s.replace(a, b, 1)
for d in ('', 'public'):
    open(os.path.join(root, d, 'beheer.html'), 'w', encoding='utf-8').write(s)
print('beheer.html bijgewerkt')
