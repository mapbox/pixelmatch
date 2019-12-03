export interface Options {
  threshold: number; // matching threshold (0 to 1); smaller is more sensitive
  includeAA: boolean; // whether to skip anti-aliasing detection
  alpha: number; // opacity of original image in diff ouput
  aaColor: Array<number>; // color of anti-aliased pixels in diff output
  diffColor: Array<number>; // color of different pixels in diff output
  diffMask: boolean; // draw the diff over a transparent background (a mask)
}

export default class Pixelmatch {
  constructor() {
  }

  static default: Options = {
    threshold: 0.005,
    includeAA: false,
    alpha: 0.1,
    aaColor: [255, 255, 0],
    diffColor: [255, 0, 0],
    diffMask: false
  }

  /**
   * Workaround instanfeof Uint8Array not working properly in some Jest environments
   * 
   * @param arr 
   */
  private static _isPixelData(arr: Uint8Array): boolean {
    // @ts-ignore
    return ArrayBuffer.isView(arr) && arr.constructor.BYTES_PER_ELEMENT === 1;
  }

  /**
   * Blend semi-transparent color with white
   * 
   * @param c 
   * @param a 
   */
  private static _blend(c: number, a: number): number {
    return 255 + (c - 255) * a;
  }

  /**
   * RGB to grayscale
   * 
   * @param r Red
   * @param g Green
   * @param b Blue
   */
  private static _rgb2y(r: number, g: number, b: number): number {
    return r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
  }

  /**
   * RGB to ?
   * 
   * @param r Red
   * @param g Green
   * @param b Blue
   */
  private static _rgb2i(r: number, g: number, b: number): number {
    return r * 0.59597799 - g * 0.27417610 - b * 0.32180189;
  }


  /**
   * RGB to ?
   * 
   * @param r Red
   * @param g Green
   * @param b Blue
   */
  private static _rgb2q(r: number, g: number, b: number): number {
    return r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
  }

  /**
   * Check if a pixel has 3+ adjacent pixels of the same color.
   * 
   * @param img 
   * @param x1 
   * @param y1 
   * @param width 
   * @param height 
   */
  private static _hasManySiblings(img: Uint8Array, x1: number, y1: number, width: number, height: number): boolean {
    const x0 = Math.max(x1 - 1, 0);
    const y0 = Math.max(y1 - 1, 0);
    const x2 = Math.min(x1 + 1, width - 1);
    const y2 = Math.min(y1 + 1, height - 1);
    const pos = (y1 * width + x1) * 4;
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

    // go through 8 adjacent pixels
    for (let x = x0; x <= x2; x++) {
      for (let y = y0; y <= y2; y++) {
          if (x === x1 && y === y1) {
            continue
          };

          const pos2 = (y * width + x) * 4;
          if (img[pos] === img[pos2] &&
              img[pos + 1] === img[pos2 + 1] &&
              img[pos + 2] === img[pos2 + 2] &&
              img[pos + 3] === img[pos2 + 3]) {
            zeroes++
          };

          if (zeroes > 2) {
            return true
          };
      }
    }

    return false;
  }

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
  private static _colorDelta(img1: Uint8Array, img2: Uint8Array, k: number, m: number, yOnly?: boolean): number {
    let r1 = img1[k + 0];
    let g1 = img1[k + 1];
    let b1 = img1[k + 2];
    let a1 = img1[k + 3];

    let r2 = img2[m + 0];
    let g2 = img2[m + 1];
    let b2 = img2[m + 2];
    let a2 = img2[m + 3];

    if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) {
      return 0;
    }

    if (a1 < 255) {
        a1 /= 255;
        r1 = Pixelmatch._blend(r1, a1);
        g1 = Pixelmatch._blend(g1, a1);
        b1 = Pixelmatch._blend(b1, a1);
    }

    if (a2 < 255) {
        a2 /= 255;
        r2 = Pixelmatch._blend(r2, a2);
        g2 = Pixelmatch._blend(g2, a2);
        b2 = Pixelmatch._blend(b2, a2);
    }

    const y = Pixelmatch._rgb2y(r1, g1, b1) - Pixelmatch._rgb2y(r2, g2, b2);

    // brightness difference only
    if (yOnly) {
      return y
    };

    const i = Pixelmatch._rgb2i(r1, g1, b1) - Pixelmatch._rgb2i(r2, g2, b2);
    const q = Pixelmatch._rgb2q(r1, g1, b1) - Pixelmatch._rgb2q(r2, g2, b2);

