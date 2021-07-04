tool
extends SceneTree

signal updated(plugin)

const VERSION = "0.1.1"
const DEFAULT_PLUGIN_URL = "https://git::@github.com/%s.git"
const DEFAULT_PLUG_DIR = "res://.plugged"
const DEFAULT_CONFIG_PATH = DEFAULT_PLUG_DIR + "/index.cfg"
const DEFAULT_USER_PLUG_SCRIPT_PATH = "res://plug.gd"
const DEFAULT_BASE_PLUG_SCRIPT_PATH = "res://addons/gd-plug/plug.gd"

const ENV_PRODUCTION = "production"
const ENV_TEST = "test"
const ENV_FORCE = "force"
const ENV_KEEP_IMPORT_FILE = "keep_import_file"
const ENV_KEEP_IMPORT_RESOURCE_FILE = "keep_import_resource_file"

const MSG_PLUG_START_ASSERTION = "_plug_start() must be called first"

var project_dir = Directory.new()
var installation_config = ConfigFile.new()
var logger = _Logger.new()

var _installed_plugins
var _plugged_plugins = {}

var _threads = []
var _mutex = Mutex.new()
var _start_time = 0
var threadpool = _ThreadPool.new(logger)


func _init():
	threadpool.connect("all_thread_finished", self, "request_quit")

func _initialize():
	var args = OS.get_cmdline_args()
	# Trim unwanted args passed to godot executable
	for arg in Array(args):
		args.remove(0)
		if "plug.gd" in arg:
			break

	for arg in args:
		# NOTE: "--key" or "-key" will always be consumed by godot executable, see https://github.com/godotengine/godot/issues/8721
		var key = arg.to_lower()
		match key:
			"detail":
				logger.log_format = _Logger.DEFAULT_LOG_FORMAT_DETAIL
			"debug", "d":
				logger.log_level = _Logger.LogLevel.DEBUG
			"quiet", "q", "silent":
				logger.log_level = _Logger.LogLevel.NONE
			"production":
				OS.set_environment(ENV_PRODUCTION, "true")
			"test":
				OS.set_environment(ENV_TEST, "true")
			"force":
				OS.set_environment(ENV_FORCE, "true")
			"keep-import-file":
				OS.set_environment(ENV_KEEP_IMPORT_FILE, "true")
			"keep-import-resource-file":
				OS.set_environment(ENV_KEEP_IMPORT_RESOURCE_FILE, "true")

	logger.debug("cmdline_args: %s" % args)
	_start_time = OS.get_system_time_msecs()
	_plug_start()
	if args.size() > 0:
		_plugging()
		match args[0]:
			"init":
				_plug_init()
			"install", "update":
				_plug_install()
			"uninstall":
				_plug_uninstall()
			"clean":
				_plug_clean()
			"upgrade":
				_plug_upgrade()
			"status":
				_plug_status()
			"version":
				logger.info(VERSION)
			_:
				logger.error("Unknown command %s" % args[0])
	# NOTE: Do no put anything after this line except request_quit(), as _plug_*() may call request_quit()
	request_quit()

func _idle(delta):
	threadpool.process(delta)

func _finalize():
	_plug_end()
	logger.info("Finished, elapsed %.3fs" % ((OS.get_system_time_msecs() - _start_time) / 1000.0))

func _on_updated(plugin):
	pass

func _plugging():
	pass

func request_quit(exit_code=-1):
	if threadpool.is_all_thread_finished() and threadpool.is_all_task_finished():
		quit(exit_code)
		return true
	logger.debug("Request quit declined, threadpool is still running")
	return false

# Index installed plugins, or create directory "plugged" if not exists
func _plug_start():
	logger.debug("Plug start")
	if not project_dir.dir_exists(DEFAULT_PLUG_DIR):
		if project_dir.make_dir(ProjectSettings.globalize_path(DEFAULT_PLUG_DIR)) == OK:
			logger.debug("Make dir %s for plugin installation")
	if installation_config.load(DEFAULT_CONFIG_PATH) == OK:
		logger.debug("Installation config loaded")
	else:
		logger.debug("Installation config not found")
	_installed_plugins = installation_config.get_value("plugin", "installed", {})

# Install plugin or uninstall plugin if unlisted
func _plug_end():
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	var test = !!OS.get_environment(ENV_TEST)
	if not test:
		installation_config.set_value("plugin", "installed", _installed_plugins)
		if installation_config.save(DEFAULT_CONFIG_PATH) == OK:
			logger.debug("Plugged config saved")
		else:
			logger.error("Failed to save plugged config")
	else:
		logger.warn("Skipped saving of plugged config in test mode")
	_installed_plugins = null

