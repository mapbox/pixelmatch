'use strict';

module.exports = pixelmatch;

const defaultOptions = {
    threshold: 0.1,         // matching threshold (0 to 1); smaller is more sensitive
    includeAA: false,       // whether to skip anti-aliasing detection
    alpha: 0.1,             // opacity of original image in diff output
    aaColor: [255, 255, 0], // color of anti-aliased pixels in diff output
    diffColor: [255, 0, 0], // color of different pixels in diff output
    diffColorAlt: null,     // whether to detect dark on light differences between img1 and img2 and set an alternative color to differentiate between the two
    diffMask: false         // draw the diff over a transparent background (a mask)
};

function pixelmatch(img1, img2, output, width, height, options) {

    if (!isPixelData(img1) || !isPixelData(img2) || (output && !isPixelData(output)))
        throw new Error('Image data: Uint8Array, Uint8ClampedArray or Buffer expected.');

    if (img1.length !== img2.length || (output && output.length !== img1.length))
        throw new Error('Image sizes do not match.');

    if (img1.length !== width * height * 4) throw new Error('Image data size does not match width/height.');

    options = Object.assign({}, defaultOptions, options);

    // check if images are identical
    const len = width * height;
    const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len);
    const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len);
    let identical = true;
    //Q: why make a separare array???
    for (let i = 0; i < len; i++) {
        if (a32[i] !== b32[i]) { identical = false; break; }
    }
    if (identical) { // fast path if identical
        if (output && !options.diffMask) {
            for (let i = 0; i < len; i++) drawGrayPixel(img1, 4 * i, options.alpha, output);
        }
        return 0;
    }

    // maximum acceptable square distance between two colors;
    // 35215 is the maximum possible value for the YIQ difference metric
    const maxDelta = 35215 * options.threshold * options.threshold;
    let diff = 0;

    // compare each pixel of one image against the other one
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {

            //Jo Note: yes.
            const pos = (y * width + x) * 4;

            // squared YUV distance between colors at this pixel position, negative if the img2 pixel is darker
            const delta = colorDelta(img1, img2, pos, pos);

            // the color difference is above the threshold
            if (Math.abs(delta) > maxDelta) {
                // check it's a real rendering difference or just anti-aliasing
                if (!options.includeAA && (antialiased(img1, x, y, width, height, img2) ||
                                           antialiased(img2, x, y, width, height, img1))) {
                    // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
                    // note that we do not include such pixels in a mask
                    if (output && !options.diffMask) drawPixel(output, pos, ...options.aaColor);

                } else {
                    // found substantial difference not caused by anti-aliasing; draw it as such
                    if (output) {
                        drawPixel(output, pos, ...(delta < 0 && options.diffColorAlt || options.diffColor));
                    }
                    diff++;
                }

            } else if (output) {
                // pixels are similar; draw background as grayscale image blended with white
                if (!options.diffMask) drawGrayPixel(img1, pos, options.alpha, output);
            }
        }
    }

    // return the number of different pixels
    return diff;
}

function isPixelData(arr) {
    // work around instanceof Uint8Array not working properly in some Jest environments
    return ArrayBuffer.isView(arr) && arr.constructor.BYTES_PER_ELEMENT === 1;
}

// check if a pixel is likely a part of anti-aliasing;
// based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V. Vysniauskas, 2009

