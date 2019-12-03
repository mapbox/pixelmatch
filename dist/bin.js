#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var pngjs_1 = require("pngjs");
var fs_1 = __importDefault(require("fs"));
var index_1 = __importDefault(require("./index"));
if (process.argv.length < 4) {
    console.log('Usage: imagematch image1.png image2 [diff.png] [threshold=0.005] [includeAA=false]');
    process.exit(64);
}
var _a = process.argv, img1Path = _a[2], img2Path = _a[3], diffPath = _a[4], threshold = _a[5], includeAA = _a[6];
var options = {
    threshold: +threshold,
    includeAA: includeAA !== undefined && includeAA !== 'false'
};
var img1 = pngjs_1.PNG.sync.read(fs_1.default.readFileSync(img1Path));
var img2 = pngjs_1.PNG.sync.read(fs_1.default.readFileSync(img2Path));
var width = img1.width, height = img1.height;
if (img2.width !== width || img2.height !== height) {
    console.log("Image dimensions do not match: " + width + "x" + height + " vs " + img2.width + "x" + img2.height);
    process.exit(65);
}
var diff = diffPath ? new pngjs_1.PNG({ width: width, height: height }) : null;
console.time('matched in');
var diffs = index_1.default.pixelmatch(img1.data, img2.data, diff ? diff.data : null, width, height, options);
console.timeEnd('matched in');
console.log("different pixels: " + diffs);
console.log("error " + Math.round(100 * 100 * diffs / (width * height)) / 100 + "%");
if (diff) {
    fs_1.default.writeFileSync(diffPath, pngjs_1.PNG.sync.write(diff));
}
process.exit(diffs ? 66 : 0);
