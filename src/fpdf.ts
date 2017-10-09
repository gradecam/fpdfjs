import * as fs from 'fs';
import * as font from './font';

// FIXME: all this font json stuff should be included in font.ts, and then exported WITH type information
import * as courier from '../fonts/courier.afm.json';
import * as helvetica from '../fonts/helvetica.afm.json';
import * as times from '../fonts/times.afm.json';
import * as adobeStandardEncoding from '../fonts/adobe-standard-encoding.cmap.json';

// FIXME: this shouldn't be in this project at all. It should be passed in from the calling module
import * as OpenSans from '../fonts/opensans.afm.json';


const typedAdobeStandardEncoding: font.CMAPData = <any>adobeStandardEncoding;

export class FPdf {

    /**
     * The version of the PDF spec that we are targeting
     * 
     * @type {String}
     *
     * FIXME: the current version is 1.7. FPDF uses 1.3. Investigate this and see if we are in compliance
     *        with 1.7. If we are just bump the version up.
     */
    readonly pdfVersion = '1.3';

    /**
     * PDF documents contain elements called "objects". They are numbered. This is to keep track of the
     * current number
     * 
     * @type {Number}
     *
     * FIXME: I don't know why FPDF starts at 2. I see other tutorials starting at 1. Figure out what
     *        the right / best thing to do here is
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
        // FIXME: - the fonts should be of type any when they are imported. <any> shouldn't be necessary
        //        - we should make a real class for the core fonts
        this._coreFonts['helvetica'] = {name: 'Helvetica', data:  <any>helvetica};
        // this._coreFonts['helveticaB'] = true;
        // this._coreFonts['helveticaI'] = true;
        // this._coreFonts['helveticaBI'] = true;
        this._coreFonts['courier'] = {name: 'Courier', data:  <any>courier};
        // this._coreFonts['courierB'] = true;
        // this._coreFonts['courierI'] = true;
        // this._coreFonts['courierBI'] = true;
        this._coreFonts['times'] = {name: 'Times-Roman', data:  <any>times};
        // this._coreFonts['timesB'] = true;
        // this._coreFonts['timesI'] = true;
        // this._coreFonts['timesBI'] = true;
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
        // // Terminate document
        // if($this->state==3)
        //     return;
        if(this._pages.length == 0) {
            this.addPage();
        }
        // // Page footer
        // $this->InFooter = true;
        // $this->Footer();
        // $this->InFooter = false;
        // // Close page
        // $this->_endpage();

        // Close document
        this._enddoc();
    }

    addPage(size?: any, orientation?: any, rotation?: any) {

        // Start a new page

        // if($this->state==3)
        //     $this->Error('The document is closed');
        // $family = $this->FontFamily;
        // $style = $this->FontStyle.($this->underline ? 'U' : '');
        // $fontsize = $this->FontSizePt;
        // $lw = $this->LineWidth;
        // $dc = $this->DrawColor;
        // $fc = $this->FillColor;
        // $tc = $this->TextColor;
        // $cf = $this->ColorFlag;
        // if($this->page>0)
        // {
        //     // Page footer
        //     $this->InFooter = true;
        //     $this->Footer();
        //     $this->InFooter = false;
        //     // Close page
        //     $this->_endpage();
        // }

        // FIXME: the logic around how the fonts get set and how the pages get added is really convoluted and confusing
        //        try to make it clear and simple
        const curFontKey = this._currentFontKey
        // Start new page
        this._beginpage(size, orientation, rotation);

        // Set line cap style to square
        this._putToCurrentPage('2 J');

        // // Set line width
        // $this->LineWidth = $lw;
        // $this->_out(sprintf('%.2F w',$lw*$this->k));
        this._putToCurrentPage(`${this._pen.lineWidth.toFixed(2)} w`);
        // // Set font
        // console.log('Add Page:', this._currentFontKey, this._currentFontSize);
        if(curFontKey && this._currentFontSize) {
            // console.log('setting the font again!');
            this.setFont(curFontKey, this._currentFontSize);
        }
        // // Set colors
        // $this->DrawColor = $dc;
        // if($dc!='0 G')
        //     $this->_out($dc);
        // $this->FillColor = $fc;
        // if($fc!='0 g')
        //     $this->_out($fc);
        // $this->TextColor = $tc;
        // $this->ColorFlag = $cf;
        // // Page header
        // $this->InHeader = true;
        // $this->Header();
        // $this->InHeader = false;
        // // Restore line width
        // if($this->LineWidth!=$lw)
        // {
        //     $this->LineWidth = $lw;
        //     $this->_out(sprintf('%.2F w',$lw*$this->k));
        // }
        // // Restore font
        // if($family)
        //     $this->SetFont($family,$style,$fontsize);
        // // Restore colors
        // if($this->DrawColor!=$dc)
        // {
        //     $this->DrawColor = $dc;
        //     $this->_out($dc);
        // }
        // if($this->FillColor!=$fc)
        // {
        //     $this->FillColor = $fc;
        //     $this->_out($fc);
        // }
        // $this->TextColor = $tc;
        // $this->ColorFlag = $cf;
    }

    strokeColor(red: number, green: number, blue: number) {
        this.$strokeColor(red/255, green/255, blue/255);
    }

    getTextWidth(text: string): number {
        if(!this._currentFont || !this._currentFontSize) {
            throw new Error("getStringWidth: A font and size must be set before measuring text");
        }

        return this._currentFont.getTextWidth(text, this._currentFontSize);

        // for(const char of s) {
        //     totalWidth += font.characterWidths[char];
        // }
        // return totalWidth * this._currentFontSize / 1000;

        // $cw = &$this->CurrentFont['cw'];
        // $w = 0;
        // $l = strlen($s);
        // for($i=0;$i<$l;$i++)
        //     $w += $cw[$s[$i]];
        // return $w*$this->FontSize/1000;
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
        // console.error(`${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} RG`);
        this._putToCurrentPage(`${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} RG `);
    }

    addFont(fontKey: string): void;
    addFont(family: string, style: string): void;
    addFont(...args: any[]): void {
        // 
        // right now this can only actually add one of the standard PDF fonts
        // 

        let {fontKey, size} = this._extractSetFontArgs(args.concat([0]));
        // // create a normalized, unique identifier for the font
        // let fontKey = this._getFontKey(family, style);

        // if the font is already loaded then we are done
        if(this._fonts[fontKey]) {
            return;
        }

        // if the file is not specified then we assume it's a standard font
        // if(!file) {
        //     file = `fonts/${fontKey}.json`;
        // } else {
        //     throw new Error("we can't actually handle passing in font files / descriptors at this point");
        // }
        const file = `fonts/${fontKey}.json`;

        // let info = this._loadfont(file);
        // $info['i'] = count($this->fonts)+1;
        // if(!empty($info['file']))
        // {
        //     // Embedded font
        //     if($info['type']=='TrueType')
        //         $this->FontFiles[$info['file']] = array('length1'=>$info['originalsize']);
        //     else
        //         $this->FontFiles[$info['file']] = array('length1'=>$info['size1'], 'length2'=>$info['size2']);
        // }
        const fontIndex = Object.keys(this._fonts).length + 1;
        if(this._coreFonts[fontKey]) {
            this._fonts[fontKey] = new font.Font(fontIndex, this._coreFonts[fontKey].name, this._coreFonts[fontKey].data, typedAdobeStandardEncoding);
        } else {
            if(args.length < 2) {
                // FIXME, this is all kind of dumb. we should probably do a lot of refactoring here
                throw new Error("non-core fonts can't be added directly with a font key");
            }
            this._fonts[fontKey] = new font.Font(fontIndex, args[0], <any>OpenSans);
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
        // 
        // right now this can only actually add one of the standard PDF fonts
        // 

        const {fontKey, size} = this._extractSetFontArgs(args);
        // console.log('enter setFont:', this._currentFontKey, fontKey, this._currentFontSize, size);
        

        // if this is already the current font just bail
        if(fontKey == this._currentFontKey && size == this._currentFontSize) {
            // console.error("font hasn't changed returning");
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
            // FIXME: it seems weird that sometimes we just ignore this. Look into refactoring this that doesn't happen
        }

        // console.log('leave setFont:', this._currentFontKey, fontKey, this._currentFontSize, size);
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

        // FIXME: the text here needs to be escaped if it contains any of (, ), \, \r
        const s = `BT ${x.toFixed(2)} ${y.toFixed(2)} Td (${text}) Tj ET`;
        // $s = sprintf('BT %.2F %.2F Td (%s) Tj ET',$x*$this->k,($this->h-$y)*$this->k,$this->_escape($txt));
        // if($this->underline && $txt!='')
        //     $s .= ' '.$this->_dounderline($x,$y,$txt);
        // if($this->ColorFlag)
        //     $s = 'q '.$this->TextColor.' '.$s.' Q';
        this._putToCurrentPage(s);
    }

    _transformPoint(x: number, y: number): {x: number; y: number} {
        // console.error('this._currentPage.height - y:', `${this._currentPage.height} ${y}`);
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
        // $this->state = 2;
        // $this->x = $this->lMargin;
        // $this->y = $this->tMargin;

        this._currentFontKey = null;

        // // Check page size and orientation
        // if($orientation=='')
        //     $orientation = $this->DefOrientation;
        // else
        //     $orientation = strtoupper($orientation[0]);
        let pageDimensions;
        if(!size) {
            pageDimensions = this._getpagesize('Letter');
        } else {
            pageDimensions = this._getpagesize(size);
        }

        this._pages.push(new Page(pageDimensions.width, pageDimensions.height));
        //     
        // if($orientation!=$this->CurOrientation || $size[0]!=$this->CurPageSize[0] || $size[1]!=$this->CurPageSize[1])
        // {
        //     // New size or orientation
        //     if($orientation=='P')
        //     {
        //         $this->w = $size[0];
        //         $this->h = $size[1];
        //     }
        //     else
        //     {
        //         $this->w = $size[1];
        //         $this->h = $size[0];
        //     }
        //     $this->wPt = $this->w*$this->k;
        //     $this->hPt = $this->h*$this->k;
        //     $this->PageBreakTrigger = $this->h-$this->bMargin;
        //     $this->CurOrientation = $orientation;
        //     $this->CurPageSize = $size;
        // }
        // if($orientation!=$this->DefOrientation || $size[0]!=$this->DefPageSize[0] || $size[1]!=$this->DefPageSize[1])
        //     $this->PageInfo[$this->page]['size'] = array($this->wPt, $this->hPt);
        // if($rotation!=0)
        // {
        //     if($rotation%90!=0)
        //         $this->Error('Incorrect rotation value: '.$rotation);
        //     $this->CurRotation = $rotation;
        //     $this->PageInfo[$this->page]['rotation'] = $rotation;
        // }
    }

    /**
     * Begins a new object
     *
     * FIXME: Should we just be outputing the opening line here? Or should we map PDF objects to TypeScript
     *        objects and manage them that way?
     */
    _newobj(objectNumber?: number): number {
        if(objectNumber === undefined) {
            objectNumber = ++this._currentObjectNumber;
        }

        const newObj = new PdfObject(objectNumber, this._getoffset());
        this._objects.push(newObj);

        // FIXME: The first number is the object number, the second is the generation number. What does that mean?
        //        https://brendanzagaeski.appspot.com/0004.html
        this._put(`${objectNumber} 0 obj`);
        // $this->_put($n.' 0 obj');
        return objectNumber;
    }