func _plug_init():
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	logger.info("Init gd-plug...")
	var file = File.new()
	if file.file_exists(DEFAULT_USER_PLUG_SCRIPT_PATH):
		logger.warn("%s already exists!" % DEFAULT_USER_PLUG_SCRIPT_PATH)
	else:
		file.open(DEFAULT_USER_PLUG_SCRIPT_PATH, File.WRITE)
		file.store_string(INIT_PLUG_SCRIPT)
		file.close()
		logger.info("Created %s" % DEFAULT_USER_PLUG_SCRIPT_PATH)

func _plug_install():
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	logger.info("Installing...")
	for plugin in _plugged_plugins.values():
		var installed = plugin.name in _installed_plugins
		if installed:
			var installed_plugin = get_installed_plugin(plugin.name)
			if (installed_plugin.dev or plugin.dev) and OS.get_environment(ENV_PRODUCTION):
				logger.info("Remove dev plugin for production: %s" % plugin.name)
				threadpool.enqueue_task(self, "uninstall_plugin", installed_plugin)
			else:
				threadpool.enqueue_task(self, "update_plugin", plugin)
		else:
			threadpool.enqueue_task(self, "install_plugin", plugin)

	var removed_plugins = []
	for plugin in _installed_plugins.values():
		var removed = not (plugin.name in _plugged_plugins)
		if removed:
			removed_plugins.append(plugin)
	if removed_plugins:
		threadpool.disconnect("all_thread_finished", self, "request_quit")
		if not threadpool.is_all_thread_finished():
			yield(threadpool, "all_thread_finished")
			logger.debug("All installation finished! Ready to uninstall removed plugins...")
		threadpool.connect("all_thread_finished", self, "request_quit")
		for plugin in removed_plugins:
			threadpool.enqueue_task(self, "uninstall_plugin", plugin, Thread.PRIORITY_LOW)

func _plug_uninstall():
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	logger.info("Uninstalling...")
	for plugin in _installed_plugins.values():
		var installed_plugin = get_installed_plugin(plugin.name)
		threadpool.enqueue_task(self, "uninstall_plugin", installed_plugin, Thread.PRIORITY_LOW)

func _plug_clean():
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	logger.info("Cleaning...")
	var plugged_dir = Directory.new()
	plugged_dir.open(DEFAULT_PLUG_DIR)
	plugged_dir.list_dir_begin(true, true)
	var file = plugged_dir.get_next()
	while not file.empty():
		if plugged_dir.current_is_dir():
			if not (file in _installed_plugins):
				logger.info("Remove %s" % file)
				threadpool.enqueue_task(self, "directory_delete_recursively", plugged_dir.get_current_dir() + "/" + file)
		file = plugged_dir.get_next()
	plugged_dir.list_dir_end()

func _plug_upgrade():
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	logger.info("Upgrading gd-plug...")
	plug("imjp94/gd-plug")
	var gd_plug = _plugged_plugins["gd-plug"]
	OS.set_environment(ENV_FORCE, "true") # Required to overwrite res://addons/gd-plug/plug.gd
	threadpool.enqueue_task(self, "install_plugin", gd_plug)
	threadpool.disconnect("all_thread_finished", self, "request_quit")
	if not threadpool.is_all_thread_finished():
		yield(threadpool, "all_thread_finished")
		logger.debug("All installation finished! Ready to uninstall removed plugins...")
	threadpool.connect("all_thread_finished", self, "request_quit")
	threadpool.enqueue_task(self, "directory_delete_recursively", gd_plug.plug_dir)

func _plug_status():
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	logger.info("Installed %d plugin%s" % [_installed_plugins.size(), "s" if _installed_plugins.size() > 1 else ""])
	var new_plugins = _plugged_plugins.duplicate()
	var has_checking_plugin = false
	var removed_plugins = []
	for plugin in _installed_plugins.values():
		logger.info("- {name} - {url}".format(plugin))
		new_plugins.erase(plugin.name)
		var removed = not (plugin.name in _plugged_plugins)
		if removed:
			removed_plugins.append(plugin)
		else:
			threadpool.enqueue_task(self, "check_plugin", _plugged_plugins[plugin.name])
			has_checking_plugin = true
	if has_checking_plugin:
		logger.info("\n", true)
		threadpool.disconnect("all_thread_finished", self, "request_quit")
		yield(threadpool, "all_thread_finished")
		threadpool.connect("all_thread_finished", self, "request_quit")
		logger.debug("Finished checking plugins, ready to proceed")
	if new_plugins:
		logger.info("\nPlugged %d plugin%s" % [new_plugins.size(), "s" if new_plugins.size() > 1 else ""])
		for plugin in new_plugins.values():
			var is_new = not (plugin.name in _installed_plugins)
			if is_new:
				logger.info("- {name} - {url}".format(plugin))
	if removed_plugins:
		logger.info("\nUnplugged %d plugin%s" % [removed_plugins.size(), "s" if removed_plugins.size() > 1 else ""])
		for plugin in removed_plugins:
			logger.info("- %s removed" % plugin.name)
	var plug_directory = Directory.new()
	var orphan_dirs = []
	if plug_directory.open(DEFAULT_PLUG_DIR) == OK:
		plug_directory.list_dir_begin(true, true)
		var file = plug_directory.get_next()
		while not file.empty():
			if plug_directory.current_is_dir():
				if not (file in _installed_plugins):
					orphan_dirs.append(file)
			file = plug_directory.get_next()
		plug_directory.list_dir_end()
	if orphan_dirs:
		logger.info("\nOrphan directory, %d found in %s, execute \"clean\" command to remove" % [orphan_dirs.size(), DEFAULT_PLUG_DIR])
		for dir in orphan_dirs:
			logger.info("- %s" % dir)

	if has_checking_plugin:
		request_quit()

