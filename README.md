# fpdfjs
A TypeScript library for generating PDFs

* The initial version of this library is a port from [FPDF](http://fpdf.org).
* It is not ready for production use

## Top Priorities
* Generate the font.afm.json files programatically. The current ones were cobbled together by hand.
    - The hardest part will be extracting the glyph data programatically. The current ones were created with the FPDF tools and then embedded into the font.
* Support embedding CMAPs properly.
* Test on a wide variety of fonts.

