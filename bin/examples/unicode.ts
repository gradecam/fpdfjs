import * as fpdf from '../../src/fpdf';

const pdf = new fpdf.FPdf();

pdf.addPage();
// pdf.addFont('OpenSans', '', 'fonts/custom-json/opensans-regular.afm.json');
pdf.setFont('Helvetica', '', 16);
pdf.text(100, 100, 'This is some extended látin text. But not too extended.');
pdf.output('examples/unicode.pdf');
