'use strict';

module.exports = imagematch;

function imagematch(img1, img2, output, width, height, threshold, antialiasing) {

    var maxDelta = 255 * 255 * 4 * (threshold === undefined ? 0.005 : threshold),
        shift = antialiasing === undefined ? 1 : antialiasing,
        diff = 0;

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {

            var pos = (y * width + x) * 4;
            var delta = colorDelta(img1, img2, pos, pos);

            if (delta > maxDelta) {
                if (shift &&
                    antialiased(img1, img2, x, y, width, height, maxDelta, shift) &&
                    antialiased(img2, img1, x, y, width, height, maxDelta, shift)) {

                    drawIgnorePixel(output, pos);

                } else {
                    diff++;
                    drawDiffPixel(output, pos);
                }

            } else {
                drawBgPixel(output, img1, pos);
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
    var r = img1[pos1 + 0] - img2[pos2 + 0],
        g = img1[pos1 + 1] - img2[pos2 + 1],
        b = img1[pos1 + 2] - img2[pos2 + 2],
        a = img1[pos1 + 3] - img2[pos2 + 3];

    return (r * r) + (g * g) + (b * b) + (a * a);
}

function drawBgPixel(output, img, pos) {
    var brightness = 0.30 * img[pos] + 0.59 * img[pos + 1] + 0.11 * img[pos + 2];
    output[pos] = output[pos + 1] = output[pos + 2] = 255 - (255 - brightness) * 0.1;
    output[pos + 3] = 255;
}

function drawDiffPixel(output, pos) {
    output[pos] = output[pos + 3] = 255;
    output[pos + 1] = output[pos + 2] = 0;
}

function drawIgnorePixel(output, pos) {
    output[pos] = output[pos + 1] = output[pos + 3] = 255;
    output[pos + 2] = 0;
}
