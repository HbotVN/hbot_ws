# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

`hbot_ws` is a ROS 2 (Humble) colcon workspace for the HBOT differential-drive AMR (autonomous mobile robot) built on a Yahboom Rosmaster board. The top-level repo holds build/bringup scripts, Docker recipes, and docs; almost all robot packages under `src/` are **git submodules** pointing to separate `HbotVN/*` repos (see `.gitmodules`). The only package that lives directly in this repo (not a submodule) is `src/hbot_web`, the Flask/SocketIO web dashboard.

Because packages are submodules, changes to robot behavior (driver, bringup launch files, navigation params, description/URDF, simulation) usually happen inside `src/<package>` and must be committed/pushed in that submodule's own repo, not just here. Submodule checkouts may be empty until `git submodule update --init --recursive` is run.

## Build Commands

Two parallel build pipelines exist: one for local/laptop development, one producing self-contained artifacts for the Raspberry Pi.

```bash
# Laptop/dev build (symlink install, into build/ install/ log/) — run directly on the host
./build_packages.sh                          # build everything
./build_packages.sh hbot_description hbot_driver_yahboom hbot_bringup   # build specific packages
```

`build_packages_pi.sh` (arm64 build into `build_pi/ install_pi/ log_pi/`, ignores `hbot_simulation`) is **not** meant to be run directly on the host — it only runs inside the `docker/pi` container, invoked automatically by `docker compose up` there (see Docker Workflows below).

Both scripts force the system Python (`/usr/bin/python3`) instead of any active Conda/venv Python to avoid `colcon`/ROS conflicts — if a prior build was done under Conda Python, delete `build/`, `install/`, `log/` before rebuilding.

## Running

```bash
# Simulation + SLAM
./bringup.sh simulation_mode:=True use_sim_time:=True slam:=True enable_navigation:=True run_rviz:=True

# Real robot + SLAM
./bringup.sh simulation_mode:=False use_sim_time:=False slam:=True enable_navigation:=True run_rviz:=True

# Localization mode (requires a valid map YAML; slam:=False never supplies a sample map)
./bringup.sh simulation_mode:=True use_sim_time:=True slam:=False enable_navigation:=True map:=/absolute/path/to/map.yaml run_rviz:=True
```

`scripts/bringup.sh` sources `install/setup.bash` and wraps `ros2 launch hbot_bringup hbot_bringup.launch.py`, defaulting `ROS_DOMAIN_ID=9` and `CONTROLLER=yahboom` if unset.

`scripts/web_bringup.sh` launches `hbot_bringup base_bringup.launch.py` (driver + web dashboard) and logs to `log/web_bringup.log`; this is what `hbot_web.service` (systemd unit) runs on the Pi.

Baseline acceptance for any bringup change (see `PHASE0_RUNBOOK.md`): `robot_state_publisher`, lidar, Nav2, and SLAM/localization all start without crashing; `/tf`, `/odom`, `/scan`, `/cmd_vel` carry data appropriate to the mode; the robot can traverse 5 consecutive waypoints in sim; on real hardware, odometry doesn't drift abnormally over a short teleop run.

## Docker Workflows

- `docker/laptop/` — GPU/X11-forwarding container for running simulation + SLAM + Nav2 + RViz on a dev laptop (`docker compose build && docker compose up`, override with `SLAM=False`/`RUN_RVIZ=False` env vars). See `docker/laptop/README.md`.
- `docker/pi/` — cross-compiles arm64 packages via QEMU into `install_pi/` on the host (`docker compose up` runs `build_packages_pi.sh` inside the container). See `docker/pi/README.md`.
- `docs/dev_guide.md` — manual (non-compose) Docker workflow for iterative ARM64 builds using a long-lived named container (`hbot_builder`).

## Deploying to the Pi

```bash
./sync_to_pi.sh [PI_USER] [PI_HOST] [PI_DEST]   # rsyncs install_pi/ and scripts/ to the robot (defaults: root hbot.local /root/hbot_ws)
```

Requires `install_pi/` to already exist (build it with `docker/pi` first). After syncing, the driver + web dashboard normally run as the `hbot_web.service` systemd unit on the Pi (`ExecStart=/root/hbot_ws/scripts/web_bringup.sh`), or manually via `nohup ./scripts/web_bringup.sh &`.

## Architecture

### Package roles (under `src/`, all submodules unless noted)

- **hbot_bringup** — central orchestration package. `hbot_bringup.launch.py` is the main entry point handling sim-vs-real, mapping vs. localization, and navigation args; `base_bringup.launch.py` launches just the driver + web dashboard (used on the Pi in production). `config/` holds `nav2_params.yaml`, `slam_params.yaml`, `yahboom_driver_params.yaml`.
- **hbot_description** — robot URDF/Xacro (`hbot.urdf.xacro`); `CMakeLists.txt` compiles it to `hbot.urdf` and exports a Gazebo-compatible `hbot.sdf`.
- **hbot_driver** — hardware interface. Subscribes to `/cmd_vel`, drives the Yahboom Rosmaster board over serial (via the bundled `Rosmaster_Lib`), publishes odometry, battery, and optional IMU data. Currently mid-port from Python to C++ (see recent commits / `feat/cpp_driver` branch).
- **hbot_simulation** — Gazebo world + spawn launch (`hbot_house.launch.py`, `hbot_house.world`). Excluded from Pi builds.
- **lds_006_driver** — LDS-006 LiDAR serial driver node, publishes `sensor_msgs/LaserScan` on `/scan`.
- **navigation2**, **slam_toolbox**, **robot_localization** — forked/customized versions of the standard Nav2, SLAM Toolbox, and EKF localization stacks (see `.gitmodules` for the specific forks/branches in use).
- **hbot_web** (not a submodule, lives directly in this repo) — Flask-SocketIO dashboard (`web_node.py`): publishes `/cmd_vel` for teleop, subscribes to odometry/battery/scan/map topics, serves a joystick + telemetry + map UI, manages saved maps in a local SQLite DB (`hbot_maps.db`), and shells out to `nmcli` for WiFi AP/STA management. Frontend is `templates/index.html` + `static/js/main.js` + `static/css/style.css` (canvas joystick, Socket.IO bindings, WiFi modals).

### Operational mode matrix

`bringup.sh` fans out on two independent flags:
- `simulation_mode` — Gazebo sim vs. real Yahboom hardware + physical LiDAR.
- `slam` — live SLAM/map-building vs. Nav2 AMCL-style localization against a pre-built `map:=...yaml`.

### Robot kinematics (from `hbot_description` + `yahboom_driver_params.yaml`)

Differential drive; body 0.17×0.14×0.12 m; wheel diameter 0.065 m, track width 0.17 m; encoders 11 PPR × 56:1 gear ratio × 4 = 2464 ticks/rev; LiDAR mounted 0.075 m above base center, yawed 180° (`rpy="0 0 3.14"`).

### Networking

ROS 2 DDS communication defaults to `ROS_DOMAIN_ID=9` and `CONTROLLER=yahboom` everywhere (bringup scripts, systemd unit, Docker compose) — keep these consistent when adding new entry points or containers.

## Agent Workflow Convention

This workspace maintains an `agent/` folder with planning artifacts for AI coding assistants: `agent/workspace_overview.md` (architecture breakdown) and `agent/walkthrough.md` (running log of implemented changes). When making a non-trivial implementation change, update/append to `agent/walkthrough.md` and keep `agent/workspace_overview.md` in sync, using relative markdown links to touched files.
