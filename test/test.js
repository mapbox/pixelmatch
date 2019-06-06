'use strict';

const PNG = require('pngjs').PNG;
const fs = require('fs');
const test = require('tape').test;
const path = require('path');
const match = require('../.');

diffTest('1a', '1b', '1diff', 0.05, false, 143);
diffTest('2a', '2b', '2diff', 0.05, false, 12437);
diffTest('3a', '3b', '3diff', 0.05, false, 212);
diffTest('4a', '4b', '4diff', 0.05, false, 36049);
diffTest('5a', '5b', '5diff', 0.05, false, 0);
diffTest('6a', '6b', '6diff', 0.05, false, 51);
diffTest('6a', '6a', '6empty', 0, false, 0);

test('throws error if image sizes do not match', (t) => {
    t.throws(() => match([1, 2, 3], [1, 2, 3, 4], null, 2, 1), /Image sizes do not match/);
    t.end();
});

test('throws error if provided wrong image data format', (t) => {
    const re = /Image data: Uint8Array, Uint8ClampedArray or Buffer expected/;
    const arr = new Uint8Array(4 * 20 * 20);
    const bad = new Array(arr.length).fill(0);
    t.throws(() => match(bad, arr, null, 20, 20), re);
    t.throws(() => match(arr, bad, null, 20, 20), re);
    t.throws(() => match(arr, arr, bad, 20, 20), re);
    t.end();
});

function diffTest(imgPath1, imgPath2, diffPath, threshold, includeAA, expectedMismatch) {
    const name = `comparing ${imgPath1} to ${imgPath2}, threshold: ${threshold}, includeAA: ${includeAA}`;

    test(name, (t) => {
        const img1 = readImage(imgPath1);
        const img2 = readImage(imgPath2);
        const {width, height} = img1;
        const expectedDiff = readImage(diffPath);
        const diff = new PNG({width, height});

        const mismatch = match(img1.data, img2.data, diff.data, width, height, {threshold, includeAA});
        const mismatch2 = match(img1.data, img2.data, null, width, height, {threshold, includeAA});

        t.same(diff.data, expectedDiff.data, 'diff image');
        t.same(mismatch, expectedMismatch, 'number of mismatched pixels');
        t.same(mismatch, mismatch2, 'number of mismatched pixels without diff');

        t.end();
    });
}

function readImage(name) {
    return PNG.sync.read(fs.readFileSync(path.join(__dirname, `fixtures/${name}.png`)));
}
