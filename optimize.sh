#!/bin/bash

for FILE in $(find . \( -path ./_site -o -path ./node_modules \) -prune -false -o -iname "*.svg"); do 
    svgcleaner "$FILE" "$FILE"
done
svgo -f . -r -q --multipass

for FILE in $(find . \( -path ./_site -o -path ./node_modules \) -prune -false -o -iname "*.jpeg" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.tif" -o -iname "*.tiff"); do 
    cwebp "$FILE" -o "${FILE%.*}".webp;
done

for FILE in $(find . \( -path ./_site -o -path ./node_modules \) -prune -false -o -iname "*.png"); do 
    pngquant --force --skip-if-larger --output "$FILE" --speed 1 --strip "$FILE"
done
