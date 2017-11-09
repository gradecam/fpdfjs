import * as fs from 'fs';
import * as readline from 'readline';
import {AFMData, GlyphMetrics} from '../font';

interface ParserState {
    startTrigger?: string;
    endTrigger?: string;
    lineHandler: (line: string) => void;
}

export class Parser {
    private currentState = 0;
    private afmData: AFMData = {
        type: 'Core',
        fontMetrics: {
            ascender: -1,
            descender: -1
        },
        glyphMetrics: []
    };

    private states: ParserState[] = [
        {
            lineHandler: (line) => {
                // console.warn('Begin parsing...');
            }
        },
        {
            startTrigger: 'StartFontMetrics',
            lineHandler: (line) => {
                const parts = line.split(' ');
                const firstWord = parts[0];

                if(firstWord == 'Ascender') {
                    this.afmData.fontMetrics.ascender = parseInt(parts[1], 10);
                } else if(firstWord == 'Descender') {
                    this.afmData.fontMetrics.descender = parseInt(parts[1], 10);
                }
            }
        },
        {
            startTrigger: 'StartCharMetrics',
            endTrigger: 'EndCharMetrics',
            lineHandler: (line) => {
                const parts = line.split(' ');
                // FIXME: it would probably be better to:
                // - fist split this by ';'
                // - then create an object based on the key value pairs
                // - access them that way
                if(parts[0] != 'C') { throw new Error('bad char metric line'); }
                if(parts[2] != ';') { throw new Error('bad char metric line'); }
                if(parts[3] != 'WX') { throw new Error('bad char metric line'); }
                if(parts[5] != ';') { throw new Error('bad char metric line'); }
                if(parts[6] != 'N') { throw new Error('bad char metric line'); }
                if(parts[8] != ';') { throw new Error('bad char metric line'); }
                const glyphMetrics: GlyphMetrics = {charCode: parseInt(parts[1], 10), width: parseInt(parts[4], 10), name: parts[7]};
                this.afmData.glyphMetrics.push(glyphMetrics);
            }
        },
        {
            startTrigger: 'StartKernPairs',
            endTrigger: 'EndKernPairs',
            lineHandler: (line) => {
                // console.error('kernMetricLine:', line);
            }
        },
        {
            lineHandler: (line) => {
                // console.error('finishing up');
            }
        }
    ];


    parse(fontName: string) {
        const filename = `./fonts/standard/${fontName}.afm`;
        var lineReader = readline.createInterface({
            input: require('fs').createReadStream(filename)
        });

        lineReader.on('line', (line) => {
            const firstWord = line.split(' ')[0];
            const thisIsTheLastState = this.states.length > this.currentState + 1 ? false : true;
            if(firstWord == this.states[this.currentState].endTrigger) {
                this.currentState++;
                if(thisIsTheLastState) { return; }
            }

            this.states[this.currentState].lineHandler(line);

            if(this.states.length > this.currentState + 1) {
                if(firstWord == this.states[this.currentState + 1].startTrigger) {
                    this.currentState++;
                }
            }
        });

        lineReader.on('close', () => {
            const filename = `./fonts/standard-json/${fontName.toLowerCase()}.afm.json`;
            fs.writeFile(filename, JSON.stringify(this.afmData, null, 4), (err) => {
                if(err) {
                    throw new Error(`saving font data to file ${filename} failed`);
                }
                console.warn(`font data saved to ${filename}`);
            });
        });
    }
}
