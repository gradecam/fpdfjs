import * as fs from 'fs';
import * as zlib from 'zlib';
import * as StringDecoder from 'string_decoder';
import * as opentype from 'opentype.js';
import * as font from './font';
import * as courier from '../fonts/courier.afm.json';
import * as helvetica from '../fonts/helvetica.afm.json';
import * as times from '../fonts/times.afm.json';
import * as adobeStandardEncoding from '../fonts/adobe-standard-encoding.cmap.json';

const typedAdobeStandardEncoding: font.CMAPData = <any>adobeStandardEncoding;

interface FontRef {
    font: font.Font;
    index: number;
    objectNumber?: number;
    fileObjectNumber?: number;
    subsettedUncompressedFileSize?: number;
    subsettedCompressedFileData?: Buffer;
}

export interface TextOptions {
    // lineBreak?: boolean;
    // underline?: boolean;
    // strike?: boolean;
    // height?: number;
    width?: number;
    align?: 'right' | string;
    characterSpacing?: number;
}

export type LineCapStyle = 'BUTT' | 'ROUND' | 'SQUARE';
const KAPPA = 4.0 * ((Math.sqrt(2) - 1.0) / 3.0);

function formatFloat(value: number): string {
    return value.toFixed(3);
}

export class FPdf {

    /**
     * The version of the PDF spec that we are targeting. The minimum version that supports the features
     * we support should be used
     * 
     * @type {String}
     */
    readonly pdfVersion = '1.3';

    /**
     * PDF documents contain elements called "objects". They are numbered. This is to keep track of the
     * current number
     * 
     * @type {Number}
     */
    private _currentObjectNumber = 2;
    private _currentFontKey: string | null = null;
    private _chosenFontKey: string | null = null;
    private _currentFontSize = 10;
    private _chosenFontSize = 10;

    private _pages: Page[] = [];
    private _objects: PdfObject[] = [];
    private _fonts: { [fontName: string]: FontRef } = {};
    private _coreFonts: { [fontName: string]: {name: string; data: font.AFMData} } = {};

    private _pen = new Pen();

    private _metadata: {name: string; value: string}[] = [];

    private _buffer = '';
    private _subset: {[index: number]: number} = {};

    private _standardPageSizes: {[typeName: string]: {width: number; height: number}} = {
        a3: {width: 841.89, height: 1190.55},
        a4: {width: 595.28, height: 841.89},
        a5: {width: 420.94, height: 595.28},
        letter: {width: 612, height: 792},
        legal: {width: 612, height: 1008},
    }


    constructor() {
        this._coreFonts['helvetica'] = {name: 'Helvetica', data:  <any>helvetica};
        this._coreFonts['courier'] = {name: 'Courier', data:  <any>courier};
        this._coreFonts['times'] = {name: 'Times-Roman', data:  <any>times};
    }

    get currentFontMetrics() {
        if(!this._chosenFont) {
            throw new Error('font metrics can not be retreived until a font is chosen');
        }

        const currentFont = this._chosenFont;
        // console.log('=============> metrics: ', currentFont.fontMetrics.ascender, this._chosenFontSize);
        return {
            ascender: currentFont.fontMetrics.ascender / 1000 * this._chosenFontSize,
            descender: currentFont.fontMetrics.descender / 1000 * this._chosenFontSize,
            gap: 0,
            lineHeight: (currentFont.fontMetrics.ascender - currentFont.fontMetrics.descender) / 1000 * this._chosenFontSize
        };
    }

    get _currentPage() {
        return this._pages[this._pages.length - 1];
    }

    get _chosenFont(): font.Font | null {
        if(!this._chosenFontKey) {
            return null;
        }
        return this._fonts[this._chosenFontKey].font;
    }

    close() {
        if(this._pages.length == 0) {
            this.addPage();
        }

        // Close document
        this._enddoc();
    }

    addPage(size?: any, orientation?: any, rotation?: any) {

        // Start a new page
        const curFontKey = this._chosenFontKey
        this._beginpage(size, orientation, rotation);

        // Set line cap style to square
        // this._putToCurrentPage('2 J');

        // Set line width
        this._putToCurrentPage(`${formatFloat(this._pen.lineWidth)} w`);

        // Set font
        // if(curFontKey && this._currentFontSize) {
        //     this.setFont(curFontKey, this._currentFontSize);
        // }
    }

    strokeColor(red: number, green: number, blue: number) {
        this.$strokeColor(red/255, green/255, blue/255);
    }

