# Copyright (c) 2019, Mapbox (ISC License).
# Copyright (c) 2021, Leroy Hopson (MIT License).

extends Reference

var threshold := 0.1 # matching threshold (0 to 1); smaller is more sensitive
var include_aa := false # whether to skip anti-aliasing detection
var alpha := 0.1 # opacity of original image in diff output
var aa_color := Color(255, 255, 0) # color of anti-aliased pixels in diff output
var diff_color := Color(255, 0, 0) # color of different pixels in diff output
var diff_color_alt: Color # whether to detect dark on light differences between img1 and img2 and set an alternative color to differentiate between the two
var diff_mask := false # draw the diff over a transparent background (a mask)

var _width: int

func diff(img1: Image, img2: Image, output: Image, width: int, height: int) -> int:
	if not img1 or not img2:
		push_error("Two images are required.")
		return -1
	
	var images := [img1, img2, output] if output else [img1, img2]
	var formats := []
	
	for image in images:
		formats.append(image.get_format())
		image.convert(Image.FORMAT_RGBA8)
		image.lock()
	
	var diff = _pixelmatch(img1, img2, output, width, height)
	
	for i in images.size():
		var image: Image = images[i]
		image.unlock()
		image.convert(formats[i])
	
	return diff


func _i2v(index: int) -> Vector2:
	var y = (index / 4) / _width
	var x = (index / 4) % _width
	return Vector2(x, y)


func _pixelmatch(img1: Image, img2: Image, output: Image, width: int, height: int) -> int:
	if img1.get_size() != img2.get_size() or (output and output.get_size() != img1.get_size()):
		push_error("Image sizes do not match.")
		return -1
	
	assert(img1.get_size().x == width)
	assert(img1.get_size().y == height)
	
	# set width for use by _i2v()
	_width = width
	
#	print("w: ", width)
#	print("h: ", height)
#	print("bytes: ", img1.get_data().size())
#
#	return -1
	
	# check if images are identical
	var length = width * height * 4
	var a8: PoolByteArray = img1.get_data()
	var b8: PoolByteArray = img2.get_data()
	var identical = true
	
	#assert(a8.size() == length)
	
	for i in range(a8.size()):
		if a8[i] != b8[i]:
			identical = false
			break
	
	if identical: # fast path if identical
		if output and not diff_mask:
			for i in range(length):
				_draw_gray_pixel(img1, i, alpha, output)
		return 0
	
	# maximum acceptable square distance between two colors;
	# 35215 is the maximum possible value for the YIQ difference metric
	var max_delta := 35215 * threshold * threshold
	var diff := 0
	
	# compare each pixel of one image against the other one
	for y in range(height):
		for x in range(width):
		
			var pos = (y * width + x) * 4
			
			# squared YUV distance between colors at this pixel position, negative if the img2 pixel is darker
			var delta = _color_delta(img1, img2, pos, pos)
			
			# the color difference is above the threshold
			if abs(delta) > max_delta:
				# check it's a real rendering difference or just anti-aliasing
				if not include_aa and _antialiased(img1, x, y, width, height, img2) or _antialiased(img2, x, y, width, height, img1):
					# one of the pixels is anti-aliasing; draw as yellow and do not count as difference
					# note that we do not include such pixels in a mask
					if output and not diff_mask:
						assert(aa_color is Color)
						_draw_pixel(output, pos, aa_color)
				
				else:
					# found substantial difference not caused by anti-aliasing; draw it as such
					if output:
						_draw_pixel(output, pos, diff_color_alt if delta < 0 else diff_color)
					diff += 1
			
			elif output:
				# pixels are similar; draw background as grayscale image blended with white
				if not diff_mask:
					_draw_gray_pixel(img1, pos, alpha, output)
			
	# return the number of different pixels
	return diff


func _is_pixel_data(arr):
	return arr is PoolByteArray


