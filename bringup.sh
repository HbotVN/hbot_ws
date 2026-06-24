#!/bin/bash

set -e

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ros_prefix="/opt/ros/humble"

export ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-9}"
export CONTROLLER="${CONTROLLER:-yahboom}"
export PATH="$ros_prefix/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export AMENT_PREFIX_PATH="${AMENT_PREFIX_PATH:+$AMENT_PREFIX_PATH:}$ros_prefix"
export CMAKE_PREFIX_PATH="${CMAKE_PREFIX_PATH:+$CMAKE_PREFIX_PATH:}$ros_prefix"

python_version="$(/usr/bin/python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
ros_python_path="$ros_prefix/lib/python${python_version}/site-packages"

if [ -d "$ros_python_path" ]; then
	export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$ros_python_path"
fi

source "$workspace_dir/install/setup.bash"

ros2 launch hbot_bringup hbot_bringup.launch.py "$@"

