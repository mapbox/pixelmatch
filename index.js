'use strict';

module.exports = pixelmatch;

function pixelmatch(img1, img2, output, width, height, threshold, includeAA) {

    if (threshold === undefined) threshold = 0.005;

    // scale the difference threshold to the maximum square YUV distance between two colors
    var maxDelta = 255 * 255 * 3 * threshold,
        diff = 0;

    // compare each pixel of one image against the other one
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {

            var pos = (y * width + x) * 4;

            // squared YUV distance between colors at this pixel position
            var delta = colorDelta(img1, img2, pos, pos);

            // the color difference is above the threshold
            if (delta > maxDelta) {
                // check it's a real rendering difference or just anti-aliasing
                if (!includeAA && (antialiased(img1, x, y, width, height, img2) ||
                                   antialiased(img2, x, y, width, height, img1))) {
                    // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
                    drawPixel(output, pos, 255, 255, 0);

                } else {
                    // found substantial difference not caused by anti-aliasing; draw it as red
                    drawPixel(output, pos, 255, 0, 0);
                    diff++;
                }

            } else {
                // pixels are similar; draw background as grayscale image blended with white
                var val = 255 - 0.1 * (255 - grayPixel(img1, pos)) * img1[pos + 3] / 255;
                drawPixel(output, pos, val, val, val);
            }
        }
    }

    // return the number of different pixels
    return diff;
}

// check if a pixel is likely a part of anti-aliasing;
// based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V. Vysniauskas, 2009

function antialiased(img, x1, y1, width, height, img2) {
    var x0 = Math.max(x1 - 1, 0),
        y0 = Math.max(y1 - 1, 0),
        x2 = Math.min(x1 + 1, width - 1),
        y2 = Math.min(y1 + 1, height - 1),
        pos = (y1 * width + x1) * 4,
        zeroes = 0,
        positives = 0,
        negatives = 0,
        min = 0,
        max = 0,
        minX, minY, maxX, maxY;

    // go through 8 adjacent pixels
    for (var x = x0; x <= x2; x++) {
        for (var y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;

            // brightness delta between the center pixel and adjacent one
            var delta = colorDelta(img, img, pos, (y * width + x) * 4, true);

            // count the number of equal, darker and brighter adjacent pixels
            if (delta === 0) zeroes++;
            else if (delta < 0) negatives++;
            else if (delta > 0) positives++;

            // if found more than 2 equal siblings, it's definitely not anti-aliasing
            if (zeroes > 2) return false;

            if (!img2) continue;

            // remember the darkest pixel
            if (delta < min) {
                min = delta;
                minX = x;
                minY = y;
            }
            // remember the brightest pixel
            if (delta > max) {
                max = delta;
                maxX = x;
                maxY = y;
            }
        }
    }

    if (!img2) return true;

    // if there are no both darker and brighter pixels among siblings, it's not anti-aliasing
    if (negatives === 0 || positives === 0) return false;

    // if either the darkest or the brightest pixel has more than 2 equal siblings in both images
    // (definitely not anti-aliased), this pixel is anti-aliased
    return (!antialiased(img, minX, minY, width, height) && !antialiased(img2, minX, minY, width, height)) ||
           (!antialiased(img, maxX, maxY, width, height) && !antialiased(img2, maxX, maxY, width, height));
}

// calculate either the squared YUV distance between colors,
// or just the brightness differene (Y component) if yOnly is true

function colorDelta(img1, img2, i, j, yOnly) {
    var a1 = img1[i + 3] / 255,
        a2 = img2[j + 3] / 255,

        r1 = img1[i + 0] * a1,
        g1 = img1[i + 1] * a1,
        b1 = img1[i + 2] * a1,

        r2 = img2[j + 0] * a2,
        g2 = img2[j + 1] * a2,
        b2 = img2[j + 2] * a2,

        y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1,
        y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2,

        yd = y1 - y2;

    if (yOnly) return yd;

    var ud = 0.492 * (b1 - y1) - 0.492 * (b2 - y2),
        vd = 0.877 * (r1 - y1) - 0.877 * (r2 - y2);

    return (yd * yd) + (ud * ud) + (vd * vd);
}

function drawPixel(output, pos, r, g, b) {
    output[pos + 0] = r;
    output[pos + 1] = g;
    output[pos + 2] = b;
    output[pos + 3] = 255;
}

function grayPixel(img, pos) {
    return 0.30 * img[pos + 0] +
           0.59 * img[pos + 1] +
           0.11 * img[pos + 2];
}