    return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
  }
  
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
  private static _antialiased(img: Uint8Array, img2: Uint8Array, x1: number, y1: number, width: number, height: number): boolean {
    const x0 = Math.max(x1 - 1, 0);
    const y0 = Math.max(y1 - 1, 0);
    const x2 = Math.min(x1 + 1, width - 1);
    const y2 = Math.min(y1 + 1, height - 1);
    const pos = (y1 * width + x1) * 4;
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
    let min = 0;
    let max = 0;
    let minX = 0
    let minY = 0
    let maxX = 0
    let maxY = 0

    // go through 8 adjacent pixels
    for (let x = x0; x <= x2; x++) {
      for (let y = y0; y <= y2; y++) {
          if (x === x1 && y === y1) continue;

          // brightness delta between the center pixel and adjacent one
          const delta = Pixelmatch._colorDelta(img, img, pos, (y * width + x) * 4, true);

          // count the number of equal, darker and brighter adjacent pixels
          if (delta === 0) {
              zeroes++;
              // if found more than 2 equal siblings, it's definitely not anti-aliasing
              if (zeroes > 2) return false;

          // remember the darkest pixel
          } else if (delta < min) {
              min = delta;
              minX = x;
              minY = y;

          // remember the brightest pixel
          } else if (delta > max) {
              max = delta;
              maxX = x;
              maxY = y;
          }
      }
  }

  // if there are no both darker and brighter pixels among siblings, it's not anti-aliasing
  if (min === 0 || max === 0) return false;

  // if either the darkest or the brightest pixel has 3+ equal siblings in both images
  // (definitely not anti-aliased), this pixel is anti-aliased
  return (Pixelmatch._hasManySiblings(img, minX, minY, width, height) && Pixelmatch._hasManySiblings(img2, minX, minY, width, height)) ||
         (Pixelmatch._hasManySiblings(img, maxX, maxY, width, height) && Pixelmatch._hasManySiblings(img2, maxX, maxY, width, height));
  }

  /**
   * Draw pixel
   * 
   * @param output 
   * @param pos Position
   * @param r Red
   * @param g Green
   * @param b Blue
   */
  private static _drawPixel(output: Uint8Array, pos: number, r: number, g: number, b: number): void {
    output[pos + 0] = r
    output[pos + 1] = g
    output[pos + 2] = b
    output[pos + 3] = 255
  }
  
  /**
   * Draw grey pixel
   * 
   * @param img 
   * @param i 
   * @param alpha 
   * @param output 
   */
  private static _drawGrayPixel(img: Uint8Array, i: number, alpha: number, output: Uint8Array): void {
    const r = img[i + 0];
    const g = img[i + 1];
    const b = img[i + 2];
    const val = Pixelmatch._blend(Pixelmatch._rgb2y(r, g, b), alpha * img[i + 3] / 255);
    Pixelmatch._drawPixel(output, i, val, val, val);
  }

  static pixelmatch(img1: Uint8Array, img2: Uint8Array, output: Buffer | null, width: number, height: number, options: Partial<Options>): number {

    if (!Pixelmatch._isPixelData(img1) || !Pixelmatch._isPixelData(img2) || (output && !Pixelmatch._isPixelData(output))) {
        throw new Error('Image data: Uint8Array, Uint8ClampedArray or Buffer expected.');
    }

    if (img1.length !== img2.length || (output && output.length !== img1.length)) {
        throw new Error('Image sizes do not match.');
    }

    if (img1.length !== width * height * 4) {
      throw new Error('Image data size does not match width/height.');
    }

    const _options = Object.assign({}, Pixelmatch.default, options);

    // check if images are identical
    const len = width * height;
    const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len);
    const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len);
    let identical = true;

    for (let i = 0; i < len; i++) {
        if (a32[i] !== b32[i]) {
          identical = false;
          break;
        }
    }
    if (identical) { // fast path if identical
        if (output && !_options.diffMask) {
            for (let i = 0; i < len; i++) {
              Pixelmatch._drawGrayPixel(img1, 4 * i, _options.alpha, output);
            }
        }
        return 0;
    }

    // maximum acceptable square distance between two colors;
    // 35215 is the maximum possible value for the YIQ difference metric
    const maxDelta = 35215 * _options.threshold * _options.threshold;

    let diff = 0;
    const [aaR, aaG, aaB] = _options.aaColor;
    const [diffR, diffG, diffB] = _options.diffColor;

    // compare each pixel of one image against the other one
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {

            const pos = (y * width + x) * 4;

            // squared YUV distance between colors at this pixel position
            const delta = Pixelmatch._colorDelta(img1, img2, pos, pos);

            // the color difference is above the threshold
            if (delta > maxDelta) {
                // check it's a real rendering difference or just anti-aliasing
                if (!_options.includeAA && (Pixelmatch._antialiased(img1, img2, x, y, width, height) ||
                                           Pixelmatch._antialiased(img2, img1, x, y, width, height))) {
                    // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
                    // note that we do not include such pixels in a mask
                    if (output && !_options.diffMask) {
                      Pixelmatch._drawPixel(output, pos, aaR, aaG, aaB);
                    }

                } else {
                    // found substantial difference not caused by anti-aliasing; draw it as red
                    if (output) {
                      Pixelmatch._drawPixel(output, pos, diffR, diffG, diffB);
                    }
                    diff++;
                }

            } else if (output) {
                // pixels are similar; draw background as grayscale image blended with white
                if (!_options.diffMask) {
                  Pixelmatch._drawGrayPixel(img1, pos, _options.alpha, output);
                }
            }
        }
    }

    // return the number of different pixels
    return diff;
  }
}