# Index & validate plugin
func plug(repo, args={}):
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	repo = repo.strip_edges()
	var plugin_name = get_plugin_name_from_repo(repo)
	if plugin_name in _plugged_plugins:
		logger.info("Plugin already plugged: %s" % plugin_name)
		return
	var plugin = {}
	plugin.name = plugin_name
	plugin.url = ""
	if ":" in repo:
		plugin.url = repo
	elif repo.find("/") == repo.rfind("/"):
		plugin.url = DEFAULT_PLUGIN_URL % repo
	else:
		logger.error("Invalid repo: %s" % repo)
	plugin.plug_dir = DEFAULT_PLUG_DIR + "/" + plugin.name

	var is_valid = true
	plugin.include = args.get("include", [])
	is_valid = is_valid and validate_var_type(plugin, "include", TYPE_ARRAY, "Array")
	plugin.exclude = args.get("exclude", [])
	is_valid = is_valid and validate_var_type(plugin, "exclude", TYPE_ARRAY, "Array")
	plugin.branch = args.get("branch", "")
	is_valid = is_valid and validate_var_type(plugin, "branch", TYPE_STRING, "String")
	plugin.tag = args.get("tag", "")
	is_valid = is_valid and validate_var_type(plugin, "tag", TYPE_STRING, "String")
	plugin.commit = args.get("commit", "")
	is_valid = is_valid and validate_var_type(plugin, "commit", TYPE_STRING, "String")
	if not plugin.commit.empty():
		var is_valid_commit = plugin.commit.length() == 40
		if not is_valid_commit:
			logger.error("Expected full length 40 digits commit-hash string, given %s" % plugin.commit)
		is_valid = is_valid and is_valid_commit
	plugin.dev = args.get("dev", false)
	is_valid = is_valid and validate_var_type(plugin, "dev", TYPE_BOOL, "Boolean")
	plugin.on_updated = args.get("on_updated", "")
	is_valid = is_valid and validate_var_type(plugin, "on_updated", TYPE_STRING, "String")
	plugin.install_root = args.get("install_root", "")
	is_valid = is_valid and validate_var_type(plugin, "install_root", TYPE_STRING, "String")

	if is_valid:
		_plugged_plugins[plugin.name] = plugin
		logger.debug("Plug: %s" % plugin)
	else:
		logger.error("Failed to plug %s, validation error" % plugin.name)

func install_plugin(plugin):
	var test = !!OS.get_environment(ENV_TEST)
	var can_install = not OS.get_environment(ENV_PRODUCTION) if plugin.dev else true
	if can_install:
		logger.info("Installing plugin %s..." % plugin.name)
		var result = is_plugin_downloaded(plugin)
		if result != OK:
			result = downlaod(plugin)
		else:
			logger.info("Plugin already downloaded")

		if result == OK:
			install(plugin)
		else:
			logger.error("Failed to install plugin %s with error code %d" % [plugin.name, result])

func uninstall_plugin(plugin):
	var test = !!OS.get_environment(ENV_TEST)
	logger.info("Uninstalling plugin %s..." % plugin.name)
	uninstall(plugin)
	directory_delete_recursively(plugin.plug_dir, {"exclude": [DEFAULT_CONFIG_PATH], "test": test})