    // _loadfont(font: string) {

    //     // Load a font definition file from the font directory
    //     // if(strpos($font,'/')!==false || strpos($font,"\\")!==false)
    //     //     $this->Error('Incorrect font definition file name: '.$font);
    //     // include($this->fontpath.$font);
    //     // if(!isset($name))
    //     //     $this->Error('Could not include font definition file');
    //     // if(isset($enc))
    //     //     $enc = strtolower($enc);
    //     // if(!isset($subsetted))
    //     //     $subsetted = false;
    //     // return get_defined_vars();
    // }

    _getoffset() {
        return this._buffer.length;
    }

    /**
     * _put actually appends the string to the buffer (which right now is just stdout)
     */
    _put(s: string) {
        // console.error(s);
        this._buffer += s + "\n";
    }

    _putToCurrentPage(s: string) {
        this._putToPage(s, this._pages.length - 1);
    }

    _putToPage(s: string, pageNumber: number) {
        // console.log('writing to page:', s);
        this._pages[pageNumber].buffer += s + "\n";
    }

    _putresources() {
        this._putfonts();
        // $this->_putimages();
        // // Resource dictionary
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
        // foreach($this->fonts as $font)
        //     $this->_put('/F'.$font['i'].' '.$font['n'].' 0 R');
        this._put('>>');
        this._put('/XObject <<');
        // $this->_putxobjectdict();
        this._put('>>');
    }