    getTextWidth(text: string): number {
        if(!this._chosenFont || !this._chosenFontSize) {
            throw new Error("getStringWidth: A font and size must be set before measuring text");
        }

        return this._chosenFont.getTextWidth(text, this._chosenFontSize);
    }

    drawOptsToPdfOp(opts?: DrawOpts): string {
        return opts && opts.fill && opts.stroke ? 'B' : (opts && opts.fill ? 'f' : 'S');
    }

    /**
     * Send a command to the PDF to fill in the current path
     */
    fill(): FPdf {
        this.$fillStroke({fill: true});
        return this;
    }

    /**
     * Send a command to the PDF to stroke the current path
     */
    stroke(): FPdf {
        this.$S();
        return this;
    }

    /**
     * Send a command to the PDF to stroke the current path
     */
    fillAndStroke(): FPdf {
        this.$fillStroke({fill: true, stroke: true});
        return this;
    }

    /**
     * Stream out a description of a rectangle to the PDF. Nothing will actually be drawn until
     * a fill or stroke command goes out after it
     * @param x The x coordinate to draw at
     * @param y The y coordiante to draw at
     * @param w The width of the rectangle
     * @param h The height of the rectangle
     */
    rect(x: number, y: number, w: number, h: number): FPdf {
        ({x, y} = this._transformPoint(x, y));
        this.$rect(x, y, w, h);
        return this;
    }

