import * as fs from 'fs';
import * as font from './font';

import * as courier from '../fonts/courier.afm.json';
import * as helvetica from '../fonts/helvetica.afm.json';
import * as times from '../fonts/times.afm.json';
import * as adobeStandardEncoding from '../fonts/adobe-standard-encoding.cmap.json';

// import * as OpenSans from '../fonts/opensans.afm.json';


const typedAdobeStandardEncoding: font.CMAPData = <any>adobeStandardEncoding;

export class FPdf {

    /**
     * The version of the PDF spec that we are targeting
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
    private _currentFontSize = 10;

    private _pages: Page[] = [];
    private _objects: PdfObject[] = [];
    private _fonts: { [fontName: string]: font.Font } = {};
    private _coreFonts: { [fontName: string]: {name: string; data: font.AFMData} } = {};

    private _pen = new Pen();

    private _metadata: {name: string; value: string}[] = [];

    private _buffer = '';

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

    get _currentPage() {
        return this._pages[this._pages.length - 1];
    }

    get _currentFont(): font.Font | null {
        if(!this._currentFontKey) {
            return null;
        }
        return this._fonts[this._currentFontKey];
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
        const curFontKey = this._currentFontKey
        this._beginpage(size, orientation, rotation);

        // Set line cap style to square
        this._putToCurrentPage('2 J');

        // Set line width
        this._putToCurrentPage(`${this._pen.lineWidth.toFixed(2)} w`);
        // Set font
        if(curFontKey && this._currentFontSize) {
            this.setFont(curFontKey, this._currentFontSize);
        }
    }

    strokeColor(red: number, green: number, blue: number) {
        this.$strokeColor(red/255, green/255, blue/255);
    }

    getTextWidth(text: string): number {
        if(!this._currentFont || !this._currentFontSize) {
            throw new Error("getStringWidth: A font and size must be set before measuring text");
        }

        return this._currentFont.getTextWidth(text, this._currentFontSize);
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
        this.$fillStroke({stroke: true});
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

    $rect(x: number, y: number, w: number, h: number): void {
        this._putToCurrentPage(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${(h*-1).toFixed(2)} re`);
    }

    $fillStroke(opts?: DrawOpts): void {
        const op = this.drawOptsToPdfOp(opts);
        this._putToCurrentPage(op);
    }

    $strokeColor(red: number, green: number, blue: number): void {
        this._putToCurrentPage(`${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} RG `);
    }

    addFont(fontKey: string): void;
    addFont(family: string, style: string): void;
    addFont(...args: any[]): void {
        let {fontKey, size} = this._extractSetFontArgs(args.concat([0]));

        // if the font is already loaded then we are done
        if(this._fonts[fontKey]) {
            return;
        }

        const file = `fonts/${fontKey}.json`;

        const fontIndex = Object.keys(this._fonts).length + 1;
        if(this._coreFonts[fontKey]) {
            this._fonts[fontKey] = new font.Font(fontIndex, this._coreFonts[fontKey].name, this._coreFonts[fontKey].data, typedAdobeStandardEncoding);
        } else {
            if(args.length < 2) {
                throw new Error("non-core fonts can't be added directly with a font key");
            }

            // FIXME: this is obvioulsy messed up. Make it work
            // this._fonts[fontKey] = new font.Font(fontIndex, args[0], <any>OpenSans);
            throw new Error('make this work right');
        }
    }

    _extractSetFontArgs(args: any[]): {fontKey: string; size: number} {
        let fontKey: string;
        let size: number;
        if(args.length == 2) {
            fontKey = args[0];
            size = args[1];
        } else if(args.length == 3) {
            fontKey = this._getFontKey(args[0], args[1]);
            size = args[2];
        } else {
            throw new Error(`setFont requires either two or three aguments. You passed in ${args.length}`);
        }

        return {fontKey: fontKey, size: size};
    }

    setFont(fontKey: string, size: number): void;
    setFont(family: string, style: string, size: number): void;
    setFont(...args: any[]): void {
        const {fontKey, size} = this._extractSetFontArgs(args);

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
                throw new Error(`Undefined font: ${fontKey}`);
            }
        }

        this._currentFontKey = fontKey;
        this._currentFontSize = size;

        if(this._pages.length > 0) {
            const formattedFontSize = size.toFixed(2);
            this._putToCurrentPage(`BT /F${this._fonts[fontKey].fontIndex} ${formattedFontSize} Tf ET`);
        } else {
        }
    }

    text(x: number, y: number, text: string) {
        if(!this._currentFont) {
            throw new Error('No font has been set');
        }

        // transform x and y
        ({x, y} = this._transformPoint(x, y));

        // by default this PDF command will use the y value for the font baseline
        // we want to move it down so that the y value given here becomes the the top
        y -= this._currentFont.fontMetrics.ascender * this._currentFontSize / 1000;

        const s = `BT ${x.toFixed(2)} ${y.toFixed(2)} Td (${text}) Tj ET`;
        this._putToCurrentPage(s);
    }

    _transformPoint(x: number, y: number): {x: number; y: number} {
        return {x, y: this._currentPage.height - y};
    }

    output(filename?: string) {
        this.close();
        if(filename) {
            console.log(`${filename}:`, this._buffer.length);
            fs.writeFileSync(filename, this._buffer, {encoding: 'binary'});
        } else {
            console.log(this._buffer);
        }
    }

    get buffer(): string {
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
     * _put actually appends the string to the buffer (which right now is just stdout)
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
        // Resource dictionary
        this._newobj(2);
        this._put('<<');
        this._putresourcedict();
        this._put('>>');
        this._put('endobj');
    }

    _putresourcedict()
    {
        this._put('/ProcSet [/PDF /Text /ImageB /ImageC /ImageI]');
        this._put('/Font <<');
        for(let fontKey of Object.keys(this._fonts)) {
            const font = this._fonts[fontKey];
            this._put(`/F${font.fontIndex} ${font.objectNumber} 0 R`);
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
        this._put(`/MediaBox [0 0 ${this._currentPage.width.toFixed(2)} ${this._currentPage.height.toFixed(2)}]`);

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
            const font = this._fonts[fontKey];
            if(font.type == 'Core') { continue; }
            font.fileObjectNumber = this._newobj();
            this._put(`<</Length ${font.fileData.byteLength}`);
            this._put('/Filter /FlateDecode');
            this._put(`/Length1 ${font.fileOriginalSize}`);
            this._put('>>');
            console.log('font.fileData.byteLength:', font.fileData.byteLength);
            console.log('font.fileData.toString(binary).length:', font.fileData.toString('binary').length);
            this._putstream(font.fileData.toString('binary'));
            this._put('endobj');
        }
        for(let fontKey of Object.keys(this._fonts)) {
            const font = this._fonts[fontKey];
            
            let fontName;
            if(font.type == 'Core') {
                // Core font
                fontName = font.name;
                font.objectNumber = this._newobj();
                this._put('<</Type /Font');
                this._put(`/BaseFont /${fontName}`);
                this._put('/Subtype /Type1');
                this._put('>>');
                this._put('endobj');
            } else if(font.type == 'Type1' || font.type == 'TrueType') {
                if(font.type == 'Type1') {
                    throw new Error('Embedded Type1 fonts are not actually supprted at this point');
                }

                // Additional Type1 or TrueType/OpenType font
                fontName = `AAAAAA+${font.name}-Regular`;
                font.objectNumber = this._newobj();
                this._put('<</Type /Font');
                this._put(`/BaseFont /${fontName}`);
                this._put(`/Subtype /${font.type}`);
                this._put('/FirstChar 32 /LastChar 255');
                this._put(`/Widths ${font.objectNumber+1} 0 R`);
                this._put(`/FontDescriptor ${font.objectNumber+2} 0 R`);
                this._put('>>');
                this._put('endobj');

                // Widths
                this._newobj();
                const charWidths: number[] = [];
                this._put('[260 267 401 646 572 823 730 221 296 296 552 572 245 322 266 367 572 572 572 572 572 572 572 572 572 572 266 266 572 572 572 429 899 633 648 631 729 556 516 728 738 279 267 614 519 903 754 779 602 779 618 549 553 728 595 926 577 560 571 329 367 329 542 448 577 556 613 476 613 561 339 548 614 253 253 525 253 930 614 604 613 613 408 477 353 614 501 778 524 504 468 379 551 379 572 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 260 267 572 572 572 572 551 516 577 832 354 497 572 322 832 500 428 572 347 347 577 619 655 266 227 347 375 497 780 780 780 429 633 633 633 633 633 633 873 631 556 556 556 556 279 279 279 279 722 754 779 779 779 779 779 572 779 728 728 728 728 560 611 622 556 556 556 556 556 556 858 476 561 561 561 561 253 253 253 253 596 614 604 604 604 604 604 572 604 614 614 614 614 504 613 504 ]');
                this._put('endobj');

                // Descriptor
                this._newobj();
                let fontDescriptor = `<</Type /FontDescriptor /FontName /${fontName}`;
                for(const fontDescItem of font.fontDescItems) {
                    fontDescriptor += ` /${fontDescItem.name} ${fontDescItem.value}`;
                }
                fontDescriptor += ` /FontFile2 ${font.fileObjectNumber} 0 R`;
                fontDescriptor += '>>';
                this._put(fontDescriptor);
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