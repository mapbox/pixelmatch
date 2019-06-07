'use strict';

const PNG = require('pngjs').PNG;
const fs = require('fs');
const test = require('tape').test;
const path = require('path');
const match = require('../.');

const options = {threshold: 0.05};

diffTest('1a', '1b', '1diff', options, 143);
diffTest('2a', '2b', '2diff', {
    threshold: 0.05,
    alpha: 0.5,
    aaColor: [0, 192, 0],
    diffColor: [255, 0, 255]
}, 12437);
diffTest('3a', '3b', '3diff', options, 212);
diffTest('4a', '4b', '4diff', options, 36049);
diffTest('5a', '5b', '5diff', options, 0);
diffTest('6a', '6b', '6diff', options, 51);
diffTest('6a', '6a', '6empty', {threshold: 0}, 0);

test('throws error if image sizes do not match', (t) => {
    t.throws(() => match(new Uint8Array(8), new Uint8Array(9), null, 2, 1), 'Image sizes do not match');
    t.end();
});

test('throws error if image sizes do not match width and height', (t) => {
    t.throws(() => match(new Uint8Array(9), new Uint8Array(9), null, 2, 1), 'Image data size does not match width/height');
    t.end();
});

test('throws error if provided wrong image data format', (t) => {
    const err = 'Image data: Uint8Array, Uint8ClampedArray or Buffer expected';
    const arr = new Uint8Array(4 * 20 * 20);
    const bad = new Array(arr.length).fill(0);
    t.throws(() => match(bad, arr, null, 20, 20), err);
    t.throws(() => match(arr, bad, null, 20, 20), err);
    t.throws(() => match(arr, arr, bad, 20, 20), err);
    t.end();
});

function diffTest(imgPath1, imgPath2, diffPath, options, expectedMismatch) {
    const name = `comparing ${imgPath1} to ${imgPath2}, ${JSON.stringify(options)}`;

    test(name, (t) => {
        const img1 = readImage(imgPath1);
        const img2 = readImage(imgPath2);
        const {width, height} = img1;
        const diff = new PNG({width, height});

        const mismatch = match(img1.data, img2.data, diff.data, width, height, options);
        const mismatch2 = match(img1.data, img2.data, null, width, height, options);

        if (process.env.UPDATE) {
            writeImage(diffPath, diff);
        } else {
            const expectedDiff = readImage(diffPath);
            t.ok(diff.data.equals(expectedDiff.data), 'diff image');
        }
        t.equal(mismatch, expectedMismatch, 'number of mismatched pixels');
        t.equal(mismatch, mismatch2, 'number of mismatched pixels without diff');

        t.end();
    });
}

function readImage(name) {
    return PNG.sync.read(fs.readFileSync(path.join(__dirname, `fixtures/${name}.png`)));
}
function writeImage(name, image) {
    fs.writeFileSync(path.join(__dirname, `fixtures/${name}.png`), PNG.sync.write(image));
}
