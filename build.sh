#!/bin/sh
tsc -p .
mkdir -p dist/fonts
cp -a fonts/custom-json dist/fonts/