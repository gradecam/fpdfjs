import * as fs from 'fs';
import * as OpenType from './parsers/opentype';
import * as opentype from 'opentype.js';

export type FontType = 'Standard' | 'Type1' | 'TrueType';

export class Font {
    type: FontType;
    name: string;
    fontMetrics: FontMetrics;
    glyphMetrics: GlyphMetrics[];
    characterWidths: CharWidthMap = {};
    buffer: Buffer;
    protected openTypeBuffer?: opentype.Font;
    protected fontFileArrayBuffer?: ArrayBuffer;

    static createCustomFont(filename: string, familyName: string): Font {
        const parsedFontData = OpenType.openCustomFont(filename);
        const font = new Font(parsedFontData.afmData.postScriptName || familyName, parsedFontData.afmData);
        font.openTypeBuffer = parsedFontData.openTypeBuffer;
        font.fontFileArrayBuffer = fs.readFileSync(filename).buffer;
        return font;
    }

    /**
     * Create a Font object
     * 
     * @param {string}   name     [description]
     * @param {AFMData}  afmData  [description]
     * @param {CMAPData} cmapData [description]
     */
    constructor(name: string, afmData: AFMData, cmapData?: CMAPData) {
        // set the name of the font
        this.name = name;
        this.type = afmData.type;

        // copy in the metrics for the whole font
        this.fontMetrics = afmData.fontMetrics;
        this.glyphMetrics = afmData.glyphMetrics;

        const charCodeToWidth: {[charCode: number]: number} = {};        
        if(cmapData) {
            // use the AFM and CMAP data to map unicode code points to glyph width measurments
            for(const charData of afmData.glyphMetrics) {
                charCodeToWidth[charData.charCode] = charData.width;
            }

            for(const cmapRecord of cmapData.cmap) {
                const unicodeCharString = String.fromCharCode(parseInt(cmapRecord.unicodeCodePoint, 16))
                const encodingCharPoint = parseInt(cmapRecord.encodingCodePoint, 16);
                this.characterWidths[unicodeCharString] = charCodeToWidth[encodingCharPoint];
            }
        } else {
            // FIXME: this logic assumes that the font is encoded in ISO10646-1 (unicode)
            //        to support non unicode encoded fonts we will need to add supports to 
            //        using CMAPs with custom fonts into the font embedding code in fpdf.ts
            for(const charData of afmData.glyphMetrics) {
                const unicodeCharString = String.fromCharCode(charData.charCode);
                this.characterWidths[unicodeCharString] = charData.width;
            }
        }
    }

    /**
     * Get the width that a string of text would have if drawn at a specific size
     * @param {string} text [description]
     */
    getTextWidth(text: string, size: number): number {
        let totalWidth = 0;
        for(const char of text) {
            totalWidth += this.characterWidths[char];
        }
        return totalWidth * size / 1000;
    }

    getEmbeddableFontBuffer(): ArrayBuffer {
        if(!this.fontFileArrayBuffer) {
            throw new Error("Custom fonts must have a font buffer");
        }
        return this.fontFileArrayBuffer;
    }

    get unitsPerEm(): number {
        if(!this.fontMetrics.unitsPerEm) {
            throw new Error("Could not calculate fonts unitsPerEm");
        }

        return this.fontMetrics.unitsPerEm;
    }

    get scale(): number {
        return 1000/this.unitsPerEm;
    }

    charCodeToGlyph(charCode: number) {
        if(!this.openTypeBuffer) {
            throw new Error("Custom fonts must have a font buffer");
        }
        return this.openTypeBuffer.charToGlyph(String.fromCharCode(charCode));
    }

    charCodeToGlyphIndex(charCode: number): number {
        return (<any>this.charCodeToGlyph(charCode)).index;
    }

    getGlyphAdvanceWidth(charCode: number): number {
        return this.charCodeToGlyph(charCode).advanceWidth;
    }

    getScaledGlyphAdvanceWidth(charCode: number): number {
        return this.charCodeToGlyph(charCode).advanceWidth * this.scale;
    }

