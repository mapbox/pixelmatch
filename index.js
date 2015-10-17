'use strict';

module.exports = pixelmatch;

function pixelmatch(img1, img2, output, width, height, threshold, includeAA) {

    var maxDelta = 255 * 255 * 3 * (threshold === undefined ? 0.005 : threshold),
        diff = 0;

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {

            var pos = (y * width + x) * 4;
            var delta = colorDelta(img1, img2, pos, pos);

            if (delta > maxDelta) {
                if (!includeAA && (antialiased(img1, x, y, width, height) ||
                                   antialiased(img2, x, y, width, height))) {
                    drawPixel(output, pos, 255, 255, 0);

                } else {
                    drawPixel(output, pos, 255, 0, 0);
                    diff++;
                }

            } else {
                var val = 255 - 0.1 * (255 - grayPixel(img1, pos)) * img1[pos + 3] / 255;
                drawPixel(output, pos, val, val, val);
            }
        }
    }

    return diff;
}

function antialiased(img, x1, y1, width, height, partial) {
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

    for (var x = x0; x <= x2; x++) {
        for (var y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;

            var delta = colorDelta(img, img, pos, (y * width + x) * 4, true);

            if (delta === 0) zeroes++;
            if (zeroes > 2) return false;

            if (partial) continue;

            if (delta < 0) negatives++;
            else if (delta > 0) positives++;

            if (delta < min) {
                min = delta;
                minX = x;
                minY = y;
            }
            if (delta > max) {
                max = delta;
                maxX = x;
                maxY = y;
            }
        }
    }

    if (partial) return true;

    if (negatives === 0 || positives === 0) return false;

    return !antialiased(img, minX, minY, width, height, true) ||
           !antialiased(img, maxX, maxY, width, height, true);
}

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
