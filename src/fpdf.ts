import * as fs from 'fs';
import * as zlib from 'zlib';
import * as font from './font';

export type LineCapStyle = 'BUTT' | 'ROUND' | 'SQUARE';
export type RuleValue = "even-odd" | "evenodd" | "non-zero" | "nonzero";

const KAPPA = 4.0 * ((Math.sqrt(2) - 1.0) / 3.0);

interface Transform {
    scalex: number;
    scaley: number;
    originx: number;
    originy: number;
}

interface FontRef {
    font: font.Font;
    index: number;
    objectNumber?: number;
    fileObjectNumber?: number;
    subsettedUncompressedFileSize?: number;
    subsettedCompressedFileData?: Buffer;
}

export interface DrawOpts {
    fill?: boolean;
    stroke?: boolean;
}

export interface ScaleOpts {
    origin?: {
        x: number;
        y:number;
    }
}

export interface TextOptions {
    width?: number;
    align?: 'right' | string;
    characterSpacing?: number;
}

function formatFloat(value: number): string {
    return value.toFixed(3);
}

function pad(s: number | string, length: number) {
    return (Array(length + 1).join('0') + s).slice(-length);
}

function windingRule(rule?: RuleValue): string {
    if(rule && /even-?odd/.test(rule)) {
      return '*';
    }
    return '';
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

export class FPdf {

    /**
     * The version of the PDF spec that we are targeting. The minimum
     * version that supports the features we support should be used
     * 
     * @type {String}
     */
    readonly pdfVersion = '1.3';

    /**
     * PDF documents contain elements called objects. They are numbered.
     * This is to keep track of the current number
     * 
     * @type {Number}
     */
    private _currentObjectNumber = 2;

    /**
     * The font key of the last font that was outputted to the buffer
     * Any new BT/ET commands will default to using this font
     */
    private _currentFontKey: string | null = null;

    /**
     * The font key of the last font that was selected by calling code
     * This is what we use to track the latest selected font.
     * The command to use this font may not have been written to the file yet
     */
    private _chosenFontKey: font.StandardFontFamilyName | string  = 'Helvetica';

    private _currentFontSize = 10;
    private _chosenFontSize = 10;
    private _pages: Page[] = [];
    private _objects: PdfObject[] = [];
    private _fonts: { [fontName: string]: FontRef } = {};
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

    private get _currentPage() {
        return this._pages[this._pages.length - 1];
    }

    private get _chosenFont(): font.Font {
        if(!this._fonts[this._chosenFontKey]) {
            // We should only get in here if setFont has never been called
            // and _chosenFontKey is thus still the default (Helvetica)
            if(this._chosenFontKey != 'Helvetica') { throw new Error('This should never happen'); }
            this.setFont('Helvetica');
        }

        return this._fonts[this._chosenFontKey].font;
    }

    get currentFontMetrics() {
        const currentFont = this._chosenFont;
        return {
            ascender: currentFont.fontMetrics.ascender / 1000 * this._chosenFontSize,
            descender: currentFont.fontMetrics.descender / 1000 * this._chosenFontSize,
            gap: 0,
            lineHeight: (currentFont.fontMetrics.ascender - currentFont.fontMetrics.descender) / 1000 * this._chosenFontSize
        };
    }

    close() {
        if(this._pages.length == 0) {
            this.addPage();
        }

        this._enddoc();
    }

    addPage(size?: any, orientation?: any, rotation?: any) {

        this._beginpage(size, orientation, rotation);

        // Set line width
        // FIXME: we should do this how we do everything else with a proper $w
        // and then a proper setLineWidth function
        this._putToCurrentPage(`${formatFloat(this._pen.lineWidth)} w`);

        // set the PDF origin to the top left corner of the page
        // we then multiply all y coordinates by -1 in _transformPoint
        // combined these allow us to start at the top and move to the bottom
        // with higher y values moving you down the page
        this.$cm(1, 0, 0, 1, 0, this._currentPage.height);
    }

    strokeColor(red: number, green: number, blue: number) {
        this.$strokeColor(red/255, green/255, blue/255);
    }

    // FIXME: this should accept an optional TextOptions paramater and take into account some text options such as character spacing
    getTextWidth(text: string): number {
        if(!this._chosenFont || !this._chosenFontSize) {
            throw new Error("getStringWidth: A font and size must be set before measuring text");
        }

        return this._chosenFont.getTextWidth(text, this._chosenFontSize);
    }

    getTextHeight(): number {
        return this._chosenFont.fontMetrics.lineHeight || 0;
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

    clip(rule?: RuleValue) {
        this.$W(rule);
        this.$n();
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

    /**
     * Transform given coordinates and draw a bezier curve with them

     * @param {number} cp1x handle control point 1 x coordinate
     * @param {number} cp1y handle control point 1 y coordinate
     * @param {number} cp2x handle control point 2 x coordinate
     * @param {number} cp2y handle control point 2 y coordinate
     * @param {number} x    final vector point x coordinate
     * @param {number} y    final vector point y coordinate
     */
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
        ({x: cp1x, y: cp1y} = this._transformPoint(cp1x, cp1y));
        ({x: cp2x, y: cp2y} = this._transformPoint(cp2x, cp2y));
        ({x, y} = this._transformPoint(x, y));
        this.$c(cp1x, cp1y, cp2x, cp2y, x, y);
    }

    /**
     * Modify the current transformation matrix
     * @param {number} m11 can be used for scaling the x axis or for rotations
     * @param {number} m12 can be used for skew or for rotation
     * @param {number} m21 can be used for skew or for rotation
     * @param {number} m22 can be used for scaling the y axis or for rotations
     * @param {number} dx  moves the x coordinate of the origin
     * @param {number} dy  moves the y coordinate of the origin
     */
    transform(m11: number, m12: number, m21: number, m22: number, dx: number, dy: number): void {
        ({x: dx, y: dy} = this._transformPoint(dx, dy));
        const scalex = m11;
        const scaley = m22;
        const originx = dx;
        const originy = dy;
        this.$cm(scalex, m12, m21, scaley, originx, originy);
    }

    scale(scalex: number, scaley?: number | ScaleOpts, options?: ScaleOpts) {
        if(typeof scaley == 'object') {
            options = scaley;
            scaley = scalex;
        } else if (typeof scaley == 'undefined') {
            scaley = scalex;
        }

        let originx = 0;
        let originy = 0;
        if(options && options.origin) {
            originx = options.origin.x - (scalex * options.origin.x);
            originy = options.origin.y - (scaley * options.origin.y);
        }
        this.transform(scalex, 0, 0, scaley, originx, originy);
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

    $W(rule?: RuleValue): void {
        this._putToCurrentPage(`W${windingRule(rule)}`);
    }

    /**
     * End the path object without filling or stroking it. This operator is a “path-painting no-op,”
     * used primarily for the side effect of changing the current clipping path
     */
    $n(): void {
        this._putToCurrentPage(`n`);
    }

    /**
     * draw a bezier curve with the given coordinates
     *
     * @param {number} cp1x handle control point 1 x coordinate
     * @param {number} cp1y handle control point 1 y coordinate
     * @param {number} cp2x handle control point 2 x coordinate
     * @param {number} cp2y handle control point 2 y coordinate
     * @param {number} x    final vector point x coordinate
     * @param {number} y    final vector point y coordinate
     */
    $c(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
        this._putToCurrentPage(`${formatFloat(cp1x)} ${formatFloat(cp1y)} ${formatFloat(cp2x)} ${formatFloat(cp2y)} ${formatFloat(x)} ${formatFloat(y)} c`);
    }

    /**
     * Modify the current transformation matrix
     *
     * @param {number} cp1x [description]
     * @param {number} cp1y [description]
     * @param {number} cp2x [description]
     * @param {number} cp2y [description]
     * @param {number} x    [description]
     * @param {number} y    [description]
     */
    $cm(m11: number, m12: number, m21: number, m22: number, dx: number, dy: number) {
        this._putToCurrentPage(`${formatFloat(m11)} ${formatFloat(m12)} ${formatFloat(m21)} ${formatFloat(m22)} ${formatFloat(dx)} ${formatFloat(dy)} cm`);
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

    /**
     * add a custom TrueType or OpenType font to this PDF
     * the font will be embedded into the PDf file
     *
     * @param {string}    family  [description]
     * @param {string}    style   [description]
     * @param {font.Font} newFont [description]
     */
    addCustomFont(family: string, style: string, newFont: font.Font) {
        const fontKey = this._getFontKey(family, style);

        // if the font is already loaded then we are done
        if(this._fonts[fontKey]) {
            return;
        }

        this.addFont(fontKey, newFont);
    }

    addStandardFont(family: font.StandardFontFamilyName, style?: string, newFont?: font.Font) {
        style = style || '';
        const fontKey = this._getFontKey(family, style);

        // if the font is already loaded then we are done
        if(this._fonts[fontKey]) {
            return;
        }

        if(!newFont) {
            newFont = new font.StandardFont(family);
        }

        this.addFont(fontKey, newFont);
    }

    private addFont(fontKey: string, newFont: font.Font) {
        const fontIndex = Object.keys(this._fonts).length + 1;
        this._fonts[fontKey] = {
            font: newFont,
            index: fontIndex
        };
    }

    setFont(family: string, style: string = '', size?: number): void {
        const fontKey = this._getFontKey(family, style);
        size = size || this._chosenFontSize;

        // if this is already the current font just bail
        if(fontKey == this._currentFontKey && size == this._currentFontSize) {
            return;
        }

       // if it's not already loaded but it is a standard font we can just load it here, otherwise throw
        if(!this._fonts[fontKey]) {
            if(font.isStandardFontFamilyName(family)) {
                this.addStandardFont(<font.StandardFontFamilyName>family, style);
            } else {
                throw new Error(`The font '${fontKey}'' has not been loaded yet. You must load it with addCustomFont before calling setFont`);
            }
        }

        this._chosenFontKey = fontKey;
        this._chosenFontSize = size;
    }

    setFontSize(size: number) {
        this._chosenFontSize = size;
    }

    _encodeText(s: string) {
        for(let i = 0; i < s.length; i++) {
            const codePoint = s.charCodeAt(i);
            this._subset[codePoint] = codePoint;
        }

        // how the font needs to be encoded depends on the font
        // generally it needs to either 8 bit extended ascii or UTF16 big-endian
        // (nodejs uses UTF16 little-endian)
        return this._chosenFont.encodeText(s);
    }

    /**
     * Write text to the page
     *
     * FIXME: We are doing a lot of _putToCurrentPage here
     *        We should update it to use $functions and 
     *        then appropriately named wrappers
     * 
     * @param {number}                     x
     * @param {number}                     y    
     * @param {string}                     text    
     * @param {TextOptions =    {}}        opts
     */
    text(x: number, y: number, text: string, opts: TextOptions = {}) {
        ({x, y} = this._transformPoint(x, y));

        if(opts.align == 'right' && opts.width) {
            const textWidth = this.getTextWidth(text);
            x = x + opts.width - textWidth;
        }

        this._putToCurrentPage('BT');

        // by default this PDF command will use the y value for the font baseline
        // we want to move it down so that the y value given here becomes the the top
        y -= this._chosenFont.fontMetrics.ascender * this._chosenFontSize / 1000;

        // if this is the first BT/ET item for a the _chosenFont then we need to output that Tf command
        if(this._chosenFontKey && (this._chosenFontSize != this._currentFontSize || this._chosenFontKey != this._currentFontKey)) {
            const formattedFontSize = formatFloat(this._chosenFontSize);
            this._putToCurrentPage(`/F${this._fonts[this._chosenFontKey].index} ${formattedFontSize} Tf`);
            this._currentFontSize = this._chosenFontSize;
            this._currentFontKey = this._chosenFontKey;
        }

        if(opts.characterSpacing) {
            this.setCharacterSpacing(opts.characterSpacing);
        }

        const s = `${formatFloat(x)} ${formatFloat(y)} Td (${this._encodeText(text)}) Tj ET`;
        this._putToCurrentPage(s);
        if(opts.characterSpacing) {
            // FIXME: if we tracked this like we do with _chosenFontSize and _chosenFontKey we could eliminate a lot
            // of these, improve performance, and create smaller PDFs
            this.setCharacterSpacing(0);
        }
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

    /**
     * The native PDF coordinate system sets the origin at the bottom left corner of the page
     * It is more intuitive to construct PDFs by starting with the top as y = 0 with postitive y
     * values moving you down the page. This method transforms coordinates from the convient form
     * to the PDF native form
     * 
     * @param {number} x The x coordinate
     * @param {number} y The y coordinate (At the top of the page y=0. Moving down the page y gets larger)
     */
    private _transformPoint(x: number, y: number): {x: number; y: number} {
        return {x, y: y * -1};
    }

    private _getFontKey(family: string, style: string): string {
        // normalize the family name
        family = family.toLowerCase().replace(' ', '');
        // normalize the style string
        style = style.toUpperCase();
        if(style=='IB') {
            style = 'BI';
        }
        return `${family}${style}`;
    }

    private _getpagesize(size: string): {width: number; height: number} {
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

    private _beginpage(size?: string, orientation?: any, rotation?: any) {
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
    private _newobj(objectNumber?: number): number {
        if(objectNumber === undefined) {
            objectNumber = ++this._currentObjectNumber;
        }

        const newObj = new PdfObject(objectNumber, this._getoffset());
        this._objects.push(newObj);

        this._put(`${objectNumber} 0 obj`);
        return objectNumber;
    }

    private _getoffset() {
        return this._buffer.length;
    }

    /**
     * _put actually appends the string to the buffer
     */
    private _put(s: string) {
        this._buffer += s + "\n";
    }

    private _putToCurrentPage(s: string) {
        this._putToPage(s, this._pages.length - 1);
    }

    private _putToPage(s: string, pageNumber: number) {
        this._pages[pageNumber].buffer += s + "\n";
    }

    private _putresources() {
        this._putfonts();
        this._newobj(2);
        this._put('<<');
        this._putresourcedict();
        this._put('>>');
        this._put('endobj');
    }

    private _putresourcedict()
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

    private _putinfo()
    {
        this._metadata.push({name: 'Producer', value: `FPdf.js`});
        this._metadata.push({name: 'CreationDate', value: this._formatDate(new Date)});
        for(const oneMeta of this._metadata) {
            this._put(`/${oneMeta.name} (${oneMeta.value})`);
        }
    }

    private _formatDate(date: Date) {
        return `D:${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}Z`;
    }

   private _enddoc() {
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

    private _putcatalog()
    {
        this._put('/Type /Catalog');
        this._put('/Pages 1 0 R');
    }


    private _putheader() {
        this._put(`%PDF-${this.pdfVersion}`)
    }

    private _puttrailer() {
        this._put(`/Size ${this._objects.length + 1}`);
        this._put(`/Root ${this._objects.length} 0 R`);
        this._put(`/Info ${this._objects.length - 1} 0 R`);
    }

    private _putpages() {
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

    private _putpage(page: Page) {
        this._newobj();
        page.objectNumber = this._currentObjectNumber;
        this._put('<</Type /Page');
        this._put('/Parent 1 0 R');
        this._put('/Resources 2 0 R');
        this._put(`/Contents ${this._currentObjectNumber + 1} 0 R>>`);

        this._put('endobj');
        this._putstreamobject(page.buffer);
    }

    private _putfonts() {
        for(let fontKey of Object.keys(this._fonts)) {
            const fontRef = this._fonts[fontKey];
            if(fontRef.font.type == 'Standard') { continue; }

            // FIXME: We may want to restore font subsetting at some point but it shouldn't be done here
            // const glyphs = [bigFont.charToGlyph(String.fromCharCode(0))];
            // for(const charCodeString of Object.keys(this._subset)) {
            //     const charCode = parseInt(charCodeString);
            //     const glyph = bigFont.charToGlyph(String.fromCharCode(charCode));
            //     glyphs.push(glyph);
            // }
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
            if(fontRef.font.type == 'Standard') {
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

                // let gid = 0;
                for(const charCodeString of Object.keys(this._subset)) {
                    const charCode = parseInt(charCodeString);
                    const scaledWidth = formatFloat(fontRef.font.getScaledGlyphAdvanceWidth(charCode));
                    widthMap += `${charCodeString} [${scaledWidth}] `;
                    // gid++;
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
                this._put(`/FontFile2 ${fontRef.fileObjectNumber} 0 R`);
                this._put('>>');
                this._put('endobj');

                // Embed CIDToGIDMap
                // A mapping from CIDs to glyph indices
                const cidtogidmap = new Int8Array(256*256*2);
                // let i = 1;
                for(const charCodeString of Object.keys(this._subset)) {
                    const charCode = parseInt(charCodeString);
                    // FIXME this is what we were using when we were doing font subsetting
                    // if we restore font subsetting we could either use this or use glyph.index
                    // from the subsetted opentype.js font/glyph object
                    // const glyphId = i;
                    const glyphId = fontRef.font.charCodeToGlyphIndex(charCode);
                    cidtogidmap[charCode*2] = <any>glyphId >> 8;
                    cidtogidmap[charCode*2+1] = <any>glyphId & 0xFF;
                    // i++;
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


    private _putstreamobject(data: string) {
        let entries = `/Length ${data.length}`;
        this._newobj();
        this._put(`<<${entries}>>`);
        this._putstream(data);
        this._put('endobj');
    }

    private _putstream(data: string) {
        this._put('stream');
        this._put(data);
        this._put('endstream');
    }
}
