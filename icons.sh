#!/bin/bash

ICON="images/avatar.webp"

magick -size `identify -ping -format "%wx%h" $ICON` xc:none -fill $ICON -draw "circle %[fx:w/2],%[fx:h/2] 0,%[fx:min(w/2,h/2)]" favicon.webp

magick $ICON -resize 180x180 apple-touch-icon.png
magick favicon.webp -resize 192x192 android-chrome-192x192.png
magick favicon.webp -define icon:auto-resize=16,32,48 -compress zip favicon.ico
magick $ICON -resize 150x150 mstile-150x150.png
magick $ICON og.png
