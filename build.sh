#!/bin/sh
./node_modules/typescript/bin/tsc -p .
mkdir -p dist/fonts
cp fonts/adobe-standard-encoding.cmap.json dist/fonts/
cp -a fonts/standard-json dist/fonts/