# check if a pixel is likely a part of anti-aliasing;
# based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V. Vysniauskas, 2009
func _antialiased(img, x1, y1, width, height, img2):
	var x0 = max(x1 - 1, 0)
	var y0 = max(y1 - 1, 0)
	var x2 = min(x1 + 1, width - 1)
	var y2 = min(y1 + 1, height - 1)
	var pos = (y1 * width + x1) * 4
	var zeroes = 1 if x1 == x0 or x1 == x2 or y1 == y0 or y1 == y2 else 0
	var min_delta = 0
	var max_delta = 0
	var min_x
	var min_y
	var max_x
	var max_y
	
	# go through 8 adjacent pixels
	for x in range(x0, x2 + 1):
		for y in range(y0, y2 + 1):
			if x == x1 and y == y1:
				continue
			
			# brightness delta between the center pixel and adjacent one
			var delta = _color_delta(img, img, pos, (y * width + x) * 4, true)
			
			# count the number of equal, darker and brighter adjacent pixels
			if delta == 0:
				zeroes += 1
				# if found more than 2 equal siblings, it's definitely not anti-aliasing
				if zeroes > 2:
					return false
			
			# remember the darkest pixel
			elif delta < min_delta:
				min_delta = delta
				min_x = x
				min_y = y
			
			# remember the brightest pixel
			elif delta > max_delta:
				max_delta = delta
				max_x = x
				max_y = y
				
	# if there are no both darker and brighter pixels among siblings, it's not anti-aliasing
	if min_delta == 0 or max_delta == 0:
		return false
	
	# if either the darkest or the brightest pixel has 3+ equal siblings in both images
	# (definitely not anti-aliased), this pixel is anti-aliased
	return _has_many_siblings(img, min_x, min_y, width, height) and _has_many_siblings(img2, min_x, min_y, width, height) or _has_many_siblings(img, max_x, max_y, width, height) and _has_many_siblings(img2, max_x, max_y, width, height)


# check if a pixel has 3+ adjacent pixels of the same color.
func _has_many_siblings(img, x1, y1, width, height):
	var x0 = max(x1 - 1, 0)
	var y0 = max(y1 - 1, 0)
	var x2 = min(x1 + 1, width - 1)
	var y2 = min(y1 + 1, height - 1)
	var pos = (y1 * width + x1) * 4
	var zeroes = 1 if x1 == x0 or x1 == x2 or y1 == y0 or y1 == y2 else 0
	
	# go through 8 adjacent pixels
	for x in range(x0, x2 + 1):
		for y in range(y0, y2 + 1):
			if x == x1 and y == y1:
				continue
			
			var pos2 = (y * width + x) * 4
			if img.get_pixelv(_i2v(pos)) == img.get_pixelv(_i2v(pos2)):
				zeroes += 1
			
			if zeroes > 2:
				return true
	
	return false


# calculate color difference according to the paper "Measuring perceived color difference
# using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos
func _color_delta(img1, img2, k: int, m: int, y_only = false):
	var pixel1: Color = img1.get_pixelv(_i2v(k))
	var r1 = pixel1.r8
	var g1 = pixel1.g8
	var b1 = pixel1.b8
	var a1 = pixel1.a8
	
	var pixel2: Color = img2.get_pixelv(_i2v(m))
	var r2 = pixel2.r8
	var g2 = pixel2.g8
	var b2 = pixel2.b8
	var a2 = pixel2.a8
	
	if a1 == a2 and r1 == r2 and g1 == g2 and b1 == b2:
		return 0
	
	if a1 < 255:
		a1 = a1 / 255
		r1 = _blend(r1, a1)
		g1 = _blend(g1, a1)
		b1 = _blend(b1, a1)
	
	if a2 < 255:
		a2 = a2 / 255
		r2 = _blend(r2, a2)
		g2 = _blend(g2, a2)
		b2 = _blend(b2, a2)
	
	var y1 = _rgb2y(r1, g1, b1)
	var y2 = _rgb2y(r2, g2, b2)
	var y = y1 - y2
	
	if y_only: # brightness difference only
		return y
	
	var i = _rgb2i(r1, g1, b1) - _rgb2i(r2, g2, b2)
	var q = _rgb2q(r1, g1, b1) - _rgb2q(r2, g2, b2)
	
	var delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q
	
	# encode whether the pixel lightens or darkens in the sign
	return -delta if y1 > y2 else delta


func _rgb2y(r, g, b):
	return r * 0.29889531 + g * 0.58662247 + b * 0.11448223


func _rgb2i(r, g, b):
	 return r * 0.59597799 - g * 0.27417610 - b * 0.32180189


func _rgb2q(r, g, b):
	return r * 0.21147017 - g * 0.52261711 + b * 0.31114694


# blend semi-transparent color with white
func _blend(c, a):
	return 255 + (c - 255) * a


func _draw_pixel(output: Image, pos: int, color: Color):
	color.a8 = 255
	output.set_pixelv(_i2v(pos), color)


func _draw_gray_pixel(img, i, alpha, output):
	var pixel: Color = img.get_pixelv(_i2v(i))
	var r = pixel.r8
	var g = pixel.g8
	var b = pixel.b8
	var a = pixel.a8
	var val = _blend(_rgb2y(r, g, b), alpha * a/255)
	_draw_pixel(output, i, Color(val, val, val))
