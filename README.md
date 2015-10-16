## pixelmatch

[![Build Status](https://travis-ci.org/mapbox/pixelmatch.svg?branch=master)](https://travis-ci.org/mapbox/pixelmatch)
[![Coverage Status](https://coveralls.io/repos/mapbox/pixelmatch/badge.svg?branch=master&service=github)](https://coveralls.io/github/mapbox/pixelmatch?branch=master)

The smallest, simplest and fastest JavaScript pixel-level image comparison library,
primarily designed to be used in regression tests that compare screenshots.

Inspired by [Resemble.js](https://github.com/Huddle/Resemble.js) and
[Blink-diff](https://github.com/yahoo/blink-diff),
including features like anti-aliasing detection and perceptive color metrics.
Unlike these libraries, pixelmatch is under **100 lines of code**,
has **no dependencies**, and works on **raw arrays** of image data,
so it's **blazing fast** and can be used in **any environment** (Node or browsers).

```js
var numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, 800, 600);
```

### API

#### pixelmatch(img1, img2, output, width, height[, threshold, antialiasing])

- `img1`, `img2` — Image data of the images to compare (`Buffer` or `Uint8Array`).
- `output` — Image data to write the diff to.
- `width`, `height` — Width and height of the images. Note that all three images need to have the same dimensions.
- `threshold` — Matching threshold, ranges from `0` to `1`. Smaller values make the comparison more sensitive. `0.005` by default.
- `antialiasing` — Radius of antialiasing to ignore in pixels. `1` by default.

Compares two images, writes the output diff and returns the number of mismatched pixels.

### Command line

Pixelmatch comes with a binary that works with PNG images:

```bash
pixelmatch image1.png image2.png output.png 0.005 1
```

### Install

Install with NPM:

```bash
npm install pixelmatch
```

To build a browser-compatible version, clone the repository locally, then run:

```bash
npm install -g browserify
browserify -s pixelmatch index.js > pixelmatch.js
```

### Example output

| expected | actual | diff |
| --- | --- | --- |
| ![](https://mapbox.s3.amazonaws.com/mapbox-gl-native/tests/4307.1/text-halo-blur/default/expected.png) | ![](https://mapbox.s3.amazonaws.com/mapbox-gl-native/tests/4307.1/text-halo-blur/default/actual.png) | ![1diff](https://cloud.githubusercontent.com/assets/25395/10480779/d9ad1c66-7274-11e5-8b6c-9b4987316eaa.png) |
| ![](https://pbs.twimg.com/media/CRYXm86VAAQxo-o.png) | ![](https://pbs.twimg.com/media/CRYXm9uUYAAIGAf.png) | ![](https://pbs.twimg.com/media/CRYXnAAUwAEsuzb.png) |

### [Changelog](https://github.com/mapbox/pixelmatch/releases)
