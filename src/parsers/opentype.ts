import * as fs from 'fs';
import * as zlib from 'zlib';
import * as opentype from 'opentype.js';
import {AFMData, GlyphMetrics, ParsedFontData} from '../font';

var arrayBufferToBuffer = require('arraybuffer-to-buffer');

export function openCustomFont(fileName: string): ParsedFontData {
    console.log('fileName:', fileName);
    const font = opentype.loadSync(fileName);
    // opentype.js can't handle some of the complexity in OpenSans (and probably other advanced fonts) if this table is
    // in there. It will fail on calls to toArrayBuffer because it doesn't know how to pack this table back up into
    // a new font file. We don't need this data so we're dust deleting it
    delete font.tables.gsub;

    const scale = 1000/font.unitsPerEm;
    const start = Date.now();
    const minify = false;
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
        // originalFileSize: fontBuffer.byteLength,
        // originalFileSize: fileContents.length,
        // fileData: zlib.deflateSync(arrayBufferToBuffer(fontBuffer)).toString('base64'),
        // fileData: zlib.deflateSync(fileContents).toString('base64')
    };
    console.log(`##############> fpdfjs font metrics, name: ${font.names.postScriptName.en}, unitsPerEm: ${font.unitsPerEm}, scale: ${scale}, ascent: ${fontAscender}, ascender: ${afmData.fontMetrics.ascender}`);
    return {
        afmData,
        openTypeBuffer: font
    }

    // afmData.glyphMetrics = glyphMetrics;
    // if(minify) {
    //     afmData.glyphMetrics = minGlyphMetrics;
    // } else {
    //     for(const index of Object.keys((<any>font).glyphs.glyphs)) {
    //         const glyph: opentype.Glyph = (<any>font).glyphs.glyphs[index];
    //         if(!glyph.unicode) {continue;}

    //         afmData.glyphMetrics.push({charCode: glyph.unicode, width: Math.round(glyph.advanceWidth * scale), name: glyph.name});
    //     }
    // }

    // console.log('font.ascender:', Object.keys((<any>font).glyphs.glyphs));

    // console.log('afmData:', JSON.stringify(afmData, null, 4));

    // console.log('font.ascender:', font.tables.os2.sTypoAscender);
    // console.log('font.descender:', font.descender);
    // console.log('font.unitsPerEm:', font.unitsPerEm);
    // // console.log('font.encoding:', font.encoding);
    // console.log('font.numGlyphs:', font.numGlyphs);
    // console.log(Object.keys((<any>font.glyphs).glyphs));
    // console.log(Object.keys(font.forEachGlyph()));
    // for(const glyph of font.glyphs) {
    //  console.log(glyph.name);
    // }

    // const filename = `./fonts/custom-json/opensans-regular.afm.json`;
    // fs.writeFile(filename, JSON.stringify(afmData, null, 4), (err) => {
    //     if(err) {
    //         throw new Error(`saving font data to file ${filename} failed`);
    //     }
    //     console.warn(`font data saved to ${filename}`);
    // });

}

