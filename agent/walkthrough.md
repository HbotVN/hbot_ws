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

# Walkthrough: Navigation Goal Input & Path Plan Overlay (hbot_web)

Added a "Set Goal" map tool to the dashboard, mirroring the existing "Pose Estimate" tool, plus a live overlay of Nav2's computed global path.

## Backend Changes
- [web_node.py](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/hbot_web/web_node.py):
  - Added a `goal_pose_pub` publisher on `goal_pose` (`geometry_msgs/PoseStamped`) — this is the topic Nav2's `bt_navigator` subscribes to for one-shot `NavigateToPose` goals (the same interface RViz2's "Nav2 Goal" tool uses).
  - Added a subscription to `plan` (`nav_msgs/Path`), Nav2's global planner output, forwarded to the browser as `plan_status` (`{points: [{x, y}, ...]}`).
  - Added the `goal_pose_cmd` SocketIO handler (`x`, `y`, `yaw` in the `map` frame), symmetric to the existing `initialpose_cmd` handler.
  - `switch_mode` now emits an empty `plan_status` first, so a stale path from a previous navigation session doesn't linger after switching to mapping/idle.

## Frontend Changes
- [index.html](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/hbot_web/templates/index.html): Added a "Set Goal" button (`#btn-nav-goal`) next to "Pose Estimate" in the map toolbar, reusing the existing `.tool-btn`/`.tool-active` styles.
- [main.js](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_web/hbot_web/static/js/main.js):
  - Generalized the click-and-drag arrow interaction (previously only for 2D Pose Estimate) so it drives either `initialpose_cmd` or `goal_pose_cmd` depending on which tool is active (`poseEstimateMode` vs. `goalSetMode`, mutually exclusive, arrow color green vs. orange).
  - "Set Goal" is only enabled while `currentWorkflowMode === 'navigation'`.
  - `drawMap()` now renders the live `plan_status` points as an orange polyline over the occupancy grid, so the planned path to the goal is visible as the robot moves.
  - Path overlay and any in-progress goal drag are cleared automatically when the workflow mode leaves `navigation`.