func update_plugin(plugin, checking=false):
	if not (plugin.name in _installed_plugins):
		logger.info("%s new plugin" % plugin.name)
		return true

	var git = _GitExecutable.new(ProjectSettings.globalize_path(plugin.plug_dir), logger)
	var installed_plugin = get_installed_plugin(plugin.name)
	var changes = compare_plugins(plugin, installed_plugin)
	var should_clone = false
	var should_pull = false
	var should_reinstall = false

	if plugin.tag or plugin.commit:
		for rev in ["tag", "commit"]:
			var freeze_at = plugin[rev]
			if freeze_at:
				logger.info("%s frozen at %s \"%s\"" % [plugin.name, rev, freeze_at])
				break
	else:
		var ahead_behind = []
		if git.fetch("origin " + plugin.branch if plugin.branch else "origin").exit == OK:
			ahead_behind = git.get_commit_comparison("HEAD", "origin/" + plugin.branch if plugin.branch else "origin")
		var is_commit_behind = !!ahead_behind[1] if ahead_behind.size() == 2 else false
		if is_commit_behind:
			logger.info("%s %d commits behind, update required" % [plugin.name, ahead_behind[1]])
			should_pull = true
		else:
			logger.info("%s up to date" % plugin.name)

	if changes:
		logger.info("%s changed %s" % [plugin.name, changes])
		should_reinstall = true
		if "url" in changes or "branch" in changes or "tag" in changes or "commit" in changes:
			logger.info("%s repository setting changed, update required" % plugin.name)
			should_clone = true

	if not checking:
		if should_clone:
			logger.info("%s cloning from %s..." % [plugin.name, plugin.url])
			var test = !!OS.get_environment(ENV_TEST)
			uninstall(get_installed_plugin(plugin.name))
			directory_delete_recursively(plugin.plug_dir, {"exclude": [DEFAULT_CONFIG_PATH], "test": test})
			if downlaod(plugin) == OK:
				install(plugin)
		elif should_pull:
			logger.info("%s pulling updates from %s..." % [plugin.name, plugin.url])
			uninstall(get_installed_plugin(plugin.name))
			if git.pull().exit == OK:
				install(plugin)
		elif should_reinstall:
			logger.info("%s reinstalling..." % plugin.name)
			uninstall(get_installed_plugin(plugin.name))
			install(plugin)

func check_plugin(plugin):
	update_plugin(plugin, true)

func downlaod(plugin):
	logger.info("Downloading %s from %s..." % [plugin.name, plugin.url])
	var test = !!OS.get_environment(ENV_TEST)
	var global_dest_dir = ProjectSettings.globalize_path(plugin.plug_dir)
	if project_dir.dir_exists(plugin.plug_dir):
		directory_delete_recursively(plugin.plug_dir)
	project_dir.make_dir(plugin.plug_dir)
	var result = _GitExecutable.new(global_dest_dir, logger).clone(plugin.url, global_dest_dir, {"branch": plugin.branch, "tag": plugin.tag, "commit": plugin.commit})
	if result.exit == OK:
		logger.info("Successfully download %s" % [plugin.name])
	else:
		logger.info("Failed to download %s" % plugin.name)
		# Make sure plug_dir is clean when failed
		directory_delete_recursively(plugin.plug_dir, {"exclude": [DEFAULT_CONFIG_PATH], "test": test})
	project_dir.remove(plugin.plug_dir) # Remove empty directory
	return result.exit

func install(plugin):
	var include = plugin.get("include", [])
	if include.empty(): # Auto include "addons/" folder if not explicitly specified
		include = ["addons/"]
	if not OS.get_environment(ENV_FORCE) and not OS.get_environment(ENV_TEST):
		var is_exists = false
		var dest_files = directory_copy_recursively(plugin.plug_dir, "res://" + plugin.install_root, {"include": include, "exclude": plugin.exclude, "test": true, "silent_test": true})
		for dest_file in dest_files:
			if project_dir.file_exists(dest_file):
				logger.warn("%s attempting to overwrite file %s" % [plugin.name, dest_file])
				is_exists = true
		if is_exists:
			logger.warn("Installation of %s terminated to avoid overwriting user files, you may disable safe mode with command \"force\"" % plugin.name)
			return ERR_ALREADY_EXISTS

	logger.info("Installing files for %s..." % plugin.name)
	var test = !!OS.get_environment(ENV_TEST)
	var dest_files = directory_copy_recursively(plugin.plug_dir, "res://" + plugin.install_root, {"include": include, "exclude": plugin.exclude, "test": test})
	plugin.dest_files = dest_files
	logger.info("Installed %d file%s for %s" % [dest_files.size(), "s" if dest_files.size() > 1 else "", plugin.name])
	if plugin.name != "gd-plug":
		set_installed_plugin(plugin)
	if plugin.on_updated:
		if has_method(plugin.on_updated):
			logger.info("Execute post-update function for %s: %s" % [plugin.name, plugin.do])
			_on_updated(plugin)
			call(plugin.on_updated, plugin.duplicate())
			emit_signal("updated", plugin)
	return OK

