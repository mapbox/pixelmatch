extends WAT.Test

const Test := preload("./test.gd")


func test():
	var test = Test.new()
	test.equality_asserter = FuncRef.new()
	test.equality_asserter.set_instance(asserts)
	test.equality_asserter.function = "is_equal"
	test.test_diffs()

#const UPDATE = true
#
#const Pixelmatch := preload("res://addons/pixelmatch/pixelmatch.gd")
#
#const options = {threshold = 0.05}
#
#
#func test_diffs():
#	diff_test("1a", "1b", "1diff", options, 143)
#	diff_test("1a", "1b", "1diffmask", { threshold = 0.05, include_aa = false, diff_mask = true }, 143)
#	diff_test("1a", "1a", "1emptydiffmask", {threshold = 0, diff_mask = true}, 0)
#	diff_test("2a", "2b", "2diff", { threshold = 0.05, alpha = 0.5, aa_color = Color(0, 192, 0), diff_color = Color(255, 0, 255)}, 12437)
#	diff_test("3a", "3b", "3diff", options, 212)
#	diff_test("4a", "4b", "4diff", options, 36049)
#	diff_test("5a", "5b", "5diff", options, 0)
#	diff_test("6a", "6b", "6diff", options, 51)
#	# This test is passing, but printing a lot of errors.
#	#diff_test("6a", "6a", "6empty", {threshold = 0}, 0)
#	diff_test("7a", "7b", "7diff", { diff_color_alt = Color(0, 255, 0)}, 2448)
#
#
#func diff_test(img1_name, img2_name, diff_name, options: Dictionary, expected_mismatch):
#	var img1 = load_image(img1_name)
#	var img2 = load_image(img2_name)
#	var width = img1.get_width()
#	var height = img1.get_height()
#	var diff = Image.new()
#	diff.create(width, height, false, Image.FORMAT_RGBA8)
#
#	var pixelmatch = Pixelmatch.new()
#	for key in options.keys():
#		pixelmatch.set(key, options[key])
#
#	var mismatch = pixelmatch.diff(img1, img2, diff, width, height)
#	var mismatch2 = pixelmatch.diff(img1, img2, null, width, height)
#
#	if UPDATE:
#		diff.save_png("res://test/fixtures/%s.png" % diff_name)
#	else:
#		var expected_diff = load_image(diff_name)
#		var diffmatcher = Pixelmatch.new()
#		var diff_diff = pixelmatch.diff(expected_diff, diff, null, width, height)
#		asserts.is_equal(diff_diff, 0)
#
#	asserts.is_equal(mismatch, expected_mismatch, 'number of mismatched pixels %s %s' % [img1_name, img2_name])
#	asserts.is_equal(mismatch, mismatch2, 'number of mismatched pixels without diff %s %s' % [img1_name, img2_name])
#
#
#func load_image(img_name) -> Image:
#	var img = load("res://test/fixtures/%s.png" % img_name).get_data()
#	assert(img is Image)
#	return img
