/**
 * Compare two equally sized images, pixel by pixel.
 *
 * @param {Uint8Array | Uint8ClampedArray} img1 First image data.
 * @param {Uint8Array | Uint8ClampedArray} img2 Second image data.
 * @param {Uint8Array | Uint8ClampedArray | void} output Image data to write the diff to, if provided.
 * @param {number} width Input images width.
 * @param {number} height Input images height.
 *
 * @param {Object} [options]
 * @param {number} [options.threshold=0.1] Matching threshold (0 to 1); smaller is more sensitive.
 * @param {boolean} [options.includeAA=false] Whether to skip anti-aliasing detection.
 * @param {number} [options.alpha=0.1] Opacity of original image in diff output.
 * @param {[number, number, number]} [options.aaColor=[255, 255, 0]] Color of anti-aliased pixels in diff output.
 * @param {[number, number, number]} [options.diffColor=[255, 0, 0]] Color of different pixels in diff output.
 * @param {[number, number, number]} [options.diffColorAlt=options.diffColor] Whether to detect dark on light differences between img1 and img2 and set an alternative color to differentiate between the two.
 * @param {boolean} [options.diffMask=false] Draw the diff over a transparent background (a mask).
 * @param {boolean} [options.checkerboard=true] Whether to blend semi-transparent pixels against a checkerboard pattern (true) or plain white (false) when comparing.
 * @param {number} [options.windowSize=Infinity] If finite, return the maximum number of diff pixels found in any N×N sliding window instead of the total diff count.
 *
 * @return {number} The number of mismatched pixels (or the maximum per-window count if windowSize is finite).
 */
