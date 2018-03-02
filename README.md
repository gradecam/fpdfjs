# fpdfjs
A TypeScript library for generating PDFs

* The initial version of this library is a port from [FPDF](http://fpdf.org).
* It may or may not be ready for production use, depending on your needs

## Motivation

We were using PDFKit for a project that was doing very high volume PDF creation. Unfortunately
PDFKit's (otherwise excellent) font handling code was just too slow to keep up. In order to speed
things up we ported over the less robust but much faster implementation from FPDF and tFPDF.
The result is something that is much faster if it does what you want, but may not do what you want.

## Instructions

	npm install --save fpdfjs

## Usage

See `bin/examples`

## What's Done

* Basic handling of text, standard fonts, and custom fonts
* Some vector operations

## What's not Done

* Lots and lots of stuff
