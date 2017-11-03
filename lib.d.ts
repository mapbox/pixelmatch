export = PixelmatchFunction;

declare function PixelmatchFunction(img1: Buffer, img2: Buffer, output: Buffer | null, width: number, height: number, options: PixelmatchFunction.Options | undefined): number;

declare namespace PixelmatchFunction {
    export interface Options {
        // Matching threshold, ranges from 0 to 1. Smaller values make the comparison more sensitive. 0.1 by default.
        readonly threshold?: number;

        // If true, disables detecting and ignoring anti-aliased pixels. false by default.
        readonly includeAA?: boolean;
    }
}