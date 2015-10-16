'use strict';

var PNG = require('pngjs2').PNG,
    fs = require('fs'),
    test = require('tap').test,
    path = require('path'),
    match = require('../.');

diffTest('1a', '1b', '1diff', 0.001, 1, 141);

function diffTest(imgPath1, imgPath2, diffPath, threshold, antialiasing, expectedMismatch) {
    var name = 'comparing ' + imgPath1 + ' to ' + imgPath2 +
            ', threshold: ' + threshold + ', antialiasing: ' + antialiasing;

    test(name, function (t) {
        var img1 = readImage(imgPath1);
        var img2 = readImage(imgPath2);
        var expectedDiff = readImage(diffPath);

        var diff = new PNG({width: img1.width, height: img1.height});
        var mismatch = match(img1.data, img2.data, diff.data, diff.width, diff.height, threshold, antialiasing);

        t.same(diff.data, expectedDiff.data, 'diff image');
        t.same(mismatch, expectedMismatch, 'number of mismatched pixels');

        t.end();
    });
}

function readImage(name) {
    return PNG.sync.read(fs.readFileSync(path.join(__dirname, '/fixtures/' + name + '.png')));
}
