import * as fs from 'fs';
import * as fpdf from '../../src';

const fontFamilyName: string = process.argv[3];
const fontFileName: string = process.argv[4];
const customFont = new fpdf.CustomFont(fontFamilyName, fs.readFileSync(fontFileName).buffer);
const pdf = new fpdf.FPdf();
pdf.addCustomFont(fontFamilyName, '', customFont);
pdf.setFont(fontFamilyName);
pdf.addPage();
pdf.text(100, 100, `Hello ${fontFamilyName}!`);
pdf.output('examples/custom_font.pdf');
