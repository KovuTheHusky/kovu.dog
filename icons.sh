#!/bin/sh

ICON="images/avatar.webp"

WIDTH=$(identify -ping -format "%w" $ICON)
HEIGHT=$(identify -ping -format "%h" $ICON)
HALF=$((WIDTH/2))

magick -size ${WIDTH}x${HEIGHT} xc:none -fill $ICON -draw "circle ${HALF},${HALF} 0,${HALF}" favicon.webp

magick $ICON -resize 180x180 apple-touch-icon.png
magick favicon.webp -resize 192x192 android-chrome-192x192.png
magick favicon.webp -define icon:auto-resize=16,32,48 -compress zip favicon.ico
magick $ICON -resize 150x150 mstile-150x150.png
magick $ICON og.png
