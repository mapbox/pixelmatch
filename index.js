'use strict';

module.exports = pixelmatch;

function pixelmatch(img1, img2, output, width, height, threshold, antialiasing) {

    var maxDelta = 255 * 255 * 3 * (threshold === undefined ? 0.005 : threshold),
        shift = antialiasing === undefined ? 1 : antialiasing,
        diff = 0;

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {

            var pos = (y * width + x) * 4;
            var delta = colorDelta(img1, img2, pos, pos);

            if (delta > maxDelta) {
                if (shift && antialiased(img1, img2, x, y, width, height, maxDelta, shift) &&
                             antialiased(img2, img1, x, y, width, height, maxDelta, shift)) {
                    drawPixel(output, pos, 255, 255, 0);

                } else {
                    drawPixel(output, pos, 255, 0, 0);
                    diff++;
                }

            } else {
                var val = 255 - 0.1 * (255 - grayPixel(img1, pos));
                drawPixel(output, pos, val, val, val);
            }
        }
    }

    return diff;
}

function antialiased(img1, img2, x1, y1, width, height, maxDelta, d) {
    var x0 = Math.max(x1 - d, 0),
        y0 = Math.max(y1 - d, 0),
        x2 = Math.min(x1 + d, width - 1),
        y2 = Math.min(y1 + d, height - 1),
        pos = (y1 * width + x1) * 4;

    for (var x = x0; x <= x2; x++) {
        for (var y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;

            var localPos = (y * width + x) * 4,
                localDelta = colorDelta(img1, img1, pos, localPos),
                delta = colorDelta(img1, img2, pos, localPos);

            if (Math.abs(delta - localDelta) < maxDelta && localDelta > maxDelta) return true;
        }
    }

    return false;
}

function colorDelta(img1, img2, pos1, pos2) {
    var a1 = img1[pos1 + 3] / 255,
        a2 = img2[pos2 + 3] / 255,

        r1 = img1[pos1 + 0] * a1,
        g1 = img1[pos1 + 1] * a1,
        b1 = img1[pos1 + 2] * a1,

        r2 = img2[pos2 + 0] * a2,
        g2 = img2[pos2 + 1] * a2,
        b2 = img2[pos2 + 2] * a2,

        y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1,
        y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2,

        yd = y1 - y2,
        ud = 0.492 * (b1 - y1) - 0.492 * (b1 - y2),
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
    var a = img[pos + 3] / 255;
    return (0.30 * img[pos + 0] +
            0.59 * img[pos + 1] +
            0.11 * img[pos + 2]) * a;
}
