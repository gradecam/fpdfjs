import * as fs from 'fs';
import * as zlib from 'zlib';
import * as opentype from 'opentype.js';
import {AFMData} from '../font';

var arrayBufferToBuffer = require('arraybuffer-to-buffer');

export function convertToAFMJS(fileName: string) {
    const font = opentype.loadSync(fileName);
    // opentype.js can't handle some of the copmlexity in OpenSans (and probably other advanced fonts) if this table is
    // in there. It will fail on calls to toArrayBuffer because it doesn't know how to pack this table back up into
    // a new font file. We don't need this data so we're dust deleting it
    delete font.tables.gsub;

    const start = Date.now();
    const minifiedFont = minifyFont(font);
    const fontBuffer = minifiedFont.toArrayBuffer();
    // const fontBuffer = font.toArrayBuffer();
    const fileContents = fs.readFileSync(fileName);
    console.log('font loaded!');

    const scale = 1000/font.unitsPerEm;

    console.log(Object.keys(font.tables));
    // console.log(zlib.deflateSync(fileContents).toString('base64'));

    const afmData: AFMData = {
        type: 'TrueType',
        fontMetrics: {
            ascender: Math.round(font.tables.os2.sTypoAscender * scale),
            descender: Math.round(font.tables.os2.sTypoDescender * scale),
            flags: font.tables.head.flags,
            capHeight: Math.round(font.tables.os2.sCapHeight * scale),
            italicAngle: Math.round(font.tables.post.italicAngle),
            fontBBox: [
                Math.round(font.tables.head.xMin * scale),
                Math.round(font.tables.head.yMin * scale),
                Math.round(font.tables.head.xMax * scale),
                Math.round(font.tables.head.yMax * scale),
            ]
        },
        glyphMetrics: [],
        originalFileSize: fontBuffer.byteLength,
        // originalFileSize: fileContents.length,
        fileData: zlib.deflateSync(arrayBufferToBuffer(fontBuffer)).toString('base64')
        // fileData: zlib.deflateSync(fileContents).toString('base64')
    };

    // console.log('font.ascender:', Object.keys((<any>font).glyphs.glyphs));
    for(const index of Object.keys((<any>font).glyphs.glyphs)) {
        const glyph: opentype.Glyph = (<any>font).glyphs.glyphs[index];
        if(!glyph.unicode) {continue;}

        afmData.glyphMetrics.push({charCode: glyph.unicode, width: Math.round(glyph.advanceWidth * scale), name: glyph.name});
    }

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

function minifyFont(bigFont: opentype.Font): opentype.Font {
    const glyphMap: {[index: string]: opentype.Glyph} = {
          '0':  bigFont.charToGlyph(String.fromCharCode(0)), // notDef glyph
          '32': bigFont.charToGlyph(String.fromCharCode(32)), // space
    }
    const mapping: {[index: string]: number} = { '0': 0, '32': 32 };

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
          console.log(glyph);
          console.log((<any>glyph).index);

          mapping[`${code}`] = i;
          glyphMap[code] = glyph;
    }

    const glyphs = [];
    for (const pos in glyphMap) {
          glyphs.push(glyphMap[pos])
    }

    return new opentype.Font({
        familyName: bigFont.names.fontFamily.en,
        styleName: bigFont.names.fontSubfamily.en,
        unitsPerEm: bigFont.unitsPerEm,
        ascender: bigFont.ascender,
        descender: bigFont.descender,
        glyphs: glyphs
    });
}
