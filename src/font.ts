import * as fs from 'fs';
import * as OpenType from './parsers/opentype';
import * as opentype from 'opentype.js';

export type FontType = 'Core' | 'Type1' | 'TrueType';

export class Font {
    type: FontType;
    name: string;
    fontMetrics: FontMetrics;
    glyphMetrics: GlyphMetrics[];
    characterWidths: CharWidthMap = {};
    // fileData: Buffer;
    // fileOriginalSize: number;
    // fileName?: string;
    buffer: Buffer;
    private openTypeBuffer?: opentype.Font;
    private fontFileArrayBuffer?: ArrayBuffer;
    // fontDescItems: FontDescItem[] = [];

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
        // this.fileOriginalSize = afmData.originalFileSize || 0;
        // this.fileName = afmData.fileName;

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
            //        for a non unicode encoded font you will need a cmap
            for(const charData of afmData.glyphMetrics) {
                const unicodeCharString = String.fromCharCode(charData.charCode);
                this.characterWidths[unicodeCharString] = charData.width;
            }
        }

        // if(this.type == 'TrueType' && afmData.fileData) {
        //     this.fileData = new Buffer(afmData.fileData, 'base64');
        // }
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
    // originalFileSize?: number;
    // fileData?: string;
    // fileName?: string;
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
export interface FontDescItem {
    name: string;
    value: string;
}

export interface ParsedFontData {
    afmData: AFMData;
    openTypeBuffer: opentype.Font;
}

// export class CustomFont extends Font {
//     openTypeBuffer: opentype.Font

//     constructor(name: string, filename: string) {
//         const parsedFontData = OpenType.openCustomFont(filename);
//         super(parsedFontData.afmData.postScriptName || name, parsedFontData.afmData);
//         this.openTypeBuffer = parsedFontData.openTypeBuffer;
//     }
// }