export function convertToAFMJS(fileName: string) {
    const font = opentype.loadSync(fileName);
    // opentype.js can't handle some of the complexity in OpenSans (and probably other advanced fonts) if this table is
    // in there. It will fail on calls to toArrayBuffer because it doesn't know how to pack this table back up into
    // a new font file. We don't need this data so we're dust deleting it
    delete font.tables.gsub;

    const scale = 1000/font.unitsPerEm;
    const start = Date.now();
    const minify = false;
    let fontBuffer;
    let glyphMetrics: GlyphMetrics[];
    if(minify) {
        const minifyResult = minifyFont(font, scale);
        glyphMetrics = minifyResult.glyphMetrics;        
        fontBuffer = minifyResult.font.toArrayBuffer();
    } else {
        fontBuffer = font.toArrayBuffer();
        glyphMetrics = [];
        for(const index of Object.keys((<any>font).glyphs.glyphs)) {
            const glyph: opentype.Glyph = (<any>font).glyphs.glyphs[index];
            if(!glyph.unicode) {continue;}

            glyphMetrics.push({charCode: glyph.unicode, width: Math.round(glyph.advanceWidth * scale), name: glyph.name});
        }
    }

    const fileContents = fs.readFileSync(fileName);
    console.log('font loaded!');


    console.log(Object.keys(font.tables));
    // console.log(zlib.deflateSync(fileContents).toString('base64'));

    const afmData: AFMData = {
        type: 'TrueType',
        postScriptName: font.names.postScriptName.en,
        fontMetrics: {
            ascender: Math.round(font.tables.os2.sTypoAscender * scale),
            descender: Math.round(font.tables.os2.sTypoDescender * scale),
            flags: font.tables.head.flags,
            capHeight: Math.round(font.tables.os2.sCapHeight * scale),
            italicAngle: Math.round(font.tables.post.italicAngle),
            missingWidth: Math.round(font.glyphs.get(0).advanceWidth * scale),
            fontBBox: [
                Math.round(font.tables.head.xMin * scale),
                Math.round(font.tables.head.yMin * scale),
                Math.round(font.tables.head.xMax * scale),
                Math.round(font.tables.head.yMax * scale),
            ]
        },
        glyphMetrics: [],
        // originalFileSize: fontBuffer.byteLength,
        // originalFileSize: fileContents.length,
        // fileData: zlib.deflateSync(arrayBufferToBuffer(fontBuffer)).toString('base64'),
        // fileData: zlib.deflateSync(fileContents).toString('base64')
    };

    afmData.glyphMetrics = glyphMetrics;
    // if(minify) {
    //     afmData.glyphMetrics = minGlyphMetrics;
    // } else {
    //     for(const index of Object.keys((<any>font).glyphs.glyphs)) {
    //         const glyph: opentype.Glyph = (<any>font).glyphs.glyphs[index];
    //         if(!glyph.unicode) {continue;}

    //         afmData.glyphMetrics.push({charCode: glyph.unicode, width: Math.round(glyph.advanceWidth * scale), name: glyph.name});
    //     }
    // }

    // console.log('font.ascender:', Object.keys((<any>font).glyphs.glyphs));

    // console.log('afmData:', JSON.stringify(afmData, null, 4));

    // console.log('font.ascender:', font.tables.os2.sTypoAscender);
    // console.log('font.descender:', font.descender);
    // console.log('font.unitsPerEm:', font.unitsPerEm);
    // // console.log('font.encoding:', font.encoding);
    // console.log('font.numGlyphs:', font.numGlyphs);
    // console.log(Object.keys((<any>font.glyphs).glyphs));
    // console.log(Object.keys(font.forEachGlyph()));
    // for(const glyph of font.glyphs) {
    //  console.log(glyph.name);
    // }

    const filename = `./fonts/custom-json/opensans-regular.afm.json`;
    fs.writeFile(filename, JSON.stringify(afmData, null, 4), (err) => {
        if(err) {
            throw new Error(`saving font data to file ${filename} failed`);
        }
        console.warn(`font data saved to ${filename}`);
    });

}

function minifyFont(bigFont: opentype.Font, scale: number): {font: opentype.Font; glyphMetrics: GlyphMetrics[]} {
    const glyphMap: {[index: string]: opentype.Glyph} = {
          '0':  bigFont.charToGlyph(String.fromCharCode(0)), // notDef glyph
          '32': bigFont.charToGlyph(String.fromCharCode(32)), // space
    }
    const mapping: {[index: string]: number} = { '0': 0, '32': 32 };

    const glyphMetrics: GlyphMetrics[] = [];
    // for(let i = 33; i < 128; i++) {
    for(let i = 33; i < 256; i++) {
    // for(let i = 127; i > 32; i--) {
    // for(let i = 65; i < 90; i++) {
    // for(let i = 97; i < 122; i++) {
          const code = i;
          if(code in mapping || code < 33) {
            continue;
          }

          const glyph = bigFont.charToGlyph(String.fromCharCode(code));
          // console.log(glyph);
          // console.log((<any>glyph).index);

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
