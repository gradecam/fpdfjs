#!/bin/sh
tsc -p .
mkdir -p dist/fonts
cp -a fonts/standard-json dist/fonts/