    _putinfo()
    {
        this._metadata.push({name: 'Producer', value: `FPdf.js`});
        this._metadata.push({name: 'CreationDate', value: this._formatDate(new Date)});
        // $this->metadata['Producer'] = 'FPDF '.FPDF_VERSION;
        // $this->metadata['CreationDate'] = 'D:'.@date('YmdHis');
        // foreach($this->metadata as $key=>$value)
        //     $this->_put('/'.$key.' '.$this->_textstring($value));
        for(const oneMeta of this._metadata) {
            // FIXME: what does _textstring and do we need to put it in here?
            // $this->_put('/'.$key.' '.$this->_textstring($value));
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
        // $this->state = 3;

    }

    _putcatalog()
    {
        // $n = $this->PageInfo[1]['n'];
        this._put('/Type /Catalog');
        this._put('/Pages 1 0 R');
        // if($this->ZoomMode=='fullpage')
        //     $this->_put('/OpenAction ['.$n.' 0 R /Fit]');
        // elseif($this->ZoomMode=='fullwidth')
        //     $this->_put('/OpenAction ['.$n.' 0 R /FitH null]');
        // elseif($this->ZoomMode=='real')
        //     $this->_put('/OpenAction ['.$n.' 0 R /XYZ null null 1]');
        // elseif(!is_string($this->ZoomMode))
        //     $this->_put('/OpenAction ['.$n.' 0 R /XYZ null null '.sprintf('%.2F',$this->ZoomMode/100).']');
        // if($this->LayoutMode=='single')
        //     $this->_put('/PageLayout /SinglePage');
        // elseif($this->LayoutMode=='continuous')
        //     $this->_put('/PageLayout /OneColumn');
        // elseif($this->LayoutMode=='two')
        //     $this->_put('/PageLayout /TwoColumnLeft');
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
        // $nb = $this->page;
        // for($n=1;$n<=$nb;$n++)
        //     $this->PageInfo[$n]['n'] = $this->n+1+2*($n-1);

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
        // if($this->DefOrientation=='P')
        // {
        //     $w = $this->DefPageSize[0];
        //     $h = $this->DefPageSize[1];
        // }
        // else
        // {
        //     $w = $this->DefPageSize[1];
        //     $h = $this->DefPageSize[0];
        // }

        // FIXME: figure out what these numbers mean and do the calculation properly
        // this._put(sprintf('/MediaBox [0 0 %.2F %.2F]',$w*$this->k,$h*$this->k));
        this._put(`/MediaBox [0 0 ${this._currentPage.width.toFixed(2)} ${this._currentPage.height.toFixed(2)}]`);

        this._put('>>');
        this._put('endobj');
    }

    _putpage(page: Page) {
        this._newobj();
        page.objectNumber = this._currentObjectNumber;
        this._put('<</Type /Page');
        this._put('/Parent 1 0 R');
        // if(isset($this->PageInfo[$n]['size']))
        //     $this->_put(sprintf('/MediaBox [0 0 %.2F %.2F]',$this->PageInfo[$n]['size'][0],$this->PageInfo[$n]['size'][1]));
        // if(isset($this->PageInfo[$n]['rotation']))
        //     $this->_put('/Rotate '.$this->PageInfo[$n]['rotation']);
        this._put('/Resources 2 0 R');
        // if(isset($this->PageLinks[$n]))
        // {
        //     // Links
        //     $annots = '/Annots [';
        //     foreach($this->PageLinks[$n] as $pl)
        //     {
        //         $rect = sprintf('%.2F %.2F %.2F %.2F',$pl[0],$pl[1],$pl[0]+$pl[2],$pl[1]-$pl[3]);
        //         $annots .= '<</Type /Annot /Subtype /Link /Rect ['.$rect.'] /Border [0 0 0] ';
        //         if(is_string($pl[4]))
        //             $annots .= '/A <</S /URI /URI '.$this->_textstring($pl[4]).'>>>>';
        //         else
        //         {
        //             $l = $this->links[$pl[4]];
        //             if(isset($this->PageInfo[$l[0]]['size']))
        //                 $h = $this->PageInfo[$l[0]]['size'][1];
        //             else
        //                 $h = ($this->DefOrientation=='P') ? $this->DefPageSize[1]*$this->k : $this->DefPageSize[0]*$this->k;
        //             $annots .= sprintf('/Dest [%d 0 R /XYZ 0 %.2F null]>>',$this->PageInfo[$l[0]]['n'],$h-$l[1]*$this->k);
        //         }
        //     }
        //     $this->_put($annots.']');
        // }
        // if($this->WithAlpha)
        //     $this->_put('/Group <</Type /Group /S /Transparency /CS /DeviceRGB>>');

        // FIXME: why are we referencing an object that hasn't been written yet?
        this._put(`/Contents ${this._currentObjectNumber + 1} 0 R>>`);

        this._put('endobj');
        // // Page content
        // if(!empty($this->AliasNbPages))
        //     $this->pages[$n] = str_replace($this->AliasNbPages,$this->page,$this->pages[$n]);
        // $this->_putstreamobject($this->pages[$n]);
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
            // console.log(font.fileData.toString('hex'));
            console.log('font.fileData.byteLength:', font.fileData.byteLength);
            console.log('font.fileData.toString(binary).length:', font.fileData.toString('binary').length);
            this._putstream(font.fileData.toString('binary'));
            this._put('endobj');
        }
        // foreach($this->FontFiles as $file=>$info)
        // {
        //     // Font file embedding
        //     $this->_newobj();
        //     $this->FontFiles[$file]['n'] = $this->n;
        //     $font = file_get_contents($this->fontpath.$file,true);
        //     if(!$font)
        //         $this->Error('Font file not found: '.$file);
        //     $compressed = (substr($file,-2)=='.z');
        //     if(!$compressed && isset($info['length2']))
        //         $font = substr($font,6,$info['length1']).substr($font,6+$info['length1']+6,$info['length2']);
        //     $this->_put('<</Length '.strlen($font));
        //     if($compressed)
        //         $this->_put('/Filter /FlateDecode');
        //     $this->_put('/Length1 '.$info['length1']);
        //     if(isset($info['length2']))
        //         $this->_put('/Length2 '.$info['length2'].' /Length3 0');
        //     $this->_put('>>');
        //     $this->_putstream($font);
        //     $this->_put('endobj');
        // }
        for(let fontKey of Object.keys(this._fonts)) {
            const font = this._fonts[fontKey];
            //     // Encoding
            //     if(isset($font['diff']))
            //     {
            //         if(!isset($this->encodings[$font['enc']]))
            //         {
            //             $this->_newobj();
            //             $this->_put('<</Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ['.$font['diff'].']>>');
            //             $this->_put('endobj');
            //             $this->encodings[$font['enc']] = $this->n;
            //         }
            //     }
            //     // ToUnicode CMap
            //     if(isset($font['uv']))
            //     {
            //         if(isset($font['enc']))
            //             $cmapkey = $font['enc'];
            //         else
            //             $cmapkey = $font['name'];
            //         if(!isset($this->cmaps[$cmapkey]))
            //         {
            //             $cmap = $this->_tounicodecmap($font['uv']);
            //             $this->_putstreamobject($cmap);
            //             $this->cmaps[$cmapkey] = $this->n;
            //         }
            //     }

            // Font object
            // $this->fonts[$k]['n'] = $this->n+1;
            // $type = $font['type'];
            // $name = $font['name'];
            // if($font['subsetted'])
            //     $name = 'AAAAAA+'.$name;
            const fontName = `AAAAAA+${font.name}-Regular`;
            if(font.type == 'Core') {
                // Core font
                font.objectNumber = this._newobj();
                this._put('<</Type /Font');
                this._put(`/BaseFont /${fontName}`);
                this._put('/Subtype /Type1');
            //     if($name!='Symbol' && $name!='ZapfDingbats')
            //         $this->_put('/Encoding /WinAnsiEncoding');
            //     if(isset($font['uv']))
            //         $this->_put('/ToUnicode '.$this->cmaps[$cmapkey].' 0 R');
                this._put('>>');
                this._put('endobj');
            } else if(font.type == 'Type1' || font.type == 'TrueType') {
                if(font.type == 'Type1') {
                    throw new Error('Embedded Type1 fonts are not actually supprted at this point');
                }

                // Additional Type1 or TrueType/OpenType font
                font.objectNumber = this._newobj();
                this._put('<</Type /Font');
                this._put(`/BaseFont /${fontName}`);
                this._put(`/Subtype /${font.type}`);
                this._put('/FirstChar 32 /LastChar 255');
                // FIXME: This look head sort of thing for getting the object numbers is weird.
                //        I think it would be better to create the objects all up front, have each
                //        grab it's own number, and the stream them out
                this._put(`/Widths ${font.objectNumber+1} 0 R`);
                this._put(`/FontDescriptor ${font.objectNumber+2} 0 R`);
                //         if(isset($font['diff']))
                //             $this->_put('/Encoding '.$this->encodings[$font['enc']].' 0 R');
                //         else
                //             $this->_put('/Encoding /WinAnsiEncoding');
                //         if(isset($font['uv']))
                //             $this->_put('/ToUnicode '.$this->cmaps[$cmapkey].' 0 R');
                this._put('>>');
                this._put('endobj');

                // Widths
                this._newobj();
                // FIXME: this only works because the fonts I'm using now are encoded as unicode. In order to handle a
                //        font with a different encoding you'd need to map from character codes to unicode code points
                const charWidths: number[] = [];
                // for(let i = 32; i < 256; i++) {
                //     if(font.characterWidths[String.fromCharCode(i)]) {
                //         charWidths.push(font.characterWidths[String.fromCharCode(i)]);
                //     } else {
                //         charWidths.push(600);
                //     }
                    
                // }
                // this._put(`[${charWidths.join(' ')}]`);
                this._put('[260 267 401 646 572 823 730 221 296 296 552 572 245 322 266 367 572 572 572 572 572 572 572 572 572 572 266 266 572 572 572 429 899 633 648 631 729 556 516 728 738 279 267 614 519 903 754 779 602 779 618 549 553 728 595 926 577 560 571 329 367 329 542 448 577 556 613 476 613 561 339 548 614 253 253 525 253 930 614 604 613 613 408 477 353 614 501 778 524 504 468 379 551 379 572 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 600 260 267 572 572 572 572 551 516 577 832 354 497 572 322 832 500 428 572 347 347 577 619 655 266 227 347 375 497 780 780 780 429 633 633 633 633 633 633 873 631 556 556 556 556 279 279 279 279 722 754 779 779 779 779 779 572 779 728 728 728 728 560 611 622 556 556 556 556 556 556 858 476 561 561 561 561 253 253 253 253 596 614 604 604 604 604 604 572 604 614 614 614 614 504 613 504 ]');
                this._put('endobj');

                // Descriptor
                this._newobj();
                let fontDescriptor = `<</Type /FontDescriptor /FontName /${fontName}`;
                for(const fontDescItem of font.fontDescItems) {
                    fontDescriptor += ` /${fontDescItem.name} ${fontDescItem.value}`;
                }
                fontDescriptor += ` /FontFile2 ${font.fileObjectNumber} 0 R`;
                //         if(!empty($font['file']))
                //             $s .= ' /FontFile'.($type=='Type1' ? '' : '2').' '.$this->FontFiles[$font['file']]['n'].' 0 R';
                fontDescriptor += '>>';
                this._put(fontDescriptor);
                this._put('endobj');
            }
            //     else
            //     {
            //         // Allow for additional types
            //         $mtd = '_put'.strtolower($type);
            //         if(!method_exists($this,$mtd))
            //             $this->Error('Unsupported font type: '.$type);
            //         $this->$mtd($font);
            //     }
        }
    }


    _putstreamobject(data: string) {
        // if($this->compress)
        // {
        //     $entries = '/Filter /FlateDecode ';
        //     $data = gzcompress($data);
        // }
        // else
        //     $entries = '';

        // FIXME: is there a reason for the weird ordering of these lines? Does it matter?
        //        does it depend on compression being on or off?
        // console.log('_putstreamobject data:', data.split(''));
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

    // default to 2mm
    // FIXME: This is from FPDF. I have no idea if it's a good default or where it came from. The comments
    //        there say that it's 2mm but I don't think that's right
    lineWidth = 0.567;
}