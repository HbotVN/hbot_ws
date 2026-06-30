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
		--cmake-args -DPython3_EXECUTABLE=/usr/bin/python3
else
	colcon --log-base log_pi build \
		--build-base build_pi \
		--install-base install_pi \
		--packages-select "$@" \
		--cmake-args -DPython3_EXECUTABLE=/usr/bin/python3
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
