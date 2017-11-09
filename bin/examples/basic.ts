import * as fpdf from '../../src/fpdf';

const pdf = new fpdf.FPdf();

pdf.addPage();
pdf.setFont('Helvetica', '', 16);
pdf.text(100, 100, 'Testing 1 2 3');
pdf.output('examples/basic.pdf');