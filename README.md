## pixelmatch

[![Build Status](https://travis-ci.org/mapbox/pixelmatch.svg?branch=master)](https://travis-ci.org/mapbox/pixelmatch)
[![Coverage Status](https://coveralls.io/repos/mapbox/pixelmatch/badge.svg?branch=master&service=github)](https://coveralls.io/github/mapbox/pixelmatch?branch=master)

The smallest, simplest and fastest JavaScript pixel-level image comparison library,
primarily designed to be used in regression tests that compare screenshots.

Inspired by [Resemble.js](https://github.com/Huddle/Resemble.js) and
[Blink-diff](https://github.com/yahoo/blink-diff)
and borrows the algorithm from the latter.
Unlike these libraries, pixelmatch is under 80 lines of code,
has no dependencies, and works on raw image data arrays,
so it's blazing fast and can be used in any environment (Node or browsers).

```js
var numMismatchedPixels = pixelmatch(img1.data, img2.data, diff.data, 800, 600);
```

### API

#### pixelmatch(img1, img2, output, width, height[, threshold, antialiasing])

- `img1` — image data of the first image (`Buffer` or `Uint8Array`)
- `img2` — image data of the second image
- `output` — image data to write the diff to
- `width` — width of the images
- `height` — height of the images
- `threshold` — matching threshold, `0.005` by default, ranges from `0` to `1`
- `antialiasing` — radius of antialiasing to ignore in pixels, `1` by default

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

### Changelog

#### 1.0.0 (Oct 14, 2015)

- Initial release.