function antialiased(img, x1, y1, width, height, img2) {
    let x0 = x1 - 1;
    let y0 = y1 - 1;
    let x2 = width - 1;
    let y2 = height - 1;
    const pos = (y1 * width + x1) * 4;

    let zeroes = 0;

    if (x1 == 0) {
        x0 = 0;
        if (y1 == 0) {
            y0 = y1;
            //Tolerate only one zero.
            zeroes = 1;
        } else {
            //Tolerate up to two zeros on vertical line, but only one otherwise.
            zeroes = 1;
            let deltaAbove = colorDelta(img, img, pos, ((y1 - 1) * width) * 4, true);
            let deltaBelow = colorDelta(img, img, pos, ((y1 + 1) * width) * 4, true);

            if (deltaAbove ==  0 || deltaBelow == 0) {
                zeroes++;
                //Start count moved over.
                x0 = x2;
            }
        }
    } else if (y1 == 0) {
        y0 = 0;
        //Not in corner.
        //Tolerate two zeros on horizontal line, but only one otherwise.
         //Tolerate up to two zeros on vertical line, but only one otherwise.
         zeroes = 1;
         let deltaRight = colorDelta(img, img, pos, ((x1 + 1) * width) * 4, true);
         let deltaLeft = colorDelta(img, img, pos, ((x1 - 1) * width) * 4, true);

         if (deltaRight ==  0 || deltaLeft == 0) {
             zeroes++;
             //Start count moved over.
             y0 = y2;
         }
    } if (x1 == width - 1) {
        x2 = x1;
        if (y1 == height - 1) {
            y2 = y1;
            //Corner.
            //Tolerate only one zero.
            zeroes = 1;
        } else {
            //Not in corner.
              //Tolerate up to two zeros on vertical line, but only one otherwise.
              zeroes = 1;
              let deltaAbove = colorDelta(img, img, pos, ((y1 - 1) * width) * 4, true);
              let deltaBelow = colorDelta(img, img, pos, ((y1 + 1) * width) * 4, true);
  
              if (deltaAbove ==  0 || deltaBelow == 0) {
                  zeroes++;
                  //End count moved over.
                  x2 = x0;
              }
        }

    } else if (y1 == height - 1) {
        y2 = y1;
        //Not in corner.
        //Tolerate up to two zeros on vertical line, but only one otherwise.
        zeroes = 1;
        let deltaRight = colorDelta(img, img, pos, ((x1 + 1) * width) * 4, true);
        let deltaLeft = colorDelta(img, img, pos, ((x1 - 1) * width) * 4, true);

        if (deltaRight ==  0 || deltaLeft == 0) {
            zeroes++;
            //End count moved up.
            y2 = y0;
        }
    }
  
    let lessThan = 0;
    let greaterThan = 0;

    // go through 8 adjacent pixels
    for (let x = x0; x <= x2; x++) {
        for (let y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;

            // brightness delta between the center pixel and adjacent one
            const delta = colorDelta(img, img, pos, (y * width + x) * 4, true);

            // count the number of equal, darker and brighter adjacent pixels
            if (delta === 0) {
                zeroes++;
                // if found more than 2 equal siblings, it's definitely not anti-aliasing
                if (zeroes > 2) return false;
            // count darker pixels
            } else if (delta < 0) {
                lessThan++;
            // count lighter pixels
            } else if (delta > 0) {
                greaterThan++;
            }
        }
    }

    // if there are no both darker and brighter pixels among siblings, or if there are too many lighter or darker
    //then it's not anti-aliasing. We can kill two birds here, since if zeros are less than 3, we have 6 siblings left. So we can check 
    //simply that they are split along the edge.
    if (greaterThan > 3 || lessThan > 3) return false;

    return true;
}

// calculate color difference according to the paper "Measuring perceived color difference
// using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos

function colorDelta(img1, img2, k, m, yOnly) {
    let r1 = img1[k + 0];
    let g1 = img1[k + 1];
    let b1 = img1[k + 2];
    let a1 = img1[k + 3];

    let r2 = img2[m + 0];
    let g2 = img2[m + 1];
    let b2 = img2[m + 2];
    let a2 = img2[m + 3];

    if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) return 0;

    if (a1 < 255) {
        a1 /= 255;
        r1 = blend(r1, a1);
        g1 = blend(g1, a1);
        b1 = blend(b1, a1);
    }

    if (a2 < 255) {
        a2 /= 255;
        r2 = blend(r2, a2);
        g2 = blend(g2, a2);
        b2 = blend(b2, a2);
    }

    const y1 = rgb2y(r1, g1, b1);
    const y2 = rgb2y(r2, g2, b2);
    const y = y1 - y2;

    if (yOnly) return y; // brightness difference only

    const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
    const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);

    const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

    // encode whether the pixel lightens or darkens in the sign
    return y1 > y2 ? -delta : delta;
}

function rgb2y(r, g, b) { return r * 0.29889531 + g * 0.58662247 + b * 0.11448223; }
function rgb2i(r, g, b) { return r * 0.59597799 - g * 0.27417610 - b * 0.32180189; }
function rgb2q(r, g, b) { return r * 0.21147017 - g * 0.52261711 + b * 0.31114694; }

// blend semi-transparent color with white
function blend(c, a) {
    return 255 + (c - 255) * a;
}

function drawPixel(output, pos, r, g, b) {
    output[pos + 0] = r;
    output[pos + 1] = g;
    output[pos + 2] = b;
    output[pos + 3] = 255;
}

function drawGrayPixel(img, i, alpha, output) {
    const r = img[i + 0];
    const g = img[i + 1];
    const b = img[i + 2];
    const val = blend(rgb2y(r, g, b), alpha * img[i + 3] / 255);
    drawPixel(output, i, val, val, val);
}