func uninstall(plugin):
	var test = !!OS.get_environment(ENV_TEST)
	var keep_import_file = !!OS.get_environment(ENV_KEEP_IMPORT_FILE)
	var keep_import_resource_file = !!OS.get_environment(ENV_KEEP_IMPORT_RESOURCE_FILE)
	var dest_files = plugin.get("dest_files", [])
	logger.info("Uninstalling %d file%s for %s..." % [dest_files.size(), "s" if dest_files.size() > 1 else "",plugin.name])
	directory_remove_batch(dest_files, {"test": test, "keep_import_file": keep_import_file, "keep_import_resource_file": keep_import_resource_file})
	logger.info("Uninstalled %d file%s for %s" % [dest_files.size(), "s" if dest_files.size() > 1 else "",plugin.name])
	remove_installed_plugin(plugin.name)

func is_plugin_downloaded(plugin):
	if not project_dir.dir_exists(plugin.plug_dir + "/.git"):
		return

	var git = _GitExecutable.new(ProjectSettings.globalize_path(plugin.plug_dir), logger)
	return git.is_up_to_date(plugin)

# Get installed plugin, thread safe
func get_installed_plugin(plugin_name):
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	_mutex.lock()
	var installed_plugin = _installed_plugins[plugin_name]
	_mutex.unlock()
	return installed_plugin

# Set installed plugin, thread safe
func set_installed_plugin(plugin):
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	_mutex.lock()
	_installed_plugins[plugin.name] = plugin
	_mutex.unlock()

# Remove installed plugin, thread safe
func remove_installed_plugin(plugin_name):
	assert(_installed_plugins != null, MSG_PLUG_START_ASSERTION)
	_mutex.lock()
	var result = _installed_plugins.erase(plugin_name)
	_mutex.unlock()
	return result

func directory_copy_recursively(from, to, args={}):
	var include = args.get("include", [])
	var exclude = args.get("exclude", [])
	var test = args.get("test", false)
	var silent_test = args.get("silent_test", false)
	var dir = Directory.new()
	var dest_files = []
	if dir.open(from) == OK:
		dir.list_dir_begin(true, true)
		var file_name = dir.get_next()
		while not file_name.empty():
			var source = dir.get_current_dir() + ("/" if dir.get_current_dir() != "res://" else "") + file_name
			var dest = to + ("/" if to != "res://" else "") + file_name
			
			if dir.current_is_dir():
				dest_files += directory_copy_recursively(source, dest, args)
			else:
				for include_key in include:
					if include_key in source:
						var is_excluded = false
						for exclude_key in exclude:
							if exclude_key in source:
								is_excluded = true
								break
						if not is_excluded:
							if test:
								if not silent_test: logger.warn("[TEST] Writing to %s" % dest)
							else:
								dir.make_dir_recursive(to)
								if dir.copy(source, dest) == OK:
									logger.debug("Copy from %s to %s" % [source, dest])
							dest_files.append(dest)
						break
			file_name = dir.get_next()
		dir.list_dir_end()
	else:
		logger.error("Failed to access path: %s" % from)
	
	return dest_files

func directory_delete_recursively(dir_path, args={}):
	var remove_empty_directory = args.get("remove_empty_directory", true)
	var exclude = args.get("exclude", [])
	var test = args.get("test", false)
	var silent_test = args.get("silent_test", false)
	var dir = Directory.new()
	if dir.open(dir_path) == OK:
		dir.list_dir_begin(true, false)
		var file_name = dir.get_next()
		while not file_name.empty():
			var source = dir.get_current_dir() + ("/" if dir.get_current_dir() != "res://" else "") + file_name
			
			if dir.current_is_dir():
				var sub_dir = directory_delete_recursively(source, args)
				if remove_empty_directory:
					if test:
						if not silent_test: logger.warn("[TEST] Remove empty directory: %s" % sub_dir.get_current_dir())
					else:
						if source.get_file() == ".git":
							# Hacks to remove .git, as git pack files stop it from being removed
							# See https://stackoverflow.com/questions/1213430/how-to-fully-delete-a-git-repository-created-with-init
							if OS.execute("rm", ["-rf", ProjectSettings.globalize_path(source)]) == OK:
								logger.debug("Remove empty directory: %s" % sub_dir.get_current_dir())
						else:
							if dir.remove(sub_dir.get_current_dir()) == OK:
								logger.debug("Remove empty directory: %s" % sub_dir.get_current_dir())
			else:
				var excluded = false
				for exclude_key in exclude:
					if source in exclude_key:
						excluded = true
						break
				if not excluded:
					if test:
						if not silent_test: logger.warn("[TEST] Remove file: %s" % source)
					else:
						if dir.remove(file_name) == OK:
							logger.debug("Remove file: %s" % source)
			file_name = dir.get_next()
		dir.list_dir_end()
	else:
		logger.error("Failed to access path: %s" % dir_path)

	if remove_empty_directory:
		dir.remove(dir.get_current_dir())

	return dir

