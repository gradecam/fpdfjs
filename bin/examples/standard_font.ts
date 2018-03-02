import * as fpdf from '../../src';

const pdf = new fpdf.FPdf();
pdf.addPage();
pdf.text(100, 100, 'Hello Helvetica!');
pdf.output('examples/standard_font.pdf');
