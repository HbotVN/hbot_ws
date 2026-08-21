#!/bin/bash
# Launches SLAM Toolbox mapping mode via hbot_bringup and logs all output to
# ~/hbot_ws/log/mapping_<datetime>.log
#
# Usage: start_mapping.sh <use_sim_time: True|False>
set -e

USE_SIM_TIME="${1:-False}"

LOG_DIR="$HOME/hbot_ws/log"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/mapping_$(date +%Y%m%d_%H%M%S).log"

exec ros2 launch hbot_bringup hbot_bringup.launch.py \
    slam:=True enable_navigation:=False use_sim_time:="$USE_SIM_TIME" \
    > "$LOG_FILE" 2>&1