func directory_remove_batch(files, args={}):
	var remove_empty_directory = args.get("remove_empty_directory", true)
	var keep_import_file = args.get("keep_import_file", false)
	var keep_import_resource_file = args.get("keep_import_resource_file", false)
	var test = args.get("test", false)
	var silent_test = args.get("silent_test", false)
	var dirs = {}
	for file in files:
		var file_dir = file.get_base_dir()
		var file_name =file.get_file()
		var dir = dirs.get(file_dir)
		
		if not dir:
			dir = Directory.new()
			dir.open(file_dir)
			dirs[file_dir] = dir

		if file.ends_with(".import"):
			if not keep_import_file:
				_remove_import_file(dir, file, keep_import_resource_file, test, silent_test)
		else:
			if test:
				if not silent_test: logger.warn("[TEST] Remove file: " + file)
			else:
				if dir.remove(file_name) == OK:
					logger.debug("Remove file: " + file)
			if not keep_import_file:
				_remove_import_file(dir, file + ".import", keep_import_resource_file, test, silent_test)
		
	for dir in dirs.values():
		var slash_count = dir.get_current_dir().count("/") - 2 # Deduct 2 slash from "res://"
		if test:
			if not silent_test: logger.warn("[TEST] Remove empty directory: %s" % dir.get_current_dir())
		else:
			if dir.remove(dir.get_current_dir()) == OK:
				logger.debug("Remove empty directory: %s" % dir.get_current_dir())
		# Dumb method to clean empty ancestor directories
		logger.debug("Removing emoty ancestor directory for %s..." % dir.get_current_dir())
		var current_dir = dir.get_current_dir()
		for i in slash_count:
			current_dir = current_dir.get_base_dir()
			var d = Directory.new()
			if d.open(current_dir) == OK:
				if test:
					if not silent_test: logger.warn("[TEST] Remove empty ancestor directory: %s" % d.get_current_dir())
				else:
					if d.remove(d.get_current_dir()) == OK:
						logger.debug("Remove empty ancestor directory: %s" % d.get_current_dir())

func _remove_import_file(dir, file, keep_import_resource_file=false, test=false, silent_test=false):
	if not dir.file_exists(file):
		return

	if not keep_import_resource_file:
		var import_config = ConfigFile.new()
		if import_config.load(file) == OK:
			var metadata = import_config.get_value("remap", "metadata", {})
			var imported_formats = metadata.get("imported_formats", [])
			if imported_formats:
				for format in imported_formats:
					_remove_import_resource_file(dir, import_config, "." + format, test)
			else:
				_remove_import_resource_file(dir, import_config, "", test)
	if test:
		if not silent_test: logger.warn("[TEST] Remove import file: " + file)
	else:
		if dir.remove(file) == OK:
			logger.debug("Remove import file: " + file)
		else:
			# TODO: Sometimes Directory.remove() unable to remove random .import file and return error code 1(Generic Error)
			# Maybe enforce the removal from shell?
			logger.warn("Failed to remove import file: " + file)

func _remove_import_resource_file(dir, import_config, import_format="", test=false):
	var import_resource_file = import_config.get_value("remap", "path" + import_format, "")
	var checksum_file = import_resource_file.trim_suffix("." + import_resource_file.get_extension()) + ".md5" if import_resource_file else ""
	if import_resource_file:
		if dir.file_exists(import_resource_file):
			if test:
				logger.info("[IMPORT] Remove import resource file: " + import_resource_file)
			else:
				if dir.remove(import_resource_file) == OK:
					logger.debug("Remove import resource file: " + import_resource_file)
	if checksum_file:
		checksum_file = checksum_file.replace(import_format, "")
		if dir.file_exists(checksum_file):
			if test:
				logger.info("[IMPORT] Remove import checksum file: " + checksum_file)
			else:
				if dir.remove(checksum_file) == OK:
					logger.debug("Remove import checksum file: " + checksum_file)

func compare_plugins(p1, p2):
	var changed_keys = []
	for key in p1.keys():
		var v1 = p1[key]
		var v2 = p2[key]
		if v1 != v2:
			changed_keys.append(key)
	return changed_keys

func get_plugin_name_from_repo(repo):
	repo = repo.replace(".git", "").trim_suffix("/")
	return repo.get_file()

func validate_var_type(obj, var_name, type, type_string):
	var value = obj.get(var_name)
	var is_valid = typeof(value) == type
	if not is_valid:
		logger.error("Expected variable \"%s\" to be %s, given %s" % [var_name, type_string, value])
	return is_valid

