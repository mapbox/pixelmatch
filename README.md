### pixelmatch

The smallest, simplest and fastest JavaScript image comparison library.

Inspired by [Resemble.js](https://github.com/Huddle/Resemble.js)
and [Blink-diff](https://github.com/yahoo/blink-diff),
but is much simpler and works on raw image data arrays
so that it can be used in any environment (Node or browsers).

#### Install

```bash
npm install pixelmatch
```

#### Usage

```js
pixelmatch(
    img1, img2,         // image data to compare (Buffer or Uint8Array)
    output,             // output data to write the diff to (Buffer or Uint8Array)
    width, height,      // image dimensions (should be the same in all 3 images)
    threshold,          // matching threshold, 0.005 by default, ranges from 0 to 1
    antialiasing        // number of antialiased pixels to ignore, 1 by default
);
// compares two images, writes the output diff and returns the number of mismatched pixels
```

Also comes with a binary:

```bash
pixelmatch image1.png image2.png output.png 0.005 1
```
