import * as fs from 'fs';
import * as fpdf from '../../src';

const fontFamilyName: string = process.argv[3];
const fontFileName: string = process.argv[4];
const customFont = new fpdf.CustomFont(fontFamilyName, fs.readFileSync(fontFileName).buffer);

const pdf = new fpdf.FPdf();

pdf.addPage();
pdf.addCustomFont(fontFileName, '', customFont);
pdf.setFont(fontFileName, '', 16);
pdf.text(100, 100, 'This is some extended látin text. But not too extended.');
pdf.text(200, 200, 'Her şahsın öğrenim hakkı vardır.');
pdf.output('examples/unicode.pdf');
