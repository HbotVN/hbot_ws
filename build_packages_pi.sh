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
		echo "This script is meant to run inside the docker/pi cross-compile container - see docker/pi/README.md." >&2
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

# Get all args to string
args_str="${@}"

echo "Number of args: $#"
echo "Building package(s) for Raspberry Pi: $args_str"

# We must ensure build_pi, install_pi, and log_pi are created
mkdir -p build_pi install_pi log_pi

# Build packages to build_pi, install_pi, log_pi directories
# DO NOT use --symlink-install so that build outputs are fully self-contained and syncable
if [ $# -eq 0 ]; then
	colcon --log-base log_pi build \
		--build-base build_pi \
		--install-base install_pi \
		--packages-ignore hbot_simulation \
		--cmake-args -DPython3_EXECUTABLE=/usr/bin/python3 -DBUILD_TESTING=OFF -DCMAKE_BUILD_TYPE=Release
else
	colcon --log-base log_pi build \
		--build-base build_pi \
		--install-base install_pi \
		--packages-select "$@" \
		--cmake-args -DPython3_EXECUTABLE=/usr/bin/python3 -DBUILD_TESTING=OFF -DCMAKE_BUILD_TYPE=Release
fi

# Fix file ownership on host if running as root inside Docker
if [ "$(id -u)" -eq 0 ]; then
	echo "Running as root. Adjusting permissions of build_pi, install_pi, and log_pi to match host user..."
	# Get owner of src directory which was mounted from host
	host_uid=$(stat -c '%u' "$workspace_dir/src")
	host_gid=$(stat -c '%g' "$workspace_dir/src")
	
	chown -R "$host_uid:$host_gid" build_pi install_pi log_pi
	echo "Permissions updated successfully."
fi
