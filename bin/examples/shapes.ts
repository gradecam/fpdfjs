import * as fs from 'fs';
import * as fpdf from '../../src/fpdf';
import * as font from '../../src/font';

const pdf = new fpdf.FPdf();
pdf.addPage();
pdf.drawRect(100, 100, 200, 200);
pdf.output('examples/shapes.pdf');
