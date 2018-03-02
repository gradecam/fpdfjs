import * as fpdf from '../../src';

const pdf = new fpdf.FPdf();
pdf.addPage();
pdf.output('examples/blank.pdf');