    encodeText(s: string) {
        // convert the javascript string, which uses little-endian encoded UTF16,
        // into big-endian UTF16 with the PDF spec requires for multi-byte fonts
        const buffer = new Int8Array(s.length*2);
        for(let i = 0; i < s.length; i++) {
            const codePoint = s.charCodeAt(i);
            buffer[i*2] = codePoint >> 8;
            buffer[i*2+1] = codePoint & 255;
        }
        // FIXME: this should be updated to not use nodejs Buffer objects
        //        so it can be used unmodified in the browser
        return (new Buffer(buffer.buffer)).toString('binary');
    }
}

export interface FontVariant {
    bold?: boolean;
    italic?: boolean;
}

// FIXME: include support for all of the standard fonts here including 
//        bold, italic, and bold-italic variants
export type StandardFontFamilyName = 'Helvetica' | 'Courier';

export function isStandardFontFamilyName(name: string) {
    if(name == 'Helvetica' || name == 'Courier') {
        return true;
    }
    return false
}

// making this global to the module so it never has to be loaded more than once
let adobeStandardEncoding: CMAPData | undefined;

export class StandardFont extends Font {
    /**
     * Create a StandardFont object
     * 
     * @param {string}   name     [description]
     * @param {AFMData}  afmData  [description]
     * @param {CMAPData} cmapData [description]
     */
    constructor(familyName: StandardFontFamilyName, variant?: FontVariant) {
        const filename = `fonts/standard-json/${familyName}.afm.json`;
        const afmString = fs.readFileSync(filename, {encoding: 'utf8'});
        const afmData: AFMData = JSON.parse(afmString);

        // lazy load the standard Adobe CMAP so you don't have to take the hit if you never use any standard fonts
        if(!adobeStandardEncoding) {
            const adobeStandardEncodingString = fs.readFileSync('fonts/adobe-standard-encoding.cmap.json', {encoding: 'utf8'});
            adobeStandardEncoding = JSON.parse(adobeStandardEncodingString);
        }

        super(familyName, afmData, adobeStandardEncoding);
        this.type = 'Standard';
    }

    encodeText(s: string) {
        return s;
    }
}

export class CustomFont extends Font {
    type: 'TrueType';

    /**
     * Create a CustomFont object
     * 
     * @param {string}   name     [description]
     * @param {AFMData}  afmData  [description]
     * @param {CMAPData} cmapData [description]
     */
    constructor(familyName: string, fontFileData: ArrayBuffer, variant?: FontVariant) {
        const parsedFontData = OpenType.parseCustomFont(fontFileData);
        super(parsedFontData.afmData.postScriptName || familyName, parsedFontData.afmData);
        this.openTypeBuffer = parsedFontData.openTypeBuffer;
        this.fontFileArrayBuffer = fontFileData;
    }
}


export interface GlyphMetrics {
    charCode: number;
    width: number;
    name: string
}

export interface FontMetrics {
    ascender: number;
    descender: number;
    flags?: number;
    capHeight?: number;
    italicAngle?: number;
    fontBBox?: number[];
    gap?: number;
    lineHeight?: number;
    missingWidth?: number;
    stemV?: number;
    unitsPerEm?: number;
}

export class AFMData {
    type: FontType;
    fontMetrics: FontMetrics;
    glyphMetrics: GlyphMetrics[];
    postScriptName?: string;
}

export class CMAPRecord {
    unicodeCodePoint: string;
    encodingCodePoint: string;
    unicodeName: string;
    postscriptCharName: string;
}

export interface CMAPData {
    cmap: CMAPRecord[];
}


export interface CharWidthMap {
    [char: string]: number
}

// FIXME: there is some obvious overlap here with the FontMetrics. They need to be merged someone into a single format
// export interface FontDescItem {
//     name: string;
//     value: string;
// }

export interface ParsedFontData {
    afmData: AFMData;
    openTypeBuffer: opentype.Font;
}
