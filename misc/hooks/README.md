# Git hooks for GodotXterm 

This folder contains git hooks meant to be installed locally by GodotXterm
contributors to make sure they comply with our requirements.

## List of hooks

- Pre-commit hook for gdformat: Applies formatting to staged gdscript files
  using the [GDScript Toolkit](https://github.com/Scony/godot-gdscript-toolkit) by Pawel Lampe et al.

- Pre-commit hook for clang-format: Applies clang-format to the staged files
  before accepting a commit; blocks the commit and generates a patch if the
  style is not respected.
  Should work on Linux and macOS. You may need to edit the file if your
  clang-format binary is not in the $PATH, or if you want to enable colored
  output with pygmentize.

## Installation

Symlink (or copy) all the files from this folder (except this README) into your .git/hooks folder, and make sure
the hooks and helper scripts are executable.