const INIT_PLUG_SCRIPT = \
"""extends "res://addons/gd-plug/plug.gd"

func _plugging():
	# Declare plugins with plug(repo, args)
	# For example, clone from github repo("user/repo_name")
	# plug("imjp94/gd-YAFSM") # By default, gd-plug will only install anything from "addons/" directory
	# Or you can explicitly specify which file/directory to include
	# plug("imjp94/gd-YAFSM", {"include": ["addons/"]}) # By default, gd-plug will only install anything from "addons/" directory
	pass
"""

class _GitExecutable extends Reference:
	var cwd = ""
	var logger

	func _init(p_cwd, p_logger):
		cwd = p_cwd
		logger = p_logger

	func _execute(command, blocking=true, output=[], read_stderr=false):
		var cmd = "cd %s && %s" % [cwd, command]
		# NOTE: OS.execute() seems to ignore read_stderr
		var exit = FAILED
		match OS.get_name():
			"Windows":
				cmd = cmd if read_stderr else "%s 2> nul" % cmd
				logger.debug("Execute \"%s\"" % cmd)
				exit = OS.execute("cmd", ["/C", cmd], blocking, output, read_stderr)
			"X11", "OSX", "Server":
				cmd if read_stderr else "%s 2>/dev/null" % cmd
				logger.debug("Execute \"%s\"" % cmd)
				exit = OS.execute("bash", ["-c", cmd], blocking, output, read_stderr)
			var unhandled_os:
				logger.error("Unexpected OS: %s" % unhandled_os)
		logger.debug("Execution ended(code:%d): %s" % [exit, output])
		return exit

	func init():
		logger.debug("Initializing git at %s..." % cwd)
		var output = []
		var exit = _execute("git init", true, output)
		logger.debug("Successfully init" if exit == OK else "Failed to init")
		return {"exit": exit, "output": output}

	func clone(src, dest, args={}):
		logger.debug("Cloning from %s to %s..." % [src, dest])
		var output = []
		var branch = args.get("branch", "")
		var tag = args.get("tag", "")
		var commit = args.get("commit", "")
		var command = "git clone --depth=1 --progress %s %s" % [src, dest]
		if branch or tag:
			command = "git clone --depth=1 --single-branch --branch %s %s %s" % [branch if branch else tag, src, dest]
		elif commit:
			return clone_commit(src, dest, commit)
		var exit = _execute(command, true, output)
		logger.debug("Successfully cloned from %s" % src if exit == OK else "Failed to clone from %s" % src)
		return {"exit": exit, "output": output}

	func clone_commit(src, dest, commit):
		var output = []
		if commit.length() < 40:
			logger.error("Expected full length 40 digits commit-hash to clone specific commit, given {%s}" % commit)
			return {"exit": FAILED, "output": output}

		logger.debug("Cloning from %s to %s @ %s..." % [src, dest, commit])
		var result = init()
		if result.exit == OK:
			result = remote_add("origin", src)
			if result.exit == OK:
				result = fetch("%s %s" % ["origin", commit])
				if result.exit == OK:
					result = reset("--hard", "FETCH_HEAD")
		return result

	func fetch(rm="--all"):
		logger.debug("Fetching %s..." % rm.replace("--", ""))
		var output = []
		var exit = _execute("git fetch %s" % rm, true, output)
		logger.debug("Successfully fetched" if exit == OK else "Failed to fetch")
		return {"exit": exit, "output": output}

	func pull():
		logger.debug("Pulling...")
		var output = []
		var exit = _execute("git pull --rebase", true, output)
		logger.debug("Successfully pulled" if exit == OK else "Failed to pull")
		return {"exit": exit, "output": output}

	func remote_add(name, src):
		logger.debug("Adding remote %s@%s..." % [name, src])
		var output = []
		var exit = _execute("git remote add %s %s" % [name, src], true, output)
		logger.debug("Successfully added remote" if exit == OK else "Failed to add remote")
		return {"exit": exit, "output": output}

	func reset(mode, to):
		logger.debug("Resetting %s %s..." % [mode, to])
		var output = []
		var exit = _execute("git reset %s %s" % [mode, to], true, output)
		logger.debug("Successfully reset" if exit == OK else "Failed to reset")
		return {"exit": exit, "output": output}

	func get_commit_comparison(branch_a, branch_b):
		var output = []
		var exit = _execute("git rev-list --count --left-right %s...%s" % [branch_a, branch_b], true, output)
		var raw_ahead_behind = output[0].split("\t")
		var ahead_behind = []
		for msg in raw_ahead_behind:
			ahead_behind.append(int(msg))
		return ahead_behind if exit == OK else []

	func get_current_branch():
		var output = []
		var exit = _execute("git rev-parse --abbrev-ref HEAD", true, output)
		return output[0] if exit == OK else ""

	func get_current_tag():
		var output = []
		var exit = _execute("git describe --tags --exact-match", true, output)
		return output[0] if exit == OK else ""

	func get_current_commit():
		var output = []
		var exit = _execute("git rev-parse --short HEAD", true, output)
		return output[0] if exit == OK else ""

	func is_detached_head():
		var output = []
		var exit = _execute("git rev-parse --short HEAD", true, output)
		return (!!output[0]) if exit == OK else true

	func is_up_to_date(args={}):
		if fetch().exit == OK:
			var branch = args.get("branch", "")
			var tag = args.get("tag", "")
			var commit = args.get("commit", "")
	
			if branch:
				if branch == get_current_branch():
					return FAILED if is_detached_head() else OK
			elif tag:
				if tag == get_current_tag():
					return OK
			elif commit:
				if commit == get_current_commit():
					return OK
	
			var ahead_behind = get_commit_comparison("HEAD", "origin")
			var is_commit_behind = !!ahead_behind[1] if ahead_behind.size() == 2 else false
			return FAILED if is_commit_behind else OK
		return FAILED