    /**
     * Stream out a description of a rounded rectangle to the PDF. Nothing will actually be drawn until
     * a fill or stroke command goes out after it
     * @param x The x coordinate to draw at
     * @param y The y coordiante to draw at
     * @param w The width of the rectangle
     * @param h The height of the rectangle
     */
    roundedRect(x: number, y: number, w: number, h: number, r: number = 0): FPdf {
        // ({x, y} = this._transformPoint(x, y));
        r = Math.min(r, 0.5 * w, 0.5 * h);
        const c = r * (1.0 - KAPPA);
        this.moveTo(x + r, y);
        this.lineTo(x + w -r, y);
        this.bezierCurveTo(x + w - c, y, x + w, y + c, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.bezierCurveTo(x + w, y + h - c, x + w - c, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.bezierCurveTo(x + c, y + h, x, y + h - c, x, y + h - r);
        this.lineTo(x, y + r);
        this.bezierCurveTo(x, y + c, x + c, y, x + r, y);
        this.closePath();

        // @closePath()
        return this;
    }

    /**
     * Draw a rect immediately. Don't wait for a fill or stroke command
     * @param x The x coordinate to draw at
     * @param y The y coordiante to draw at
     * @param w The width of the rectangle
     * @param h The height of the rectangle
     * @param opts Whether to fill or stoke or both
     */
    drawRect(x: number, y: number, w: number, h: number, opts?: DrawOpts): FPdf {
        ({x, y} = this._transformPoint(x, y));
        this.$rect(x, y, w, h);
        this.$fillStroke(opts);
        return this;
    }

    moveTo(x: number, y: number): FPdf {
        ({x, y} = this._transformPoint(x, y));
        this.$m(x, y);
        return this;
    }

    lineTo(x: number, y: number): FPdf {
        ({x, y} = this._transformPoint(x, y));
        this.$l(x, y);
        return this;
    }

    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
        ({x: cp1x, y: cp1y} = this._transformPoint(cp1x, cp1y));
        ({x: cp2x, y: cp2y} = this._transformPoint(cp2x, cp2y));
        ({x, y} = this._transformPoint(x, y));
        this.$c(cp1x, cp1y, cp2x, cp2y, x, y);
    }

    lineWidth(width: number): void {
        this.$w(width);
    }

    lineCap(style: LineCapStyle): void {
        this.$J(style);
    }

    closePath(): void {
        this.$h();
    }

    setCharacterSpacing(advanceWidth: number): void {
        this.$Tc(advanceWidth);
    }

    save() {
        this.$q();
    }

    restore() {
        this.$Q();
    }

    /**
     * move the pen to (x, y)
     * @param {number} x the horizontal coordinate to move the pen to
     * @param {number} y the vertical coordinate to move the pen to
     */
    $m(x: number, y: number): void {
        this._putToCurrentPage(`${formatFloat(x)} ${formatFloat(y)} m`);
    }

    /**
     * draw a line from the current pen positon to to (x, y)
     * @param {number} x the horizontal coordinate to draw the line to
     * @param {number} y the vertical coordinate to draw the line to
     */
    $l(x: number, y: number): void {
        this._putToCurrentPage(`${formatFloat(x)} ${formatFloat(y)} l`);
    }

    $c(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
        this._putToCurrentPage(`${formatFloat(cp1x)} ${formatFloat(cp1y)} ${formatFloat(cp2x)} ${formatFloat(cp2y)} ${formatFloat(x)} ${formatFloat(y)} c`);
    }

    $h(): void {
        this._putToCurrentPage('h');
    }

    /**
     * save the current graphics state
     */
    $q(): void {
        this._putToCurrentPage('q');
    }

    /**
     * restore the previous graphics state
     */
    $Q(): void {
        this._putToCurrentPage('Q');
    }

    /**
     * stroke the current path (made with moveTo, lineTo, etc)
     */
    $S(): void {
        this._putToCurrentPage(' S');   
    }

    /**
     * set the LineCap style
     * @param {LineCapStyle} style [description]
     */
    $J(style: LineCapStyle): void {
        this._putToCurrentPage(`${style} S`);      
    }

    /**
     * sets the current line width
     * @param {number} width the width to use in points for the pen
     */
    $w(width: number): void {
        this._putToCurrentPage(`${formatFloat(width)} w`);
    }

    /**
     * use charachter spacing with the given advance width
     * @param {number} advanceWidth the amount to advance the pen after each character
     */
    $Tc(advanceWidth: number): void {
        this._putToCurrentPage(`${formatFloat(advanceWidth)} Tc`);
    }

    $rect(x: number, y: number, w: number, h: number): void {
        this._putToCurrentPage(`${formatFloat(x)} ${formatFloat(y)} ${formatFloat(w)} ${formatFloat((h*-1))} re`);
    }

    $fillStroke(opts?: DrawOpts): void {
        const op = this.drawOptsToPdfOp(opts);
        this._putToCurrentPage(op);
    }

    $strokeColor(red: number, green: number, blue: number): void {
        this._putToCurrentPage(`${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} RG `);
    }

    addCustomFont(family: string, style: string, font: font.Font) {
        const fontKey = this._getFontKey(family, style);

        // if the font is already loaded then we are done
        if(this._fonts[fontKey]) {
            return;
        }

        const fontIndex = Object.keys(this._fonts).length + 1;
        this._fonts[fontKey] = {
            font: font,
            index: fontIndex
        };
    }

    addFont(fontKey: string): void;
    addFont(family: string, style: string): void;
    // addFont(family: string, style: string, filename: string): void;
    addFont(...args: any[]): void {
        let fontKey: string;
        let filename: string | undefined;

        if(args.length == 1) {
            fontKey = args[0];
        } else if(args.length == 2) {
            fontKey = this._getFontKey(args[0], args[1]);
        } else if(args.length == 3) {
            fontKey = this._getFontKey(args[0], args[1]);
            filename = args[2];
        } else {
            throw new Error(`add requires one, two or three aguments. You passed in ${args.length}`);
        }

        // if the font is already loaded then we are done
        if(this._fonts[fontKey]) {
            return;
        }

        const fontIndex = Object.keys(this._fonts).length + 1;
        if(this._coreFonts[fontKey]) {
            this._fonts[fontKey] = {
                font: new font.Font(this._coreFonts[fontKey].name, this._coreFonts[fontKey].data, typedAdobeStandardEncoding),
                index: fontIndex
            }
        } else {
            throw new Error('this needs to use the new api for adding fonts (addCustomFont)');
            // FIXME: we don't want to do .afm.json fonts for custom fonts anymore
            //   1. just pass in the file name of the TTF
            //   2. parse out all of the AFM data on the fly
            //   3. initialize an opentype instance with the font data and store it in a member variable
            // if(!filename) {
            //     throw new Error('you must pass filename for the path to the TrueType file that you want to use for this custom font');
            // }
            // const afmDataBuffer = fs.readFileSync(filename);
            // const afmData: font.AFMData = JSON.parse(afmDataBuffer.toString())
            // this._fonts[fontKey] = {
            //     font: new font.Font(afmData.postScriptName || args[0], afmData),
            //     index: fontIndex
            // }
        }
    }

    // FIXME: this is only used in once place now, I think it would be better inlined
    // _extractSetFontArgs(args: any[]): {fontKey: string; size: number} {
    //     let fontKey: string;
    //     let size: number;
    //     if(args.length == 1) {
    //         fontKey = this._getFontKey(args[0], '');
    //         size = this._currentFontSize;
    //     } if(args.length == 2) {
    //         fontKey = this._getFontKey(args[0], args[1]);
    //         size = this._currentFontSize;
    //     } else if(args.length == 3) {
    //         fontKey = this._getFontKey(args[0], args[1]);
    //         size = args[2];
    //     } else {
    //         throw new Error(`setFont requires either two or three aguments. You passed in ${args.length}`);
    //     }

    //     return {fontKey: fontKey, size: size};
    // }

    // // setFont(fontKey: string, size: number): void;
    // setFont(family: string): void;
    // // setFont(family: string, size: number): void;
    // setFont(family: string, style: string): void;
    // setFont(family: string, style: string, size: number): void;
    // setFont(...args: any[]): void {
    setFont(family: string, style: string = '', size?: number): void {
        // console.log('setFont():', family, style, size);
        // const {fontKey, size} = this._extractSetFontArgs(args);
        const fontKey = this._getFontKey(family, style);
        size = size || this._chosenFontSize;

        // if this is already the current font just bail
        if(fontKey == this._currentFontKey && size == this._currentFontSize) {
            return;
        }

       // load the font data if it's not already loaded
        if(!this._fonts[fontKey]) {
            // it it's one of the standard PDF fonts we can just add it
            if(this._coreFonts[fontKey]) {
                this.addFont(fontKey);
            } else {
                throw new Error(`The font '${fontKey}'' has not been loaded yet. You must load it with addCustomFont before calling setFont`);
            }
        }

        // this._currentFontKey = fontKey;
        // this._currentFontSize = size;

        // if(this._pages.length > 0) {
        //     const formattedFontSize = size.toFixed(2);
        //     this._putToCurrentPage(`BT /F${this._fonts[fontKey].index} ${formattedFontSize} Tf ET`);
        // } else {
        // }

        this._chosenFontKey = fontKey;
        this._chosenFontSize = size;
    }

    setFontSize(size: number) {
        this._chosenFontSize = size;
        // console.log('this._chosenFontSize:', this._chosenFontSize);
    }


    _encodeText(s: string) {
        // this could definitely use some comments
        const buffer = new Int8Array(s.length*2);
        for(let i = 0; i < s.length; i++) {
            const codePoint = s.charCodeAt(i);
            buffer[i*2] = codePoint >> 8;
            buffer[i*2+1] = codePoint & 255;
            this._subset[codePoint] = codePoint;
        }
        return (new Buffer(buffer.buffer)).toString('binary');
    }

    text(x: number, y: number, text: string, opts: TextOptions = {}) {
        if(text == 'Student Name:') {
            console.log('text:', text, x, y, opts);
        }
        
        // console.log('this._chosenFontSize:', this._chosenFontSize);
        if(!this._chosenFont) {
            throw new Error('No font has been set');
        }

        ({x, y} = this._transformPoint(x, y));
        if(text == 'Student Name:') {
            console.log('transformed point:', x, y);
            // console.log(`${y} = ${this.page.height} - ${y} - (${this._font.ascender} / 1000 * ${this._fontSize})`);
        }


        if(opts.align == 'right' && opts.width) {
            const textWidth = this.getTextWidth(text);
            x = x + opts.width - textWidth;
        }

        this._putToCurrentPage('BT');
        // by default this PDF command will use the y value for the font baseline
        // we want to move it down so that the y value given here becomes the the top
        // console.log('text():', text, x, y, this._chosenFont.fontMetrics.ascender * this._currentFontSize / 1000, this._chosenFont.fontMetrics.descender * this._currentFontSize / 1000);
        y -= this._chosenFont.fontMetrics.ascender * this._chosenFontSize / 1000;
        if(text == 'Student Name:') {
            console.log('height adjustment:', y, `${this._chosenFont.fontMetrics.ascender} * ${this._chosenFontSize} / 1000`);
            // console.log(`${y} = ${this.page.height} - ${y} - (${this._font.ascender} / 1000 * ${this._fontSize})`);
        }

        // console.log('text():', text, x, y, this._chosenFontSize, this._currentFontSize, this._chosenFontKey, this._currentFontKey);
        if(this._chosenFontKey && (this._chosenFontSize != this._currentFontSize || this._chosenFontKey != this._currentFontKey)) {
            const formattedFontSize = formatFloat(this._chosenFontSize);
            this._putToCurrentPage(`/F${this._fonts[this._chosenFontKey].index} ${formattedFontSize} Tf`);
            this._currentFontSize = this._chosenFontSize;
            this._currentFontKey = this._chosenFontKey;
        }
        if(opts.characterSpacing) {
            // this.save();
            this.setCharacterSpacing(opts.characterSpacing);
        }
        const s = `${formatFloat(x)} ${formatFloat(y)} Td (${this._encodeText(text)}) Tj ET`;
        if(text == 'Student Name:') {
          console.log('write PDF text:', text, x, y);
        }
        this._putToCurrentPage(s);
        if(opts.characterSpacing) {
            // this.restore();
            // FIXME: if we tracked this like we do with _chosenFontSize and _chosenFontKey we could eliminate a lot
            // of these, improve performance, and create smaller PDFs
            this.setCharacterSpacing(0);
        }
    }

    /**
     * The native PDF coordinate system sets the origin at the bottom left corner of the page
     * It is more intuitive to construct PDFs by starting with the top as y = 0 with postitive y
     * values moving you down the page. This method transforms coordinates from the convient form
     * to the PDF native form
     * 
     * @param {number} x The x coordinate
     * @param {number} y The y coordinate (At the top of the page y=0. Moving down the page y gets larger)
     */
    _transformPoint(x: number, y: number): {x: number; y: number} {
        return {x, y: this._currentPage.height - y};
    }

    output(filename?: string) {
        this.close();
        if(filename) {
            fs.writeFileSync(filename, this._buffer, {encoding: 'binary'});
        } else {
            process.stdout.write(this._buffer);
        }
    }

    get buffer(): string {
        return this._buffer;
    }

    get finalBuffer(): string {
        this.close();
        return this._buffer;
    }

    _getFontKey(family: string, style: string): string {
        // normalize the family name
        family = family.toLowerCase().replace(' ', '');
        // normalize the style string
        style = style.toUpperCase();
        if(style=='IB') {
            style = 'BI';
        }
        return `${family}${style}`;
    }

    _getpagesize(size: string): {width: number; height: number} {
        if(typeof size == 'string') {
            size = size.toLowerCase();
            if(!this._standardPageSizes[size]) {
                throw new Error(`Unknown page size: '${size}'`);
            }
            return this._standardPageSizes[size];
        }
        else {
            throw new Error('Non string dimensions are not supported yet');
        }
    }

    _beginpage(size?: string, orientation?: any, rotation?: any) {
        this._currentFontKey = null;

        let pageDimensions;
        if(!size) {
            pageDimensions = this._getpagesize('Letter');
        } else {
            pageDimensions = this._getpagesize(size);
        }

        this._pages.push(new Page(pageDimensions.width, pageDimensions.height));
    }

    /**
     * Begins a new object
     */
    _newobj(objectNumber?: number): number {
        if(objectNumber === undefined) {
            objectNumber = ++this._currentObjectNumber;
        }

        const newObj = new PdfObject(objectNumber, this._getoffset());
        this._objects.push(newObj);

        this._put(`${objectNumber} 0 obj`);
        return objectNumber;
    }

    _getoffset() {
        return this._buffer.length;
    }

    /**
     * _put actually appends the string to the buffer
     */
    _put(s: string) {
        this._buffer += s + "\n";
    }

    _putToCurrentPage(s: string) {
        this._putToPage(s, this._pages.length - 1);
    }

    _putToPage(s: string, pageNumber: number) {
        this._pages[pageNumber].buffer += s + "\n";
    }

    _putresources() {
        this._putfonts();
        this._newobj(2);
        this._put('<<');
        this._putresourcedict();
        this._put('>>');
        this._put('endobj');
        this._put((' '.repeat(1000) + "\n").repeat(642));
        this._put((' '.repeat(432) + "\n"));
    }

    _putresourcedict()
    {
        this._put('/ProcSet [/PDF /Text /ImageB /ImageC /ImageI]');
        this._put('/Font <<');
        for(let fontKey of Object.keys(this._fonts)) {
            const font = this._fonts[fontKey];
            this._put(`/F${font.index} ${font.objectNumber} 0 R`);
        }
        this._put('>>');
        this._put('/XObject <<');
        this._put('>>');
    }

    _putinfo()
    {
        this._metadata.push({name: 'Producer', value: `FPdf.js`});
        this._metadata.push({name: 'CreationDate', value: this._formatDate(new Date)});
        for(const oneMeta of this._metadata) {
            this._put(`/${oneMeta.name} (${oneMeta.value})`);
        }
    }

    _formatDate(date: Date) {
        return `D:${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}Z`;
    }

    _enddoc() {
        this._putheader();
        this._putpages();

        this._putresources();

        // Info
        this._newobj();
        this._put('<<');
        this._putinfo();
        this._put('>>');
        this._put('endobj');

        // Catalog
        this._newobj();
        this._put('<<');
        this._putcatalog();
        this._put('>>');
        this._put('endobj');

        // Cross-ref
        const offset = this._getoffset();
        this._put('xref');
        this._put(`0 ${this._objects.length + 1}`);
        this._put('0000000000 65535 f ');

        this._objects.sort( (a, b) => a.objectNumber < b.objectNumber ? -1 : 1 );
        for(const obj of this._objects) {
            const offsetString = obj.offset.toString();
            const paddedOffset = '0000000000'.slice(0, 10 - offsetString.length) + offsetString;
            this._put(`${paddedOffset} 00000 n `);
        }

        // Trailer
        this._put('trailer');
        this._put('<<');
        this._puttrailer();
        this._put('>>');
        this._put('startxref');
        this._put(offset.toString());
        this._put('%%EOF');
    }

    _putcatalog()
    {
        this._put('/Type /Catalog');
        this._put('/Pages 1 0 R');
    }


    _putheader() {
        this._put(`%PDF-${this.pdfVersion}`)
    }

    _puttrailer() {
        this._put(`/Size ${this._objects.length + 1}`);
        this._put(`/Root ${this._objects.length} 0 R`);
        this._put(`/Info ${this._objects.length - 1} 0 R`);
    }

    _putpages() {
        for(const page of this._pages) {
            this._putpage(page);
        }

        // Pages root
        this._newobj(1);
        this._put('<</Type /Pages');

        let pageReferences: string[] = [];
        for(const page of this._pages) {
            pageReferences.push(`${page.objectNumber} 0 R`);
        }
        this._put(`/Kids [${pageReferences.join("\n")} ]`);

        this._put(`/Count ${this._pages.length}`);
        this._put(`/MediaBox [0 0 ${formatFloat(this._currentPage.width)} ${formatFloat(this._currentPage.height)}]`);

        this._put('>>');
        this._put('endobj');
    }

    _putpage(page: Page) {
        this._newobj();
        page.objectNumber = this._currentObjectNumber;
        this._put('<</Type /Page');
        this._put('/Parent 1 0 R');
        this._put('/Resources 2 0 R');
        this._put(`/Contents ${this._currentObjectNumber + 1} 0 R>>`);

        this._put('endobj');
        this._putstreamobject(page.buffer);
    }

    _putfonts() {
        for(let fontKey of Object.keys(this._fonts)) {
            const fontRef = this._fonts[fontKey];
            if(fontRef.font.type == 'Core') { continue; }

            // if(!fontRef.font.openTypeBuffer) {
            //     // FIXME: in reality we should create separate classes for custom and standard fonts
            //     //   and use a type descriminator so it can tell that we have a working custom font
            //     throw new Error("Custom fonts must have an opentype buffer");
            // }
            // const fontBuffer = fontRef.font.openTypeBuffer.toArrayBuffer();

            // // FIXME: why are we reading this in here? Didn't we already read it in the pull the font metrics?
            // const bigFont = opentype.loadSync(fontRef.font.fileName);
            // const bigFont = fontRef.font.openTypeBuffer;
            // const glyphs = [bigFont.charToGlyph(String.fromCharCode(0))];
            // for(const charCodeString of Object.keys(this._subset)) {
            //     const charCode = parseInt(charCodeString);
            //     const glyph = bigFont.charToGlyph(String.fromCharCode(charCode));
            //     glyphs.push(glyph);
            // }
            
            //*
            // const bigFontBuffer = fs.readFileSync('/Users/rick/code/gradecam/gcformservice/public/stylesheets/fonts/OpenSans-Regular.ttf');
            // var subsettedArrayBuffer = new Uint8Array(bigFontBuffer).buffer;
            //*/

            /*
            const subsettedFont = bigFont;
            // const subsettedFont = new opentype.Font({
            //     familyName: bigFont.names.fontFamily.en,
            //     styleName: bigFont.names.fontSubfamily.en,
            //     unitsPerEm: bigFont.unitsPerEm,
            //     ascender: bigFont.ascender,
            //     descender: bigFont.descender,
            //     glyphs: glyphs
            // });
            const subsettedArrayBuffer = subsettedFont.toArrayBuffer();
            //*/


            const subsettedArrayBuffer = fontRef.font.getEmbeddableFontBuffer();
            fontRef.subsettedUncompressedFileSize = subsettedArrayBuffer.byteLength;
            fontRef.subsettedCompressedFileData = zlib.deflateSync(new Buffer(subsettedArrayBuffer));

            fontRef.fileObjectNumber = this._newobj();
            this._put(`<</Length ${fontRef.subsettedCompressedFileData.byteLength}`);
            this._put('/Filter /FlateDecode');
            this._put(`/Length1 ${fontRef.subsettedUncompressedFileSize}`);
            this._put('>>');
            this._putstream(fontRef.subsettedCompressedFileData.toString('binary'));
            this._put('endobj');
        }
        for(let fontKey of Object.keys(this._fonts)) {
            const fontRef = this._fonts[fontKey];

            let fontName;
            if(fontRef.font.type == 'Core') {
                // Core font
                fontName = fontRef.font.name;
                fontRef.objectNumber = this._newobj();
                this._put('<</Type /Font');
                this._put(`/BaseFont /${fontName}`);
                this._put('/Subtype /Type1');
                this._put('>>');
                this._put('endobj');
            } else if(fontRef.font.type == 'TrueType') {
                // Because this is a composit font and not just the straight TTF font we must append a code prefix to
                // to the font name. It must be six capital letters but it could be anything. FPDFJS just happens to
                // fit the bill :)
                fontName = `FPDFJS+${fontRef.font.name}`;

                // Type0 Font
                // A composite font - a font composed of other fonts, organized hierarchically
                fontRef.objectNumber = this._newobj();
                this._put('<</Type /Font');
                this._put(`/Subtype /Type0`);
                this._put(`/BaseFont /${fontName}`);
                this._put(`/Encoding /Identity-H`);
                this._put(`/DescendantFonts [${this._currentObjectNumber + 1} 0 R]`);
                this._put(`/ToUnicode ${this._currentObjectNumber + 2} 0 R`);
                this._put('>>');
                this._put('endobj');

                // CIDFontType2
                // A CIDFont whose glyph descriptions are based on TrueType font technology
                this._newobj();
                this._put(`<</Type /Font`);
                this._put(`/Subtype /CIDFontType2`);
                this._put(`/BaseFont /${fontName}`);
                this._put(`/CIDSystemInfo ${this._currentObjectNumber + 2} 0 R`);
                this._put(`/FontDescriptor ${this._currentObjectNumber + 3} 0 R`);
                if(fontRef.font.fontMetrics.missingWidth) {
                    this._put(`/DW ${fontRef.font.fontMetrics.missingWidth}`); 
                }

                let widthMap = '/W [';
                // if(!fontRef.font.openTypeBuffer) {
                //     // FIXME: in reality we should create separate classes for custom and standard fonts
                //     //   and use a type descriminator so it can tell that we have a working custom font
                //     throw new Error("Custom fonts must have an opentype buffer");
                // }

                let gid = 0;
                // // FIXME: why are we reading this in here? Didn't we already read it in the pull the font metrics?
                // //   also we already opened it and read in the whole thing above. we should only read it in once per session
                // const bigFont = opentype.loadSync(fontRef.font.fileName);
                // const bigFont = fontRef.font.openTypeBuffer;
                const scale = 1000/fontRef.font.unitsPerEm;
                for(const charCodeString of Object.keys(this._subset)) {
                    const charCode = parseInt(charCodeString);
                    // const glyph = bigFont.charToGlyph(String.fromCharCode(charCode));
                    // const scaledWidth = Math.round(glyph.advanceWidth * scale);
                    const scaledWidth = formatFloat(fontRef.font.getScaledGlyphAdvanceWidth(charCode));
                    widthMap += `${charCodeString} [${scaledWidth}] `;
                    gid++;
                }
                widthMap += ']';

                this._put(widthMap);
                this._put(`/CIDToGIDMap ${this._currentObjectNumber + 4} 0 R`);
                this._put(`>>`);
                this._put(`endobj`);

                // ToUnicode
                this._newobj();
                let toUni = "/CIDInit /ProcSet findresource begin\n";
                toUni += "12 dict begin\n";
                toUni += "begincmap\n";
                toUni += "/CIDSystemInfo\n";
                toUni += "<</Registry (Adobe)\n";
                toUni += "/Ordering (UCS)\n";
                toUni += "/Supplement 0\n";
                toUni += ">> def\n";
                toUni += "/CMapName /Adobe-Identity-UCS def\n";
                toUni += "/CMapType 2 def\n";
                toUni += "1 begincodespacerange\n";
                toUni += "<0000> <FFFF>\n";
                toUni += "endcodespacerange\n";
                toUni += "1 beginbfrange\n";
                toUni += "<0000> <FFFF> <0000>\n";
                toUni += "endbfrange\n";
                toUni += "endcmap\n";
                toUni += "CMapName currentdict /CMap defineresource pop\n";
                toUni += "end\n";
                toUni += "end";
                this._put(`<</Length ${toUni.length}>>`);
                this._putstream(toUni);
                this._put('endobj');

                // CIDSystemInfo dictionary
                this._newobj();
                this._put('<</Registry (Adobe)'); 
                this._put('/Ordering (UCS)');
                this._put('/Supplement 0');
                this._put('>>');
                this._put('endobj');

                // Font descriptor
                this._newobj();
                this._put('<</Type /FontDescriptor');
                this._put(`/FontName /${fontName}`);

                // /StemV 0
                if(fontRef.font.fontMetrics.ascender) { this._put(` /Ascent ${fontRef.font.fontMetrics.ascender}`); }
                if(fontRef.font.fontMetrics.descender) { this._put(` /Descent ${fontRef.font.fontMetrics.descender}`); }
                if(fontRef.font.fontMetrics.capHeight) { this._put(` /CapHeight ${fontRef.font.fontMetrics.capHeight}`); }
                if(fontRef.font.fontMetrics.flags) { this._put(` /Flags ${fontRef.font.fontMetrics.flags}`); }
                if(fontRef.font.fontMetrics.fontBBox) {
                    this._put(` /FontBBox [${fontRef.font.fontMetrics.fontBBox[0]} ${fontRef.font.fontMetrics.fontBBox[1]} ${fontRef.font.fontMetrics.fontBBox[2]} ${fontRef.font.fontMetrics.fontBBox[3]}]`);
                }
                if(fontRef.font.fontMetrics.italicAngle != undefined) { this._put(` /ItalicAngle ${fontRef.font.fontMetrics.italicAngle}`); }
                if(fontRef.font.fontMetrics.missingWidth) { this._put(` /MissingWidth ${fontRef.font.fontMetrics.missingWidth}`); }
                if(fontRef.font.fontMetrics.stemV != undefined) { this._put(` /StemV ${fontRef.font.fontMetrics.stemV}`); }
                console.log(fontRef.font.fontMetrics);
                this._put(`/FontFile2 ${fontRef.fileObjectNumber} 0 R`);
                this._put('>>');
                this._put('endobj');

                // Embed CIDToGIDMap
                // A mapping from CIDs to glyph indices
                const cidtogidmap = new Int8Array(256*256*2);
                let i = 1;
                for(const charCodeString of Object.keys(this._subset)) {
                    const charCode = parseInt(charCodeString);
                    // const glyphId = i;
                    // const glyphId = charCode;
                    // const glyph = bigFont.charToGlyph(String.fromCharCode(charCode));
                    // const glyphId = (<any>glyph).index;
                    const glyphId = fontRef.font.charCodeToGlyphIndex(charCode);
                    cidtogidmap[charCode*2] = <any>glyphId >> 8;
                    cidtogidmap[charCode*2+1] = <any>glyphId & 0xFF;
                    i++;
                }
                const compressedCidToGidMap = zlib.deflateSync(new Buffer(cidtogidmap.buffer));
                const compressedString = compressedCidToGidMap.toString('binary');
                this._newobj();
                this._put(`<</Length ${compressedCidToGidMap.byteLength}`);
                this._put('/Filter /FlateDecode');
                this._put('>>');
                this._putstream(compressedString);
                this._put('endobj');
            }
        }
    }


    _putstreamobject(data: string) {
        let entries = `/Length ${data.length}`;
        this._newobj();
        this._put(`<<${entries}>>`);
        this._putstream(data);
        this._put('endobj');
    }

    _putstream(data: string) {
        this._put('stream');
        this._put(data);
        this._put('endstream');
    }
}

export class Page {
    width: number;
    height: number;
    objectNumber: number | undefined;
    buffer = '';

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }
}

export interface DrawOpts {
    fill?: boolean;
    stroke?: boolean;
}

function pad(s: number | string, length: number) {
    return (Array(length + 1).join('0') + s).slice(-length);
}

class PdfObject {
    objectNumber: number;
    offset: number;

    constructor(objectNumber: number, offset: number) {
        this.objectNumber = objectNumber;
        this.offset = offset;
    }
}

class Pen {
    lineWidth = 0.567;
}
