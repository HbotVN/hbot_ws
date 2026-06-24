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
