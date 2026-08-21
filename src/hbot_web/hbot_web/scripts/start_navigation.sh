#!/bin/bash
# Launches Nav2 navigation mode against a saved map via hbot_bringup and logs
# all output to ~/hbot_ws/log/navigation_<datetime>.log
#
# Usage: start_navigation.sh <use_sim_time: True|False> <map_yaml_path>
set -e

USE_SIM_TIME="${1:-False}"
MAP_YAML="$2"

if [ -z "$MAP_YAML" ]; then
    echo "Usage: $0 <use_sim_time> <map_yaml_path>" >&2
    exit 1
fi

LOG_DIR="$HOME/hbot_ws/log"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/navigation_$(date +%Y%m%d_%H%M%S).log"

exec ros2 launch hbot_bringup hbot_bringup.launch.py \
    slam:=False enable_navigation:=True map:="$MAP_YAML" use_sim_time:="$USE_SIM_TIME" \
    > "$LOG_FILE" 2>&1
