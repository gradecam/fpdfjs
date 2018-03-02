import * as fs from 'fs';
import * as opentype from 'opentype.js';
import {AFMData, GlyphMetrics, ParsedFontData} from '../font';

/**
 * Open a custom TrueType or OpenType font in the file system
 * and returns it parsed out into a data stucture
 *
 * This will need to be modified for the browser as fs is a node specific API
 * 
 * @param  {string}         fileName The TrueType or OpenType font in the file system to open
 * @return {ParsedFontData}          all the font data we need parsed out into a data structure
 */
export function openCustomFont(fileName: string): ParsedFontData {
    const buffer = fs.readFileSync(fileName);
    return parseCustomFont(buffer.buffer);
}

/**
 * Parse the file data for a TrueType or OpenType font
 * and return it parsed out into a data stucture
 * 
 * @param  {ArrayBuffer}         fontFileData The file data for the font file as an ArrayBuffer
 * @return {ParsedFontData}                   all the font data we need parsed out into a data structure
 */
export function parseCustomFont(fontFileData: ArrayBuffer): ParsedFontData {
    const font = opentype.parse(fontFileData);
    // opentype.js can't handle some of the complexity in OpenSans (and probably other advanced fonts) if this table is
    // in there. It will fail on calls to toArrayBuffer because it doesn't know how to pack this table back up into
    // a new font file. We don't need this data so we're dust deleting it
    delete font.tables.gsub;

    const scale = 1000/font.unitsPerEm;
    // const start = Date.now();
    // const minify = false;
    let glyphMetrics: GlyphMetrics[];
    // const fontBuffer = font.toArrayBuffer();
    glyphMetrics = [];
    for(const index of Object.keys((<any>font).glyphs.glyphs)) {
        const glyph: opentype.Glyph = (<any>font).glyphs.glyphs[index];
        if(!glyph.unicode) {continue;}

        glyphMetrics.push({charCode: glyph.unicode, width: Math.round(glyph.advanceWidth * scale), name: glyph.name});
    }

    // there are three sets of font ascenders and descenders in some fonts
    // 
    // 1. ascender and descender from the hhea table
    // 2. sTypoAscender and sTypoDescender from the os2 table
    // 3. usWinAscent and usWinDescent from the os2 table
    // 
    // I think fpdf uses the sTypo* varients but we are using whatever OpenType.js
    // is choosing to pu on the root object. This appears to be the ones from the hhea 
    // table. In the cases we are looking this gives us compatibility with PDFKit.
    // If we decide we want give explicit access to these values sometime we should
    // make it an option or offer all three using the following
    // 
    // Also notice that the decent value for 1 and 2 appear to be negative while 3 is postiive
    // 
    // 2. font.tables.os2.sTypoAscender and font.tables.os2.sTypoDescender
    // 3. font.tables.os2.usWinAscent and font.tables.os2.usWinDescent
    const fontAscender = font.tables.os2.usWinAscent;
    const fontDescender = font.tables.os2.usWinDescent * -1;
    // const fontAscender = font.ascender;
    // const fontDescender = font.descender;

    const familyClass = (font.tables.os2.sFamilyClass != undefined ? parseInt(font.tables.os2.sFamilyClass, 10) : 0) >> 8;
    let flags = 0;
    if(font.tables.post.isFixedPitch) { flags |= 1 << 0; }
    if((1 <= familyClass) && (familyClass <= 7)) { flags |= 1 << 1; }
    flags |= 1 << 2;  // assume the font uses non-latin characters
    if(familyClass == 10) { flags |= 1 << 3; }
    if(font.tables.head.macStyle.italic) { flags |= 1 << 6; }    

    const afmData: AFMData = {
        type: 'TrueType',
        postScriptName: font.names.postScriptName.en,
        fontMetrics: {
            ascender: fontAscender * scale,
            descender: fontDescender * scale,
            flags,
            capHeight: font.tables.os2.sCapHeight * scale,
            italicAngle: font.tables.post.italicAngle,
            missingWidth: font.glyphs.get(0).advanceWidth * scale,
            fontBBox: [
                font.tables.head.xMin * scale,
                font.tables.head.yMin * scale,
                font.tables.head.xMax * scale,
                font.tables.head.yMax * scale,
            ],
            // I have no idea know how to calculate this or what it does
            // but this is what PDFKit does so it's what we're doing :)
            stemV: 0,
            unitsPerEm: font.unitsPerEm
        },
        glyphMetrics: glyphMetrics,
    };
    return {
        afmData,
        openTypeBuffer: font
    }
}

export function minifyFont(bigFont: opentype.Font, scale: number): {font: opentype.Font; glyphMetrics: GlyphMetrics[]} {
    const glyphMap: {[index: string]: opentype.Glyph} = {
          '0':  bigFont.charToGlyph(String.fromCharCode(0)), // notDef glyph
          '32': bigFont.charToGlyph(String.fromCharCode(32)), // space
    }
    const mapping: {[index: string]: number} = { '0': 0, '32': 32 };

    const glyphMetrics: GlyphMetrics[] = [];
    for(let i = 33; i < 256; i++) {
          const code = i;
          if(code in mapping || code < 33) {
            continue;
          }

          const glyph = bigFont.charToGlyph(String.fromCharCode(code));

          mapping[`${code}`] = i;
          glyphMap[code] = glyph;
          glyphMetrics.push({charCode: glyph.unicode, width: Math.round(glyph.advanceWidth * scale), name: glyph.name});
    }

    const glyphs = [];
    for (const pos in glyphMap) {
          glyphs.push(glyphMap[pos])
    }

    return {
        font: new opentype.Font({
            familyName: bigFont.names.fontFamily.en,
            styleName: bigFont.names.fontSubfamily.en,
            unitsPerEm: bigFont.unitsPerEm,
            ascender: bigFont.ascender,
            descender: bigFont.descender,
            glyphs: glyphs
        }),
        glyphMetrics: glyphMetrics
    }
}
