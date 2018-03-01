import * as fs from 'fs';
import * as fpdf from '../../src/fpdf';
import * as font from '../../src/font';

// const afmDataBuffer = fs.readFileSync('fonts/custom-json/opensans-regular.afm.json');
// const afmData: font.AFMData = JSON.parse(afmDataBuffer.toString());
// const openSans = new font.Font(afmData.postScriptName || 'OpenSans', afmData);

// const openSans = new font.CustomFont('OpenSans', '/Users/rick/code/personal/fpdf/pktest/Open_Sans/OpenSans-Regular.ttf');
// const openSans = font.Font.createCustomFont('/Users/rick/code/personal/fpdf/pktest/Open_Sans/OpenSans-Regular.ttf', 'OpenSans');

const pdf = new fpdf.FPdf();

pdf.addPage();
// pdf.addFont('OpenSans', '', 'fonts/custom-json/opensans-regular.afm.json');
// pdf.addCustomFont('OpenSans', '', openSans);
// pdf.setFont('OpenSans', '', 16);
// // pdf.setFont('Helvetica', '', 16);
// pdf.text(100, 100, 'This is some extended látin text. But not too extended.');
// pdf.text(200, 200, 'Her şahsın öğrenim hakkı vardır.');
pdf.drawRect(100, 100, 200, 200);
pdf.output('examples/shapes.pdf');
