# Walkthrough - Docker Compose Configuration

The implementation of Docker Compose for running the HBOT simulation, SLAM, and Nav2 navigation stack is complete.

---

## 🛠️ Changes Implemented

### 🐳 Docker Configuration

1. **[Dockerfile](file:///home/huy/Documents/03.MyProjects/hbot_ws/docker/laptop/Dockerfile)**
   * Upgraded to copy the workspace metadata (`src` package directories) inside the build context to execute `rosdep update && rosdep install` during the Docker image build phase.
   * This caches all system and ROS dependencies (including navigation, SLAM, and Gazebo plugins) so they do not have to download on every container startup.

2. **[docker-compose.yaml](file:///home/huy/Documents/03.MyProjects/hbot_ws/docker/laptop/docker-compose.yaml)**
   * Created inside the `docker/laptop` folder.
   * Configured for GPU-accelerated X11 forwarding mapping `/dev/dri`, `${XAUTHORITY}`, and `/tmp/.X11-unix`.
   * Set network mode to `host` and IPC mode to `host` for zero-overhead ROS 2 DDS communication.
   * Added parameter configuration through default environment variables (`SIMULATION_MODE`, `SLAM`, `ENABLE_NAVIGATION`, `RUN_RVIZ`).
   * Configured volume mounts for mounting the workspace source files and using isolated anonymous volumes for `build`, `install`, and `log`.

### 📖 Documentation

3. **[README.md](file:///home/huy/Documents/03.MyProjects/hbot_ws/docker/laptop/README.md)**
   * Created inside `docker/laptop` to serve as a user guide.
   * Outlines steps to grant X11 access on the host (`xhost +local:root`), build, run, clean up, and execute commands within the running container.

### 🐛 Bug Fixes

4. **[hbot_description/package.xml](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_description/package.xml) & [hbot_simulation/package.xml](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_simulation/package.xml)**
   * Changed the dependency declaration `<exec_depend>rviz</exec_depend>` to `<exec_depend>rviz2</exec_depend>` in both packages. The older `rviz` key belongs to ROS 1 and could not be resolved by `rosdep` under ROS 2 Humble, which threw build errors.

---

## 🧪 Validation & Verification

1. **Syntax Validation**: We successfully verified the `docker-compose.yaml` syntax by running `docker compose config` inside the `docker/laptop` directory. The configuration parser confirmed the correctness of build context, volumes, X11 variables, and device mappings.
2. **Build Success**: Executed `docker compose build` inside the `./docker/laptop` directory. The image successfully compiled in 187.6 seconds, resolving and installing all system dependencies correctly via `rosdep` and creating the `hbot_laptop:latest` Docker image.
3. **Interactive Debugging**: Configured `ROS_DOMAIN_ID` and `CONTROLLER` as environment variables directly in `docker-compose.yaml`. This ensures that interactive bash shells entered via `docker exec -it` inherit these variables and can immediately see and inspect running nodes (e.g. via `ros2 node list`).

---

## 🚀 Quick Run Guide

To start the simulation on your laptop:

1. **Authorize X11 on the host**:
   ```bash
   xhost +local:root
   ```
2. **Build and start the container**:
   ```bash
   cd docker/laptop
   docker compose build
   docker compose up
   ```
3. **Customize parameters** (optional):
   ```bash
   SLAM=False docker compose up
   ```

---

# Walkthrough: Robot Web Dashboard (hbot_web)

We created and compiled the `hbot_web` ROS 2 package. This package provides a premium, responsive, dark-themed dashboard to drive the robot, monitor hardware telemetry, and manage WiFi modes.

## Created Structure

The new package is fully integrated into the ROS 2 workspace.

- **Package Configuration**:
  - [package.xml](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/package.xml): Declares dependencies on standard ROS 2 messaging/nodes and execution dependencies (`python3-flask`, `python3-flask-socketio`, `python3-psutil`, `python3-eventlet`).
  - [setup.py](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/setup.py) & [setup.cfg](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/setup.cfg): Installs the executable entrypoint `web_node` and packs template/static files.
- **Backend Node**:
  - [web_node.py](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/hbot_web/web_node.py): Runs a multi-threaded Flask-SocketIO server, manages publisher to `/cmd_vel`, subscribers to `/battery/*` topics, gathers hardware statistics, and calls `nmcli` to interface with NetworkManager.
- **Frontend Dashboard**:
  - [index.html](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/hbot_web/templates/index.html): Responsive glassmorphic container layout.
  - [style.css](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/hbot_web/static/css/style.css): Neon theme variables, animations, custom sliders, gauges, and modal styles.
  - [main.js](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/hbot_web/static/js/main.js): Integrates the HTML5 canvas joystick, keyboard mapping, Socket.io data binding, and WiFi connection modals.

---

## Deployment & Verification on Raspberry Pi

Follow these steps to deploy and start the dashboard on your robot:

### Step 1: Sync to Raspberry Pi
Since we have successfully compiled the package using Docker (`linux/arm64`), you can sync the compiled build outputs and scripts to your Pi:
```bash
./sync_to_pi.sh root hbot.local
```

Next, copy the systemd service file from your laptop to the Pi workspace:
```bash
scp hbot_web.service root@hbot.local:/root/hbot_ws/
```

### Step 2: SSH into the Pi
```bash
ssh root@hbot.local
```

### Step 3: Launch Driver & Web Dashboard in the Background

> [!IMPORTANT]
> The node requires `flask`, `flask-socketio`, `psutil`, and `eventlet` in the Python environment where it is run.
> - **If running directly on the Raspberry Pi host (outside Docker)**, make sure to install them first:
>   ```bash
>   sudo apt update && sudo apt install -y python3-flask python3-flask-socketio python3-psutil python3-eventlet
>   ```
> - **If running inside a Docker container on the Pi**, make sure to rebuild the Docker image to include the dependencies we added to [Dockerfile](file:///home/huy/Documents/03.MyProjects/hbot_ws/docker/pi/Dockerfile):
>   ```bash
>   docker compose -f docker/pi/docker-compose.yaml build --no-cache
>   ```

Sourcing the workspace install and launching both `hbot_driver` and `hbot_web` in the background:

#### Option A: Running as a systemd service (Recommended)
A `hbot_web.service` configuration file has been created to handle automatic startup, logging, and restarts on the Pi:
1. **Copy the service file** to the systemd folder:
   ```bash
   sudo cp /root/hbot_ws/hbot_web.service /etc/systemd/system/
   ```
2. **Reload systemd and enable the service** (to run automatically at boot):
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable hbot_web.service
   ```
3. **Start the service**:
   ```bash
   sudo systemctl start hbot_web.service
   ```
4. **Monitor logs live**:
   ```bash
   journalctl -u hbot_web.service -f
   ```
5. **Stop the service**:
   ```bash
   sudo systemctl stop hbot_web.service
   ```

#### Option B: Running via manual background script
Alternatively, launch the script in the background:
```bash
nohup ./scripts/web_bringup.sh > log/web_bringup.log 2>&1 &
```
- To monitor logs live:
  ```bash
  tail -f log/web_bringup.log
  ```
- To stop the background nodes manually:
  ```bash
  pkill -f web_node
  pkill -f hbot_driver
  ```

### Step 4: Access and Test the Dashboard
1. Open a browser and navigate to `http://<pi_ip>` (e.g., `http://192.168.1.100` or `http://hbot.local`).
2. **Teleoperation**: Drive the robot using WASD or touch-dragging the on-screen joystick. Observe the `/cmd_vel` output:
   ```bash
   ros2 topic echo /cmd_vel
   ```
3. **Telemetry**: Check if CPU/RAM/Disk stats are updated. Launch the robot driver (which publishes `/battery/voltage` and `/battery/percent`) and verify the battery widget.
4. **WiFi Management**:
   - Switch between **STA** and **AP** modes using the operation toggle.
   - Scan for surrounding networks, click one, and enter the password to connect.
   - Use the **Refresh** button under Saved Connections to view connections stored in NetworkManager, and test deleting/quick-reconnecting to them.

---

## 🛠️ Troubleshooting

### `AttributeError: can't set attribute 'session'`
If you see this traceback error in the terminal when the web interface connects, there is a package version mismatch (e.g. newer `Flask 3.x` from pip alongside older `Flask-SocketIO` from apt). 

To resolve this conflict and restore web dashboard metrics:
- **If running directly on the Raspberry Pi host (outside Docker)**, run:
  ```bash
  python3 -m pip install --upgrade flask flask-socketio
  ```
- **If running inside a Docker container on the Pi**, you can rebuild the container or run pip upgrade inside the container to ensure matching versions.

---

## 🧭 PID Calibration Script Fix & Driver Safety/Smoothing Updates (2026-08-18)

### 🐛 Bug Fixes
1. **[calibrate_pid.py](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_driver/test/calibrate_pid.py)**
   * The file had two `plot_matplotlib()` definitions; the second (which wins, since Python keeps the last redefinition) indexed `s['m3_rpm']` / `s['m4_rpm']` on each sample dict. `run_step_test()` only ever collects `time`, `target`, `m1_rpm`, `m2_rpm` (this is a 2-motor diff-drive robot, no M3/M4 telemetry), so `--plot` / interactive option `[5]` crashed with `KeyError`.
   * Removed the dead duplicate definition and rewrote the surviving one to only plot M1/M2.
   * Fixed `export_csv()`'s `fieldnames` (`target_rpm`→`target`, dropped `m3_rpm`/`m4_rpm`) to match the actual sample dict keys — was silently writing empty/misaligned CSV columns rather than crashing (wrapped in try/except).
   * Note: `hbot_driver` is a submodule — this fix needs to be committed/pushed inside its own repo separately.

### 🛠️ Changes Implemented

2. **cmd_vel watchdog** — [hbot_driver_yahboom_node.cpp](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_driver/src/hbot_driver_yahboom_node.cpp)
   * Added `cmd_vel_timeout` parameter (default `0.5s`, in [hbot_driver/config/params.yaml](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_driver/config/params.yaml) and [hbot_bringup/config/yahboom_driver_params.yaml](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_bringup/config/yahboom_driver_params.yaml)).
   * `cmdVelCallback` now records `last_cmd_vel_time_`. A new wall timer (`cmdVelWatchdogCallback`, firing at `cmd_vel_timeout/5`) checks elapsed time since the last `cmd_vel` message and zeroes the motors once it exceeds the timeout, logging a warning. Guarded by a `cmd_vel_stopped_` flag so it only issues the stop command once per timeout event (not spammed every tick), and resets on the next real `cmd_vel` message. Prevents the robot coasting on a stale command forever if the publisher (teleop browser tab, Nav2, etc.) dies or the network drops.
   * Verified with `./build_packages.sh hbot_driver_yahboom` — builds clean (only pre-existing unrelated `write()` return-value warnings in `rosmaster.cpp`).

3. **Teleop cmd_vel through velocity_smoother** — [base_bringup.launch.py](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_bringup/launch/base_bringup.launch.py)
   * `hbot_web`'s `web_node` now publishes teleop commands on `cmd_vel_teleop` (via its existing `cmd_vel_topic` parameter) instead of `cmd_vel` directly.
   * Added a `nav2_velocity_smoother` node (remapped `cmd_vel`→`cmd_vel_teleop` in, `cmd_vel_smoothed`→`cmd_vel` out) plus its own `lifecycle_manager_smoother` (autostart) so it activates standalone, since `base_bringup.launch.py` doesn't otherwise bring up Nav2's lifecycle manager.
   * Reuses the existing `velocity_smoother` block in `nav2_params.yaml` (new `smoother_params_file` launch arg, defaults there) so teleop and Nav2-driven motion get identical rate/accel limiting — no duplicated tuning source of truth. Explicitly overrides `use_sim_time: False` on top of the yaml (which defaults it `True` for the sim/Nav2 case) since this launch file only runs on real hardware.
   * Verified by executing `generate_launch_description()` directly — builds without error (9 actions: 4 launch args + driver, web, smoother, lifecycle manager, EKF).

---

## 2026-08-19: Nav2 local controller swapped to RPP + narrow-corridor costmap tuning

Changed [`src/hbot_bringup/config/nav2_params.yaml`](../src/hbot_bringup/config/nav2_params.yaml):

- **Robot footprint corrected**: `local_costmap`/`global_costmap` previously used a leftover
  TurtleBot3-Waffle `robot_radius: 0.22` circle. HBOT's real footprint comes from
  `base_length: 0.17` (`hbot_description`) and `wheel_track: 0.2` +
  `wheel_width: 0.025` (`yahboom_driver_params.yaml`), giving a ~0.17m x 0.225m
  rectangle. Replaced `robot_radius` with an explicit rectangular
  `footprint: "[[0.09, 0.12], [0.09, -0.12], [-0.09, -0.12], [-0.09, 0.12]]"`
  (padded slightly to 0.18m x 0.24m, `footprint_padding: 0.01`) on both costmaps —
  inscribed radius 0.09m, circumscribed radius 0.15m. A circular footprint can't
  fit through gaps the actual (narrower) rectangle would clear when
  traveling straight through them.
- **`controller_server.FollowPath`**: replaced `dwb_core::DWBLocalPlanner` with
  `nav2_regulated_pure_pursuit_controller::RegulatedPurePursuitController` (RPP),
  with lookahead distances (0.25-0.5m) and speed (`desired_linear_vel: 0.2`)
  scaled down for this robot's small footprint, and regulated/cost-based
  velocity scaling enabled so it slows down instead of clipping walls in tight
  corridors.
- **`inflation_layer`** (both costmaps): `cost_scaling_factor` raised
  3.0 -> 8.0 and `inflation_radius` reduced 0.55 -> 0.12, so a corridor with
  only ~0.10m clearance on each side of the robot doesn't get inflated into a
  blanket high-cost/no-go zone. `FollowPath.inflation_cost_scaling_factor` is
  kept in sync (8.0) with the costmap's `cost_scaling_factor`.

**Not changed / flagged for follow-up**: `hbot_description`'s
`hbot.urdf.xacro` still computes `wheel_separation` as
`base_width (0.14) + 2 * wheel_ygap (0.015) = 0.17m`, which no longer matches
the driver's actual `wheel_track: 0.2`. This only affects simulated
odometry/footprint visuals (Gazebo diff-drive plugin + RViz), not the real
robot (the driver already uses 0.2m for real odometry) — left untouched
pending confirmation this should be updated too.

**Not yet validated**: no sim/hardware run performed against these values;
per `PHASE0_RUNBOOK.md` baseline acceptance, this should be exercised with
`slam:=True enable_navigation:=True` and a real narrow-corridor test before
being considered final.

---

## 2026-08-20: Fixed Nav2 not accepting goals — `velocity_smoother` node name collision

**Symptom**: after starting SLAM/navigation mode from the web dashboard,
publishing a goal (from RViz or the dashboard) produced *no* reaction and no
log output at all — not even a planning failure.

**Root cause** (found via the actual `log/navigation_<>.log`, not the
nav2_params.yaml tuning from the entry above): [base_bringup.launch.py](../src/hbot_bringup/launch/base_bringup.launch.py)
(run permanently by `hbot_web.service`) brings up its own
`nav2_velocity_smoother` node named `velocity_smoother` to rate-limit teleop
`cmd_vel_teleop` -> `cmd_vel` (added 2026-08-19, walkthrough entry above).
When the dashboard then starts `hbot_bringup.launch.py`'s Nav2 stack on
demand, `nav2_bringup`'s `navigation_launch.py` brings up *another* node also
named `velocity_smoother`. Two lifecycle nodes with the same fully-qualified
name collide on their `/velocity_smoother/change_state` service name; the new
`lifecycle_manager_navigation`'s `configure` request was landing on the
already-`active` teleop instance, which can't take that transition and fails
instantly with no exception text:
```
[lifecycle_manager_navigation] [ERROR] Failed to change state for node: velocity_smoother
[lifecycle_manager_navigation] [ERROR] Failed to bring up all requested nodes. Aborting bringup.
```
`velocity_smoother` is last in Nav2's managed-node list, so `controller_server`,
`planner_server`, and `bt_navigator` all *configure* successfully but the whole
chain aborts before the *activate* phase ever runs for anyone — `bt_navigator`'s
`goal_pose` subscription exists but nothing behind it is active, so goals
vanish silently. Confirmed by building `nav2_velocity_smoother` locally and
reproducing the identical failure signature with two same-named instances.

**Fix** — [base_bringup.launch.py](../src/hbot_bringup/launch/base_bringup.launch.py):
- Renamed the always-on teleop smoother node `velocity_smoother` ->
  `teleop_velocity_smoother`, and its `lifecycle_manager_smoother`'s
  `node_names` to match, so it can never collide with Nav2's own
  `velocity_smoother`.
- Since ROS 2 params files match a node's block by its node name, the plain
  `nav2_params.yaml` (still shared with Nav2's tuning as the single source of
  truth) would no longer match a node named `teleop_velocity_smoother`. Wrapped
  it in `nav2_common.launch.RewrittenYaml` with
  `key_rewrites={'velocity_smoother': 'teleop_velocity_smoother'}` so the
  renamed node still resolves the same tuned block at launch time.
- Verified locally: built `nav2_velocity_smoother` for this dev machine,
  launched it as `teleop_velocity_smoother` against the rewritten params, and
  confirmed both that it configures cleanly (no collision) and that
  `ros2 param get` reports the tuned values (`max_velocity: [0.26, 0.0, 1.0]`,
  `max_accel: [1.0, 0.0, 2.2]`), not the library defaults — i.e. the rename
  didn't silently drop its tuning.

---

## 2026-08-20: `cmd_vel` arbitration between teleop and Nav2 via twist_mux

**Symptom**: follow-up to the name-collision fix above. Renaming the teleop
smoother fixed Nav2 goal reception, but surfaced a second, pre-existing issue:
both `teleop_velocity_smoother` (always-on, in
[base_bringup.launch.py](../src/hbot_bringup/launch/base_bringup.launch.py))
and Nav2's own `velocity_smoother` (only alive while navigation/SLAM mode is
running, from the vendored `navigation2` submodule's `navigation_launch.py`)
were both remapping their smoothed output straight onto the same final
`cmd_vel` topic — the one topic
[hbot_driver_yahboom_node.cpp](../src/hbot_driver/src/hbot_driver_yahboom_node.cpp)
actually subscribes to (unremapped, with its own 0.5s `cmd_vel_timeout`
watchdog). No arbitration existed between the two publishers.

**Root cause / risk**: read `nav2_velocity_smoother`'s `smootherTimer()`
source — its wall timer only stays silent if it has *never* received a
command that session (`if (!command_) return;`); once the teleop smoother has
seen any joystick input, it keeps firing (and publishing) at
`smoothing_frequency` indefinitely. So a teleop smoother that had been touched
earlier in the session could keep intermittently overriding/zeroing Nav2's
autonomous driving output any time both were alive together, with outcome
depending on DDS publish ordering — not itself blocking Nav2 like the name
collision did, but a real correctness/safety gap once both are running side
by side.

**Fix**:
- [base_bringup.launch.py](../src/hbot_bringup/launch/base_bringup.launch.py):
  `teleop_velocity_smoother`'s output remap changed from
  `('cmd_vel_smoothed', 'cmd_vel')` to
  `('cmd_vel_smoothed', 'cmd_vel_teleop_smoothed')`. Added a `twist_mux` node
  (new `<exec_depend>twist_mux</exec_depend>` in
  [package.xml](../src/hbot_bringup/package.xml), resolved on the Pi via the
  existing `rosdep install` step in `docker/pi/Dockerfile` — no Dockerfile
  change needed) remapped `cmd_vel_out` -> `cmd_vel`, so it's now the sole
  publisher of the final `cmd_vel`.
- [hbot_bringup.launch.py](../src/hbot_bringup/launch/hbot_bringup.launch.py):
  rather than hand-editing the vendored `navigation2` submodule's
  `navigation_launch.py`, wrapped its `IncludeLaunchDescription` in
  `bringup_cmd_group` with a `launch_ros.actions.SetRemap('cmd_vel_smoothed',
  'cmd_vel_nav_smoothed')` — this overrides the included file's
  `velocity_smoother` node's own hardcoded `('cmd_vel_smoothed', 'cmd_vel')`
  remap from outside, without touching the submodule.
- New [config/twist_mux.yaml](../src/hbot_bringup/config/twist_mux.yaml):
  `teleop` topic `cmd_vel_teleop_smoothed` at priority 100, `navigation` topic
  `cmd_vel_nav_smoothed` at priority 10 — touching the joystick always
  overrides autonomous driving. Both use a 0.5s timeout (matching
  `hbot_driver`'s own `cmd_vel_timeout` watchdog default) so an idle source
  stops blocking the other; the driver's watchdog remains the final backstop
  if both go silent.
- Updated [workspace_overview.md](workspace_overview.md) to describe the new
  `cmd_vel_teleop_smoothed` / `cmd_vel_nav_smoothed` / `twist_mux` flow.

**Verified**:
- Confirmed the `SetRemap`-through-`IncludeLaunchDescription` mechanism
  empirically before relying on it: a minimal `GroupAction([SetRemap(...),
  IncludeLaunchDescription(...)])` around a `demo_nodes_cpp` talker with its
  own hardcoded remap of the same topic showed the outer `SetRemap` wins —
  `ros2 topic info` showed the talker publishing only on the renamed topic.
- Ran `generate_launch_description()` directly for both
  `base_bringup.launch.py` (11 actions, including a `twist_mux` node) and
  `hbot_bringup.launch.py` (19 actions; confirmed `bringup_cmd_group`
  contains `SetRemap` immediately before the `navigation_launch.py`
  `IncludeLaunchDescription`) — both build without error.
- Not yet run on real hardware — should be exercised with navigation active
  and the joystick touched mid-autonomous-drive to confirm the priority
  override behaves as expected before considered final.


---

## 2026-08-21: Launch mapping/navigation from scripts + build/bringup robustness fixes

- [scripts/web_bringup.sh](../scripts/web_bringup.sh): launches `base_bringup.launch.py`
  with `use_ekf:=False` — EKF was found not to help (see 2026-08-18 testing
  notes above) so it's disabled in the production Pi bringup for now.
- [hbot_web/web_node.py](../src/hbot_web/hbot_web/web_node.py)'s `ROSLaunchManager`
  no longer builds `ros2 launch hbot_bringup hbot_bringup.launch.py ...` command
  strings inline. `start_mapping_mode()` / `start_navigation_mode()` now shell out
  to new [start_mapping.sh](../src/hbot_web/hbot_web/scripts/start_mapping.sh) /
  [start_navigation.sh](../src/hbot_web/hbot_web/scripts/start_navigation.sh),
  installed via `hbot_web/setup.py`'s `package_data`. Each script logs its own
  run to a timestamped file under `~/hbot_ws/log/` (`mapping_<datetime>.log` /
  `navigation_<datetime>.log`), separate from `web_bringup.log`, making it
  easier to pull logs for a specific mapping/navigation session instead of
  grepping the always-on dashboard log.
- [build_packages.sh](../build_packages.sh) / [build_packages_pi.sh](../build_packages_pi.sh):
  self-source `/opt/ros/humble/setup.bash` if `AMENT_PREFIX_PATH` isn't already
  set in the shell, instead of failing deep inside CMake with an opaque error.
  This was silently breaking when building via `docker exec` into a running
  container, which bypasses the image's `ENTRYPOINT` (where ROS 2 is normally
  sourced) — `docker compose up`/`run` were unaffected since those do go
  through the entrypoint.

---

## 2026-08-21: Web dashboard — Nav2 "Set Goal" tool + global path overlay

- [hbot_web/web_node.py](../src/hbot_web/hbot_web/web_node.py): adds a
  `goal_pose` publisher (`geometry_msgs/PoseStamped`) and a `plan` subscriber
  (`nav_msgs/Path`, Nav2's global plan). The new `goal_pose_cmd` Socket.IO
  handler takes `{x, y, yaw}` from the browser, converts `yaw` to a quaternion,
  and publishes it on `goal_pose` for `bt_navigator` to pick up. `plan_callback`
  re-emits each plan update to the browser as `plan_status` (a simple list of
  `{x, y}` points) for the map overlay below. Switching workflow mode now also
  emits an empty `plan_status` to clear any stale path from a previous
  navigation session.
- [templates/index.html](../src/hbot_web/hbot_web/templates/index.html) /
  [static/js/main.js](../src/hbot_web/hbot_web/static/js/main.js): new
  "Set Goal" map tool button, reusing the existing click-and-drag
  orientation-arrow interaction from "2D Pose Estimate" (`dragStart`/`dragEnd`)
  but rendered in orange and publishing to `goal_pose_cmd` instead of
  `initialpose_cmd`. The two tools are mutually exclusive (activating one
  deactivates the other) and "Set Goal" is guarded to only work in Navigation
  mode. `drawMap()` now also strokes the live `plan_status` points as an
  orange path overlay on the map canvas, and the overlay/tool state is reset
  whenever the workflow mode leaves `navigation`.
