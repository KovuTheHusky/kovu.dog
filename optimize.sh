#!/bin/bash

find . -type f -name "*.png" -exec pngquant --force --skip-if-larger --output {} --speed 1 --strip {} \;
find . -type f -name "*.svg" -exec svgcleaner {} {} \;
svgo -f . -r -q --multipass