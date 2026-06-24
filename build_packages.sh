#!/bin/bash

set -e

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$workspace_dir"

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
	colcon build --symlink-install --cmake-args -DPython3_EXECUTABLE=/usr/bin/python3
else
	colcon build --symlink-install --packages-select "$@" --cmake-args -DPython3_EXECUTABLE=/usr/bin/python3
fi


