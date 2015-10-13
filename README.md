The smallest, simplest and fastest JavaScript image comparison library.

```js
var numPixels = imagematch(
    img1, img2, output, // Buffer or Uint8Array objects with image data
    width, height,      // image dimensions
    threshold           // matching threshold (0...1), 0.005 by default
);
// writes the diff image to output and returns the number of mismatched pixels
```
