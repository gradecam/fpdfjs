import {Parser} from '../src/parsers/afm';

const fontName = process.argv[3];
console.warn(`converting standard font '${fontName}'`);

const afmParser = new Parser();
afmParser.parse(fontName);
