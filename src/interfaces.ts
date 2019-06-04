export enum OriginAdjustmentChoices {
    none = "none",
    shift = "shift",
    shiftAndFlip = "shiftAndFlip",
}

export interface PdfOpts {
    originAdjustment?: boolean | OriginAdjustmentChoices;
}

export interface DrawOpts {
    fill?: boolean;
    stroke?: boolean;
}

export interface ScaleOpts {
    origin?: {
        x: number;
        y:number;
    }
}

export interface TextOptions {
    width?: number;
    align?: 'right' | 'center' | string;
    characterSpacing?: number;
}

export interface DashOptions {
    space?: number;
    phase?: number;
}

export interface RotateOptions {
    origin?: {
        x: number;
        y:number;
    }
}