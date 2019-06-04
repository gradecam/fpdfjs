import { RuleValue } from './const';

export function formatFloat(value: number): string {
    return value.toFixed(3);
}

export function windingRule(rule?: RuleValue): string {
    if(rule && /even-?odd/.test(rule)) {
      return '*';
    }
    return '';
}

// padStart and padEnd are in es2017 making this unnecessary
// find all places where this is used and remove it
export function pad(s: number | string, length: number) {
    return (Array(length + 1).join('0') + s).slice(-length);
}

export class PdfObject {
    objectNumber: number;
    offset: number;

    constructor(objectNumber: number, offset: number) {
        this.objectNumber = objectNumber;
        this.offset = offset;
    }
}

export class Pen {
    lineWidth = 0.567;
}

export class Page {
    width: number;
    height: number;
    objectNumber: number | undefined;
    buffer = '';

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }
}