export default function pixelmatch(img1, img2, output, width, height, options = {}) {
    const {
        threshold = 0.1,
        alpha = 0.1,
        aaColor = [255, 255, 0],
        diffColor = [255, 0, 0],
        checkerboard = true,
        windowSize = Infinity,
        includeAA, diffColorAlt, diffMask
    } = options;

    if (!isPixelData(img1) || !isPixelData(img2) || (output && !isPixelData(output)))
        throw new Error('Image data: Uint8Array, Uint8ClampedArray or Buffer expected.');

    if (img1.length !== img2.length || (output && output.length !== img1.length))
        throw new Error(`Image sizes do not match. Image 1 size: ${img1.length}, image 2 size: ${img2.length}`);

    if (img1.length !== width * height * 4) throw new Error(`Image data size does not match width/height. Expecting ${width * height * 4}. Got ${img1.length}`);

    // check if images are identical
    const len = width * height;
    const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len);
    const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len);
    let identical = true;

    for (let i = 0; i < len; i++) {
        if (a32[i] !== b32[i]) { identical = false; break; }
    }
    if (identical) { // fast path if identical
        if (output && !diffMask) {
            for (let i = 0, pos = 0; i < len; i++, pos += 4) drawGrayPixel(img1, pos, alpha, output);
        }
        return 0;
    }

    // maximum acceptable OKLab HyAB distance between two colors;
    // 1.0 is the HyAB distance between black and white
    const maxDelta = threshold;
    const [aaR, aaG, aaB] = aaColor;
    const [diffR, diffG, diffB] = diffColor;
    const [altR, altG, altB] = diffColorAlt || diffColor;
    let diff = 0;

    // per-pixel diff mask, only allocated when windowSize is finite (keeps the
    // default path allocation-free): 0 same/ignored, 1 diff, 2 excluded AA.
    // diff pixels are given odd values so the window scan can count them
    // branchlessly with `& 1`.
    const mask = windowSize !== Infinity ? new Uint8Array(len) : null;
    // first/last row containing a counted diff, to bound the windowed post-pass
    let firstDiffY = -1;
    let lastDiffY = 0;

    // compare each pixel of one image against the other one
    for (let i = 0, pos = 0; i < len; i++, pos += 4) {
        // whether the HyAB OKLab distance exceeds the threshold: 0 if not, ±1 if yes (negative if img2 pixel is darker)
        const delta = a32[i] === b32[i] ? 0 : colorDelta(img1, img2, pos, pos, checkerboard, maxDelta);

        // the color difference is above the threshold
        if (delta) {
            const x = i % width;
            const y = (i / width) | 0;
            // check it's a real rendering difference or just anti-aliasing
            const isExcludedAA = !includeAA && (antialiased(img1, x, y, width, height, a32, b32) || antialiased(img2, x, y, width, height, b32, a32));
            if (isExcludedAA) {
                // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
                // note that we do not include such pixels in a mask
                if (output && !diffMask) drawPixel(output, pos, aaR, aaG, aaB);
                if (mask) mask[i] = 2;

            } else {
                // found substantial difference not caused by anti-aliasing; draw it as such
                if (output) {
                    if (delta < 0) {
                        drawPixel(output, pos, altR, altG, altB);
                    } else {
                        drawPixel(output, pos, diffR, diffG, diffB);
                    }
                }
                if (mask) {
                    mask[i] = 1;
                    if (firstDiffY < 0) firstDiffY = y;
                    lastDiffY = y;
                }
                diff++;
            }

        } else if (output && !diffMask) {
            // pixels are similar; draw background as grayscale image blended with white
            drawGrayPixel(img1, pos, alpha, output);
        }
    }

    // return the number of different pixels
    if (!mask) return diff;

    // windowed mode: return the maximum number of diff pixels (state 1) over all
    // N×N sliding windows, N clamped to the image dimensions
    const n = Math.max(1, Math.min(windowSize | 0, width, height));

    // colSum[x] counts diff pixels in column x over the last n rows; maintained
    // incrementally (add entering row, subtract leaving row), which is why the
    // full mask has to be kept around. diff pixels are odd (`& 1`), AA/same even.
    if (firstDiffY < 0) return 0; // all diffs were excluded as AA

    const colSum = new Uint16Array(width);
    let maxCount = 0;
    // running total of all column sums = diff pixels in the current n-row band;
    // an upper bound for any single window, so bands that can't beat maxCount skip
    // the horizontal scan entirely (most bands are sparse or empty)
    let bandTotal = 0;

    // only rows in [firstDiffY, lastDiffY] hold diffs, so colSum is zero before the
    // first and drained after a leaving row passes the last — bound the scan to the
    // bands that can be nonzero (rows before firstDiffY stay empty, so starting there
    // keeps colSum correct without special initialization)
    const yEnd = Math.min(height - 1, lastDiffY + n - 1);

    for (let y = firstDiffY; y <= yEnd; y++) {
        const rowStart = y * width;
        const leaving = y - n;
        // update column sums: add the entering row, subtract the leaving row
        // (both in one pass over the width)
        if (leaving >= 0) {
            const leavingStart = leaving * width;
            for (let x = 0; x < width; x++) {
                const d = (mask[rowStart + x] & 1) - (mask[leavingStart + x] & 1);
                colSum[x] += d;
                bandTotal += d;
            }
        } else {
            for (let x = 0; x < width; x++) {
                const e = mask[rowStart + x] & 1;
                colSum[x] += e;
                bandTotal += e;
            }
            // only scan windows that are fully inside vertically
            if (y < n - 1) continue;
        }

        // no window in this band can exceed the total diff count it contains
        if (bandTotal <= maxCount) continue;

        // horizontal running sum over colSum yields every window sum in this band;
        // prime the first n-1 columns, then slide with no per-iteration bounds checks
        let windowSum = 0;
        for (let x = 0; x < n - 1; x++) windowSum += colSum[x];
        for (let x = n - 1; x < width; x++) {
            windowSum += colSum[x];
            if (windowSum > maxCount) maxCount = windowSum;
            windowSum -= colSum[x - n + 1];
        }
    }

    return maxCount;
}

/** @param {Uint8Array | Uint8ClampedArray} arr */
function isPixelData(arr) {
    // work around instanceof Uint8Array not working properly in some Jest environments
    return ArrayBuffer.isView(arr) && arr.BYTES_PER_ELEMENT === 1;
}

/**
 * Check if a pixel is likely a part of anti-aliasing;
 * based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V. Vysniauskas, 2009
 * @param {Uint8Array | Uint8ClampedArray} img
 * @param {number} x1
 * @param {number} y1
 * @param {number} width
 * @param {number} height
 * @param {Uint32Array} a32
 * @param {Uint32Array} b32
 */
