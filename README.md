The smallest, simplest and fastest JavaScript image comparison library.

Inspired by [Resemble.js](https://github.com/Huddle/Resemble.js)
and [Blink-diff](https://github.com/yahoo/blink-diff),
but is much simpler, faster,
and works on raw image data arrays so that it can be used in any environment (Node or browsers).

```js
var numPixels = imagematch(
    img1, img2, output, // Buffer or Uint8Array objects with image data
    width, height,      // image dimensions
    threshold           // matching threshold (0...1), 0.005 by default
);
// writes the diff image to output and returns the number of mismatched pixels
```

Also comes with a binary:

```bash
imagematch image1.png image2.png output.png 0.005
```
