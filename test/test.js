'use strict';

var PNG = require('pngjs').PNG,
    fs = require('fs'),
    test = require('tap').test,
    path = require('path'),
    match = require('../.');

diffTest('1a', '1b', '1diff', {
    threshold: 0.05,
    includeAA: false
}, 143);
diffTest('2a', '2b', '2diff', {
    threshold: 0.05,
    includeAA: false
}, 12439);
diffTest('3a', '3b', '3diff', {
    threshold: 0.05,
    includeAA: false
}, 212);
diffTest('4a', '4b', '4diff', {
    threshold: 0.05,
    includeAA: false
}, 36089);

function diffTest(imgPath1, imgPath2, diffPath, options, expectedMismatch) {
    var name = 'comparing ' + imgPath1 + ' to ' + imgPath2 +
            ', ' + JSON.stringify(options);

    test(name, function (t) {
        var img1 = readImage(imgPath1, function () {
            var img2 = readImage(imgPath2, function () {
                var expectedDiff = readImage(diffPath, function () {
                    var diff = new PNG({width: img1.width, height: img1.height});

                    var mismatch = match(img1.data, img2.data, diff.data, diff.width, diff.height, options);

                    var mismatch2 = match(img1.data, img2.data, null, diff.width, diff.height, options);

                    t.same(diff.data, expectedDiff.data, 'diff image');
                    t.same(mismatch, expectedMismatch, 'number of mismatched pixels');
                    t.same(mismatch, mismatch2, 'number of mismatched pixels');

                    t.end();
                });
            });
        });
    });
}

function readImage(name, done) {
    return fs.createReadStream(path.join(__dirname, '/fixtures/' + name + '.png')).pipe(new PNG()).on('parsed', done);
}
