import * as opentype from 'opentype.js';
// import * as fontkit from 'fontkit';

export function convertToAFMJS(fontName: string) {
	var font = opentype.loadSync(fontName);
	// var fontKitFont = fontkit.openSync(fontName);
	console.log('font loaded!');

	console.log('font.ascender:', font.tables.os2.sTypoAscender);
	console.log('font.descender:', font.descender);
	console.log('font.unitsPerEm:', font.unitsPerEm);
	// console.log('font.encoding:', font.encoding);
	console.log('font.numGlyphs:', font.numGlyphs);
	// console.log(Object.keys((<any>font.glyphs).glyphs));
	// console.log(Object.keys(font.forEachGlyph()));
	// for(const glyph of font.glyphs) {
	// 	console.log(glyph.name);
	// }
}
