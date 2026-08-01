#!/bin/bash

set -e

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
ros_prefix="/opt/ros/humble"

export ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-9}"
export CONTROLLER="${CONTROLLER:-yahboom}"
export PATH="$ros_prefix/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export AMENT_PREFIX_PATH="${AMENT_PREFIX_PATH:+$AMENT_PREFIX_PATH:}$ros_prefix"
export CMAKE_PREFIX_PATH="${CMAKE_PREFIX_PATH:+$CMAKE_PREFIX_PATH:}$ros_prefix"

python_version="$(/usr/bin/python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
ros_python_path="$ros_prefix/lib/python${python_version}/site-packages"
ros_python_local_path="$ros_prefix/local/lib/python${python_version}/dist-packages"

if [ -d "$ros_python_path" ]; then
	export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$ros_python_path"
fi

if [ -d "$ros_python_local_path" ]; then
	export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$ros_python_local_path"
fi

if [ -f "$ros_prefix/setup.bash" ]; then
	source "$ros_prefix/setup.bash"
fi
source "$workspace_dir/install/setup.bash"

# Ensure the log directory exists
mkdir -p "$workspace_dir/log"

echo "Starting hbot_driver and hbot_web..."
ros2 launch hbot_bringup base_bringup.launch.py > "$workspace_dir/log/web_bringup.log" 2>&1