class _ThreadPool extends Reference:
	signal all_thread_finished()

	var _threads = []
	var _finished_threads = []
	var _mutex = Mutex.new()
	var _tasks = []
	var logger

	func _init(p_logger):
		logger = p_logger
		_threads.resize(OS.get_processor_count())

	func _execute_task(task):
		var thread = _get_thread()
		var can_execute = thread
		if can_execute:
			task.thread = weakref(thread)
			thread.start(self, "_execute", task, task.priority)
			logger.debug("Execute task %s.%s() " % [task.instance, task.method])
		return can_execute

	func _execute(args):
		args.instance.call(args.method, args.userdata)
		_mutex.lock()
		var thread = args.thread.get_ref()
		_threads[_threads.find(thread)] = null
		_finished_threads.append(thread)
		var all_finished = is_all_thread_finished()
		_mutex.unlock()

		logger.debug("Execution finished %s.%s() " % [args.instance, args.method])
		if all_finished:
			logger.debug("All thread finished")
			emit_signal("all_thread_finished")

	func _flush_tasks():
		if not _tasks:
			return

		var executed = true
		while executed:
			var task = _tasks.pop_front()
			if task != null:
				executed = _execute_task(task)
				if not executed:
					_tasks.push_front(task)
			else:
				executed = false

	func _flush_threads():
		for i in _finished_threads.size():
			var thread = _finished_threads.pop_front()
			thread.wait_to_finish()

	func enqueue_task(instance, method, userdata=null, priority=1):
		enqueue({"instance": instance, "method": method, "userdata": userdata, "priority": priority})

	func enqueue(task):
		var can_execute = _execute_task(task)
		if not can_execute:
			_tasks.append(task)

	func process(delta):
		_flush_tasks()
		_flush_threads()

	func _get_thread():
		var thread
		for i in OS.get_processor_count():
			var t = _threads[i]
			if t:
				if not t.is_active():
					thread = t
					break
			else:
				thread = Thread.new()
				_threads[i] = thread
				break
		return thread

	func is_all_thread_finished():
		for i in _threads.size():
			if _threads[i]:
				return false
		return true

	func is_all_task_finished():
		for i in _tasks.size():
			if _tasks[i]:
				return false
		return true

class _Logger extends Reference:
	enum LogLevel {
		ALL, DEBUG, INFO, WARN, ERROR, NONE
	}
	const DEFAULT_LOG_FORMAT_DETAIL = "[{time}] [{level}] {msg}"
	const DEFAULT_LOG_FORMAT_NORMAL = "{msg}"
	
	var log_level = LogLevel.INFO
	var log_format = DEFAULT_LOG_FORMAT_NORMAL
	var log_time_format = "{year}/{month}/{day} {hour}:{minute}:{second}"

	func debug(msg, raw=false):
		_log(LogLevel.DEBUG, msg, raw)

	func info(msg, raw=false):
		_log(LogLevel.INFO, msg, raw)

	func warn(msg, raw=false):
		_log(LogLevel.WARN, msg, raw)

	func error(msg, raw=false):
		_log(LogLevel.ERROR, msg, raw)

	func _log(level, msg, raw=false):
		if log_level <= level:
			if raw:
				printraw(format_log(level, msg))
			else:
				print(format_log(level, msg))

	func format_log(level, msg):
		return log_format.format({
			"time": log_time_format.format(get_formatted_datatime()),
			"level": LogLevel.keys()[level],
			"msg": msg
		})

	func get_formatted_datatime():
		var datetime = OS.get_datetime()
		datetime.year = "%04d" % datetime.year
		datetime.month = "%02d" % datetime.month
		datetime.day = "%02d" % datetime.day
		datetime.hour = "%02d" % datetime.hour
		datetime.minute = "%02d" % datetime.minute
		datetime.second = "%02d" % datetime.second
		return datetime
