#!/usr/bin/env node

import { PNG } from 'pngjs'
import fs from 'fs';
import Pixelmatch, { Options } from './index';

if (process.argv.length < 4) {
  console.log('Usage: imagematch image1.png image2 [diff.png] [threshold=0.005] [includeAA=false]');
  process.exit(64)
}

const [,, img1Path, img2Path, diffPath, threshold, includeAA] = process.argv

const options: Partial<Options> = {
  threshold: +threshold,
  includeAA: includeAA !== undefined && includeAA !== 'false'
}

const img1 = PNG.sync.read(fs.readFileSync(img1Path))
const img2 = PNG.sync.read(fs.readFileSync(img2Path))

const { width, height } = img1

if (img2.width !== width || img2.height !== height) {
  console.log(`Image dimensions do not match: ${width}x${height} vs ${img2.width}x${img2.height}`);
  process.exit(65)
}

const diff = diffPath ? new PNG({ width, height }) : null

console.time('matched in')
const diffs = Pixelmatch.pixelmatch(img1.data, img2.data, diff ? diff.data : null , width, height, options)
console.timeEnd('matched in')

console.log(`different pixels: ${diffs}`);
console.log(`error ${Math.round(100 * 100 * diffs / (width * height)) / 100}%`);

if (diff) {
  fs.writeFileSync(diffPath, PNG.sync.write(diff))
}

process.exit(diffs ? 66: 0)