function antialiased(img, x1, y1, width, height, a32, b32) {
    const x0 = x1 > 0 ? x1 - 1 : 0;
    const y0 = y1 > 0 ? y1 - 1 : 0;
    const x2 = x1 < width - 1 ? x1 + 1 : width - 1;
    const y2 = y1 < height - 1 ? y1 + 1 : height - 1;
    const pos4 = (y1 * width + x1) * 4;
    // cache the center pixel's RGBA once instead of re-reading it on every neighbor comparison
    const cr = img[pos4];
    const cg = img[pos4 + 1];
    const cb = img[pos4 + 2];
    const ca = img[pos4 + 3];
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
    let min = 0;
    let max = 0;
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;

    // go through 8 adjacent pixels
    const rowStep = width * 4;
    for (let x = x0; x <= x2; x++) {
        let m = (y0 * width + x) * 4;
        for (let y = y0; y <= y2; y++, m += rowStep) {
            if (x === x1 && y === y1) continue;

            // brightness delta between the center pixel and adjacent one
            const delta = brightnessDelta(img, m, cr, cg, cb, ca);

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
    return (hasManySiblings(a32, minX, minY, width, height) && hasManySiblings(b32, minX, minY, width, height)) ||
           (hasManySiblings(a32, maxX, maxY, width, height) && hasManySiblings(b32, maxX, maxY, width, height));
}

/**
 * Check if a pixel has 3+ adjacent pixels of the same color.
 * @param {Uint32Array} img
 * @param {number} x1
 * @param {number} y1
 * @param {number} width
 * @param {number} height
 */
function hasManySiblings(img, x1, y1, width, height) {
    const pos1 = y1 * width + x1;
    const val = img[pos1];

    if (x1 > 0 && x1 < width - 1 && y1 > 0 && y1 < height - 1) {
        return +(val === img[pos1 - width - 1]) +
               +(val === img[pos1 - 1]) +
               +(val === img[pos1 + width - 1]) +
               +(val === img[pos1 - width]) +
               +(val === img[pos1 + width]) +
               +(val === img[pos1 - width + 1]) +
               +(val === img[pos1 + 1]) +
               +(val === img[pos1 + width + 1]) > 2;
    }

    const x0 = x1 > 0 ? x1 - 1 : 0;
    const y0 = y1 > 0 ? y1 - 1 : 0;
    const x2 = x1 < width - 1 ? x1 + 1 : width - 1;
    const y2 = y1 < height - 1 ? y1 + 1 : height - 1;
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

    // go through 8 adjacent pixels
    for (let x = x0; x <= x2; x++) {
        let pos = y0 * width + x;
        for (let y = y0; y <= y2; y++, pos += width) {
            if (x === x1 && y === y1) continue;
            zeroes += +(val === img[pos]);
            if (zeroes > 2) return true;
        }
    }
    return false;
}

// sRGB [0..255] -> linear [0..1] lookup table (padded with a 257th entry for interpolation)
const LIN = new Float64Array(257);
for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
LIN[256] = LIN[255];

// premultiplied LMS matrix contributions for opaque sRGB byte values
const L_R = new Float64Array(256);
const L_G = new Float64Array(256);
const L_B = new Float64Array(256);
const M_R = new Float64Array(256);
const M_G = new Float64Array(256);
const M_B = new Float64Array(256);
const S_R = new Float64Array(256);
const S_G = new Float64Array(256);
const S_B = new Float64Array(256);
for (let i = 0; i < 256; i++) {
    const lr = LIN[i];
    L_R[i] = 0.4122214708 * lr;
    M_R[i] = 0.2119034982 * lr;
    S_R[i] = 0.0883024619 * lr;
    L_G[i] = 0.5363325363 * lr;
    M_G[i] = 0.6806995451 * lr;
    S_G[i] = 0.2817188376 * lr;
    L_B[i] = 0.0514459929 * lr;
    M_B[i] = 0.1073969566 * lr;
    S_B[i] = 0.6299787005 * lr;
}

// sRGB->linear for a fractional [0..255] channel value via linear interpolation of LIN
/** @param {number} x */
function linLUT(x) {
    const i = x | 0;
    return LIN[i] + (LIN[i + 1] - LIN[i]) * (x - i);
}

// cube root over [0..1] via lookup table with linear interpolation
const CBRT_N = 4096;
const CBRT = new Float64Array(CBRT_N + 2);
for (let i = 0; i <= CBRT_N + 1; i++) CBRT[i] = Math.cbrt(i / CBRT_N);
/** @param {number} x */
function cbrtLUT(x) {
    const t = x * CBRT_N;
    const i = t | 0;
    return CBRT[i] + (CBRT[i + 1] - CBRT[i]) * (t - i);
}

// direct-mapped cache for opaque RGB -> cube-rooted LMS values and toe-corrected OKLab lightness
const OKLAB_CACHE_BITS = 12;
const OKLAB_CACHE_SHIFT = 32 - OKLAB_CACHE_BITS;
const OKLAB_CACHE_SIZE = 1 << OKLAB_CACHE_BITS;
const OKLAB_CACHE_KEYS = new Uint32Array(OKLAB_CACHE_SIZE);
const OKLAB_CACHE_VALUES = new Float64Array(OKLAB_CACHE_SIZE * 4);

const TOE_K1 = 0.206;
const TOE_K2 = 0.03;
const TOE_K3 = (1 + TOE_K1) / (1 + TOE_K2);

/**
 * Calculate the perceptual color difference between two pixels using the OKLab color space
 * (Björn Ottosson, 2020, https://bottosson.github.io/posts/oklab/) with the HyAB metric
 * (|ΔLr| + √(Δa² + Δb²); Abasi et al. 2019), which tracks large color differences well.
 * The Lr lightness is Ottosson's toe-corrected OKLab lightness, which avoids over-expanding
 * near-black image/display differences while preserving the black-white 0..1 scale.
 * Caller guarantees the two pixels differ, so the early-zero check is omitted.
 *
 * The HyAB sqrt is avoided by folding the threshold test in: the distance stays below `maxDelta`
 * iff |ΔLr| <= maxDelta and Δa² + Δb² <= (maxDelta − |ΔLr|)². The return value is only used
 * for the threshold comparison and the brighter/darker sign, so it's just 0 / ±1.
 *
 * @param {Uint8Array | Uint8ClampedArray} img1
 * @param {Uint8Array | Uint8ClampedArray} img2
 * @param {number} k
 * @param {number} m
 * @param {boolean} checkerboard
 * @param {number} maxDelta maximum acceptable HyAB distance
 * @return {number} 0 if below the threshold, otherwise ±1 (negative if the img2 pixel is darker)
 */
function colorDelta(img1, img2, k, m, checkerboard, maxDelta) {
    const r1 = img1[k];
    const g1 = img1[k + 1];
    const b1 = img1[k + 2];
    const a1 = img1[k + 3];
    const r2 = img2[m];
    const g2 = img2[m + 1];
    const b2 = img2[m + 2];
    const a2 = img2[m + 3];

    if (a1 === 255 && a2 === 255) { // fast path for opaque colors
        return colorDeltaOpaque(r1, g1, b1, r2, g2, b2, maxDelta);
    }

    return colorDeltaTransparent(r1, g1, b1, a1, r2, g2, b2, a2, k, checkerboard, maxDelta);
}

/**
 * @param {number} r1
 * @param {number} g1
 * @param {number} b1
 * @param {number} r2
 * @param {number} g2
 * @param {number} b2
 * @param {number} maxDelta
 */
function colorDeltaOpaque(r1, g1, b1, r2, g2, b2, maxDelta) {
    const key1 = (r1 << 16) | (g1 << 8) | b1;
    const slot1 = Math.imul(key1, 0x9e3779b1) >>> OKLAB_CACHE_SHIFT;
    const stored1 = key1 + 1;
    const offset1 = slot1 * 4;
    let l1, m1, s1, lr1;
    if (OKLAB_CACHE_KEYS[slot1] === stored1) {
        l1 = OKLAB_CACHE_VALUES[offset1];
        m1 = OKLAB_CACHE_VALUES[offset1 + 1];
        s1 = OKLAB_CACHE_VALUES[offset1 + 2];
        lr1 = OKLAB_CACHE_VALUES[offset1 + 3];
    } else {
        l1 = cbrtLUT(L_R[r1] + L_G[g1] + L_B[b1]);
        m1 = cbrtLUT(M_R[r1] + M_G[g1] + M_B[b1]);
        s1 = cbrtLUT(S_R[r1] + S_G[g1] + S_B[b1]);
        lr1 = toe(0.2104542553 * l1 + 0.7936177850 * m1 - 0.0040720468 * s1);
        OKLAB_CACHE_KEYS[slot1] = stored1;
        OKLAB_CACHE_VALUES[offset1] = l1;
        OKLAB_CACHE_VALUES[offset1 + 1] = m1;
        OKLAB_CACHE_VALUES[offset1 + 2] = s1;
        OKLAB_CACHE_VALUES[offset1 + 3] = lr1;
    }

    const key2 = (r2 << 16) | (g2 << 8) | b2;
    const slot2 = Math.imul(key2, 0x9e3779b1) >>> OKLAB_CACHE_SHIFT;
    const stored2 = key2 + 1;
    const offset2 = slot2 * 4;
    let l2, m2, s2, lr2;
    if (OKLAB_CACHE_KEYS[slot2] === stored2) {
        l2 = OKLAB_CACHE_VALUES[offset2];
        m2 = OKLAB_CACHE_VALUES[offset2 + 1];
        s2 = OKLAB_CACHE_VALUES[offset2 + 2];
        lr2 = OKLAB_CACHE_VALUES[offset2 + 3];
    } else {
        l2 = cbrtLUT(L_R[r2] + L_G[g2] + L_B[b2]);
        m2 = cbrtLUT(M_R[r2] + M_G[g2] + M_B[b2]);
        s2 = cbrtLUT(S_R[r2] + S_G[g2] + S_B[b2]);
        lr2 = toe(0.2104542553 * l2 + 0.7936177850 * m2 - 0.0040720468 * s2);
        OKLAB_CACHE_KEYS[slot2] = stored2;
        OKLAB_CACHE_VALUES[offset2] = l2;
        OKLAB_CACHE_VALUES[offset2 + 1] = m2;
        OKLAB_CACHE_VALUES[offset2 + 2] = s2;
        OKLAB_CACHE_VALUES[offset2 + 3] = lr2;
    }

    return oklabHyabDelta(lr1 - lr2, l1 - l2, m1 - m2, s1 - s2, maxDelta);
}

/**
 * @param {number} r1
 * @param {number} g1
 * @param {number} b1
 * @param {number} a1
 * @param {number} r2
 * @param {number} g2
 * @param {number} b2
 * @param {number} a2
 * @param {number} k
 * @param {boolean} checkerboard
 * @param {number} maxDelta
 */
function colorDeltaTransparent(r1, g1, b1, a1, r2, g2, b2, a2, k, checkerboard, maxDelta) {
    // blend pixels with background
    let rb = 255, gb = 255, bb = 255;
    if (checkerboard) {
        rb = 48 + 159 * (k % 2);
        gb = 48 + 159 * ((k / 1.618033988749895 | 0) % 2);
        bb = 48 + 159 * ((k / 2.618033988749895 | 0) % 2);
    }
    // blended channel values are fractional, so interpolate the sRGB->linear LUT
    r1 = (r1 * a1 + rb * (255 - a1)) / 255;
    g1 = (g1 * a1 + gb * (255 - a1)) / 255;
    b1 = (b1 * a1 + bb * (255 - a1)) / 255;
    r2 = (r2 * a2 + rb * (255 - a2)) / 255;
    g2 = (g2 * a2 + gb * (255 - a2)) / 255;
    b2 = (b2 * a2 + bb * (255 - a2)) / 255;
    const lr1 = linLUT(r1), lg1 = linLUT(g1), lb1 = linLUT(b1);
    const lr2 = linLUT(r2), lg2 = linLUT(g2), lb2 = linLUT(b2);

    const l1 = cbrtLUT(0.4122214708 * lr1 + 0.5363325363 * lg1 + 0.0514459929 * lb1);
    const m1 = cbrtLUT(0.2119034982 * lr1 + 0.6806995451 * lg1 + 0.1073969566 * lb1);
    const s1 = cbrtLUT(0.0883024619 * lr1 + 0.2817188376 * lg1 + 0.6299787005 * lb1);
    const l2 = cbrtLUT(0.4122214708 * lr2 + 0.5363325363 * lg2 + 0.0514459929 * lb2);
    const m2 = cbrtLUT(0.2119034982 * lr2 + 0.6806995451 * lg2 + 0.1073969566 * lb2);
    const s2 = cbrtLUT(0.0883024619 * lr2 + 0.2817188376 * lg2 + 0.6299787005 * lb2);
    const Lr1 = toe(0.2104542553 * l1 + 0.7936177850 * m1 - 0.0040720468 * s1);
    const Lr2 = toe(0.2104542553 * l2 + 0.7936177850 * m2 - 0.0040720468 * s2);

    return oklabHyabDelta(Lr1 - Lr2, l1 - l2, m1 - m2, s1 - s2, maxDelta);
}

/**
 * @param {number} dLr
 * @param {number} dl
 * @param {number} dm
 * @param {number} ds
 * @param {number} maxDelta
 */
function oklabHyabDelta(dLr, dl, dm, ds, maxDelta) {
    // HyAB distance = |dLr| + sqrt(da^2 + db^2); compare against maxDelta without the sqrt:
    // it stays below the threshold iff |dLr| <= maxDelta and da^2 + db^2 <= (maxDelta - |dLr|)^2
    const rest = maxDelta - Math.abs(dLr);
    if (rest > 0) {
        const da = 1.9779984951 * dl - 2.4285922050 * dm + 0.4505937099 * ds;
        const db = 0.0259040371 * dl + 0.7827717662 * dm - 0.8086757660 * ds;
        if (da * da + db * db <= rest * rest) return 0;
    }

    // encode whether the pixel lightens or darkens in the sign
    return dLr > 0 ? -1 : 1;
}

/**
 * @param {number} L
 */
function toe(L) {
    const x = TOE_K3 * L - TOE_K1;
    return 0.5 * (x + Math.sqrt(x * x + 4 * TOE_K2 * TOE_K3 * L));
}

/**
 * Specialized brightness-only color delta for the anti-aliasing detector,
 * with the center pixel's RGBA hoisted out of the neighbor loop.
 *
 * Intentionally stays on gamma-space Rec.601 luma rather than OKLab ΔL used by `colorDelta`:
 * the detector only needs a cheap, monotonic scalar to find the intensity ramp direction
 * (darkest/brightest neighbor), and switching to ΔL both regressed AA detection on dark regions
 * and was much slower (called up to 16× per candidate pixel).
 *
 * Semi-transparent pixels are composited over fixed mid-gray rather than the checkerboard
 * used by `colorDelta`: a ramp structure test needs a deterministic background, and a
 * pseudo-random per-position one distorts the very ramps it looks for. When the composited
 * luma delta cancels out exactly but alpha differs, the alpha delta gives the ramp direction,
 * so only pixels equal in both premultiplied luma and alpha count as equal siblings.
 * @param {Uint8Array | Uint8ClampedArray} img
 * @param {number} m neighbor pixel offset
 * @param {number} r1
 * @param {number} g1
 * @param {number} b1
 * @param {number} a1
 */
function brightnessDelta(img, m, r1, g1, b1, a1) {
    const r2 = img[m];
    const g2 = img[m + 1];
    const b2 = img[m + 2];
    const a2 = img[m + 3];

    let dr = r1 - r2;
    let dg = g1 - g2;
    let db = b1 - b2;
    const da = a1 - a2;

    if (!dr && !dg && !db && !da) return 0;

    if (a1 < 255 || a2 < 255) {
        dr = (r1 * a1 - r2 * a2 - 128 * da) / 255;
        dg = (g1 * a1 - g2 * a2 - 128 * da) / 255;
        db = (b1 * a1 - b2 * a2 - 128 * da) / 255;
        const d = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
        return d === 0 && da ? da / 2 : d;
    }

    return dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
}

/**
 * @param {Uint8Array | Uint8ClampedArray} output
 * @param {number} pos
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function drawPixel(output, pos, r, g, b) {
    output[pos] = r;
    output[pos + 1] = g;
    output[pos + 2] = b;
    output[pos + 3] = 255;
}

/**
 * @param {Uint8Array | Uint8ClampedArray} img
 * @param {number} i
 * @param {number} alpha
 * @param {Uint8Array | Uint8ClampedArray} output
 */
function drawGrayPixel(img, i, alpha, output) {
    const val = 255 + (img[i] * 0.29889531 + img[i + 1] * 0.58662247 + img[i + 2] * 0.11448223 - 255) * alpha * img[i + 3] / 255;
    drawPixel(output, i, val, val, val);
}
