#!/bin/bash

set -e

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$workspace_dir"

# Source ROS 2 if this shell doesn't already have it (e.g. `docker exec` into a
# container bypasses the image's ENTRYPOINT, so ROS_DISTRO/AMENT_PREFIX_PATH
# etc. are never set - source it ourselves instead of failing deep inside CMake).
if [ -z "$AMENT_PREFIX_PATH" ]; then
	ros_setup="/opt/ros/humble/setup.bash"
	if [ -f "$ros_setup" ]; then
		echo "ROS 2 environment not sourced in this shell - sourcing $ros_setup"
		# shellcheck disable=SC1090
		source "$ros_setup"
	else
		echo "Error: ROS 2 environment not found (expected $ros_setup) and none is sourced." >&2
		echo "Source your ROS 2 setup.bash first, or run this inside a container that has ROS 2 Humble installed." >&2
		exit 1
	fi
fi

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
unset PYTHONHOME PYTHONPATH
export PYTHON_EXECUTABLE="/usr/bin/python3"
export COLCON_PYTHON_EXECUTABLE="/usr/bin/python3"

python_version="$($PYTHON_EXECUTABLE -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
ros_python_path="/opt/ros/humble/lib/python${python_version}/site-packages"
ros_python_local_path="/opt/ros/humble/local/lib/python${python_version}/dist-packages"

if [ -d "$ros_python_path" ]; then
	export PYTHONPATH="$ros_python_path"
fi

if [ -d "$ros_python_local_path" ]; then
	export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$ros_python_local_path"
fi


# get all args to string
# example "arg1 arg2 arg3"
args_str="${@}"

echo "Number of args: $#"

# build packages
echo "Building package(s): $args_str"

if [ $# -eq 0 ]; then
	colcon build --symlink-install --cmake-args -DPython3_EXECUTABLE=/usr/bin/python3 -DCMAKE_BUILD_TYPE=Release
else
	colcon build --symlink-install --packages-select "$@" --cmake-args -DPython3_EXECUTABLE=/usr/bin/python3 -DCMAKE_BUILD_TYPE=Release
fi


