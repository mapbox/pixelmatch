/// <reference types="node" />
export interface Options {
    threshold: number;
    includeAA: boolean;
    alpha: number;
    aaColor: Array<number>;
    diffColor: Array<number>;
    diffMask: boolean;
}
export default class Pixelmatch {
    constructor();
    static default: Options;
    /**
     * Workaround instanfeof Uint8Array not working properly in some Jest environments
     *
     * @param arr
     */
    private static _isPixelData;
    /**
     * Blend semi-transparent color with white
     *
     * @param c
     * @param a
     */
    private static _blend;
    /**
     * RGB to grayscale
     *
     * @param r Red
     * @param g Green
     * @param b Blue
     */
    private static _rgb2y;
    /**
     * RGB to ?
     *
     * @param r Red
     * @param g Green
     * @param b Blue
     */
    private static _rgb2i;
    /**
     * RGB to ?
     *
     * @param r Red
     * @param g Green
     * @param b Blue
     */
    private static _rgb2q;
    /**
     * Check if a pixel has 3+ adjacent pixels of the same color.
     *
     * @param img
     * @param x1
     * @param y1
     * @param width
     * @param height
     */
    private static _hasManySiblings;
    /**
     * Calculate color difference according to the paper "Measuring perceived color difference
     * using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos
     *
     * @param img1
     * @param img2
     * @param k
     * @param m
     * @param yOnly
     */
    private static _colorDelta;
    /**
     * Check if a pixel is likely a part of anti-aliasing;
     * based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V. Vysniauskas, 2009
     *
     * @param img
     * @param img2
     * @param x1
     * @param y1
     * @param width
     * @param height
     */
    private static _antialiased;
    /**
     * Draw pixel
     *
     * @param output
     * @param pos Position
     * @param r Red
     * @param g Green
     * @param b Blue
     */
    private static _drawPixel;
    /**
     * Draw grey pixel
     *
     * @param img
     * @param i
     * @param alpha
     * @param output
     */
    private static _drawGrayPixel;
    static match(img1: Uint8Array, img2: Uint8Array, output: Buffer | null, width: number, height: number, options: Partial<Options>): number;
}
