#!/bin/sh

ICON="images/avatar.webp"

WIDTH=$(identify -ping -format "%w" $ICON)
HEIGHT=$(identify -ping -format "%h" $ICON)
HALF=$((WIDTH/2))

convert -size ${WIDTH}x${HEIGHT} xc:none -fill $ICON -draw "circle ${HALF},${HALF} 0,${HALF}" favicon.webp

convert $ICON -resize 180x180 apple-touch-icon.png
convert favicon.webp -resize 192x192 android-chrome-192x192.png
convert favicon.webp -define icon:auto-resize=16,32,48 -compress zip favicon.ico
convert $ICON -resize 150x150 mstile-150x150.png
convert $ICON og.png
