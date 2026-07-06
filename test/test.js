
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {PNG} from 'pngjs';
import match from '../index.js';

const options = {threshold: 0.05};

diffTest('1a', '1b', '1diff', options, 154);
diffTest('1a', '1b', '1diffdefaultthreshold', {threshold: undefined}, 120);
diffTest('1a', '1b', '1diffmask', {threshold: 0.05, includeAA: false, diffMask: true}, 154);
diffTest('1a', '1a', '1emptydiffmask', {threshold: 0, diffMask: true}, 0);
diffTest('2a', '2b', '2diff', {
    threshold: 0.05,
    alpha: 0.5,
    aaColor: [0, 192, 0],
    diffColor: [255, 0, 255]
}, 12821);
diffTest('3a', '3b', '3diff', options, 220);
diffTest('4a', '4b', '4diff', options, 36563);
diffTest('5a', '5b', '5diff', options, 0);
diffTest('6a', '6b', '6diff', options, 51);
diffTest('6a', '6a', '6empty', {threshold: 0}, 0);
diffTest('7a', '7b', '7diff', {diffColorAlt: [0, 255, 0]}, 2440);
diffTest('8a', '5b', '8diff', options, 32896);

test('OKLab metric uses Lr toe correction for near-black differences', () => {
    const pixel = gray => new Uint8Array([gray, gray, gray, 255]);

    assert.equal(match(pixel(0), pixel(13), null, 1, 1), 0);
    assert.equal(match(pixel(0), pixel(23), null, 1, 1), 1);
});

test('OKLab metric separates the #127 color pairs at the default threshold', () => {
    // https://github.com/mapbox/pixelmatch/issues/127 — YIQ scored these near-identically;
    // OKLab Lr HyAB separates them. Normalized so black↔white = 1.0, default threshold = 0.1.
    const pair = (r1, g1, b1, r2, g2, b2) => match(
        new Uint8Array([r1, g1, b1, 255]),
        new Uint8Array([r2, g2, b2, 255]), null, 1, 1);

    assert.equal(pair(41, 56, 157, 41, 56, 0), 1, 'very different');
    assert.equal(pair(39, 44, 92, 39, 44, 14), 1, 'clearly different');
    assert.equal(pair(0, 254, 252, 94, 254, 252), 0, 'nearly identical');
    assert.equal(pair(0, 254, 252, 47, 254, 252), 0, 'imperceptible');
});

test('checkerboard: false blends semi-transparent pixels against white', () => {
    // These two pixels are visually identical composited on white but differ on a dark checkerboard
    const img1 = new Uint8Array([0, 0, 0, 128]);      // 50% transparent black
    const img2 = new Uint8Array([127, 127, 127, 255]); // opaque gray
    assert.equal(match(img1, img2, null, 1, 1, {checkerboard: false}), 0);
    assert.equal(match(img1, img2, null, 1, 1), 1);
});

test('windowSize returns the max diff-pixel count over N×N sliding windows', () => {
    const w = 10, h = 10;
    const img1 = new Uint8Array(w * h * 4).fill(255);
    const img2 = new Uint8Array(w * h * 4).fill(255);
    // dense 3×3 block of black diff pixels at (2,2)–(4,4)
    for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) {
        const p = (y * w + x) * 4;
        img2[p] = img2[p + 1] = img2[p + 2] = 0;
    }
    // omitted / Infinity: total diff count
    assert.equal(match(img1, img2, null, w, h, {includeAA: true}), 9);
    assert.equal(match(img1, img2, null, w, h, {includeAA: true, windowSize: Infinity}), 9);
    // 3×3 window captures the whole block
    assert.equal(match(img1, img2, null, w, h, {includeAA: true, windowSize: 3}), 9);
    // 2×2 window captures at most 4
    assert.equal(match(img1, img2, null, w, h, {includeAA: true, windowSize: 2}), 4);
    // window larger than the image is clamped, still finds all 9
    assert.equal(match(img1, img2, null, w, h, {includeAA: true, windowSize: 100}), 9);
    // identical images return 0 in windowed mode
    assert.equal(match(img1, img1, null, w, h, {windowSize: 3}), 0);
});

test('windowSize on a real fixture (6a/6b, 256×256, 51 diff pixels)', () => {
    const img1 = readImage('6a');
    const img2 = readImage('6b');
    const {width, height} = img1;
    const opts = {threshold: 0.05};
    const total = match(img1.data, img2.data, null, width, height, opts);
    assert.equal(total, 51); // matches the 6diff fixture test
    // a square window at least as large as the image is the degenerate whole-image
    // window, so it must equal the total count
    assert.equal(match(img1.data, img2.data, null, width, height, {...opts, windowSize: width}), total);
    assert.equal(match(img1.data, img2.data, null, width, height, {...opts, windowSize: 100000}), total);
    // smaller windows contain a subset of the diffs, but never more than the total
    assert.equal(match(img1.data, img2.data, null, width, height, {...opts, windowSize: 32}), 29);
    assert.equal(match(img1.data, img2.data, null, width, height, {...opts, windowSize: 8}), 6);
});

test('throws error if image sizes do not match', () => {
    assert.throws(() => match(new Uint8Array(8), new Uint8Array(9), null, 2, 1), 'Image sizes do not match');
});

test('throws error if image sizes do not match width and height', () => {
    assert.throws(() => match(new Uint8Array(9), new Uint8Array(9), null, 2, 1), 'Image data size does not match width/height');
});

test('throws error if provided wrong image data format', () => {
    const err = 'Image data: Uint8Array, Uint8ClampedArray or Buffer expected';
    const arr = new Uint8Array(4 * 20 * 20);
    const bad = new Array(arr.length).fill(0);
    assert.throws(() => match(bad, arr, null, 20, 20), err);
    assert.throws(() => match(arr, bad, null, 20, 20), err);
    assert.throws(() => match(arr, arr, bad, 20, 20), err);
});

function diffTest(imgPath1, imgPath2, diffPath, options, expectedMismatch) {
    const name = `comparing ${imgPath1} to ${imgPath2}, ${JSON.stringify(options)}`;

    test(name, () => {
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
            assert.ok(diff.data.equals(expectedDiff.data), 'diff image');
        }
        assert.equal(mismatch, expectedMismatch, 'number of mismatched pixels');
        assert.equal(mismatch, mismatch2, 'number of mismatched pixels without diff');
    });
}

function readImage(name) {
    return PNG.sync.read(fs.readFileSync(new URL(`fixtures/${name}.png`, import.meta.url)));
}
function writeImage(name, image) {
    fs.writeFileSync(new URL(`fixtures/${name}.png`, import.meta.url), PNG.sync.write(image));
}
