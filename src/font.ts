export type FontType = 'Core' | 'Type1' | 'TrueType';

export class Font {
    type: FontType;
    name: string;
    fontMetrics: FontMetrics;
    glyphMetrics: GlyphMetrics[];
    characterWidths: CharWidthMap = {};
    fontIndex: number; // FIXME: this should probably be an optional
    objectNumber: number; // FIXME: this should probably be an optional
    // FIXME: maybe group all the file stuff into it's own object
    fileObjectNumber: number; // FIXME: this should probably be an optional
    fileData: Buffer;
    fileOriginalSize: number;
    // fontDescItems: FontDescItem[] = [];

    constructor(index: number, name: string, afmData: AFMData, cmapData?: CMAPData) {
        // set the name of the font
        this.name = name;
        this.type = afmData.type;

        // copy in the metrics for the whole font
        this.fontMetrics = afmData.fontMetrics;
        this.glyphMetrics = afmData.glyphMetrics;
        // this.fontDescItems = afmData.descItems || [];
        this.fileOriginalSize = afmData.originalFileSize || 0;

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
                // FIXME: is this line being used?
                charCodeToWidth[charData.charCode] = charData.width;

                const unicodeCharString = String.fromCharCode(charData.charCode);
                this.characterWidths[unicodeCharString] = charData.width;
            }
        }

        this.fontIndex = index;
        if(this.type == 'TrueType' && afmData.fileData) {
            // console.log('afmData.fileData:', afmData.fileData);
            this.fileData = new Buffer(afmData.fileData, 'base64');
        }
    }

    /**
     * Get the width that a string of text would have if drawn at a specific size
     * @param {string} text [description]
     */
    getTextWidth(text: string, size: number): number {
        let totalWidth = 0;
        // console.error('this.characterWidths:', this.characterWidths);
        // for(const charString of Object.keys(this.characterWidths)) {
        //     console.error('charWidthCode:', `'${charString}'`, charString.charCodeAt(0), this.characterWidths[charString]);
        // }
        for(const char of text) {
            // console.error('char:', char);
            // console.error('char code:', char.charCodeAt(0));
            // console.error('this.characterWidths[char]:', this.characterWidths[char]);
            totalWidth += this.characterWidths[char];
        }
        return totalWidth * size / 1000;
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
}

export class AFMData {
    type: FontType;
    fontMetrics: FontMetrics;
    glyphMetrics: GlyphMetrics[];
    originalFileSize?: number;
    fileData?: string;
    postScriptName?: string;
    // descItems?: FontDescItem[];
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
