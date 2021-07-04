extends "res://addons/gut/test.gd"

const Test := preload("./test.gd")


func test_diffs():
	var test = Test.new()
	test.equality_asserter = FuncRef.new()
	test.equality_asserter.set_instance(self)
	test.equality_asserter.function = "assert_eq"
