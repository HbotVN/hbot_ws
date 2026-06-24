# HBOT Laptop Simulation Runner (Docker Compose)

This directory contains the Docker configuration to build and run the HBOT Gazebo simulation alongside SLAM and Navigation (Nav2) on your laptop.

---

## 🛠️ Step 1: Grant X11 Access (Host Terminal)

Since the simulation launches Gazebo and RViz (GUI applications), you must grant Docker containers permission to connect to your host's X server. 

On your host machine, open a terminal and run:

```bash
xhost +local:root
```

*Note: You need to run this command once per session (e.g. after restarting your host).*

---

## 🏗️ Step 2: Build the Container

Navigate to this directory and build the Docker image. This will download the base ROS image and install all workspace dependencies (like Ceres solver, Navigation2, and Gazebo plugins) using `rosdep`.

```bash
cd docker/laptop
docker compose build
```

---

## 🚀 Step 3: Run the Simulation

To launch the default setup (Simulation + SLAM + Nav2 + RViz):

```bash
docker compose up
```

This will automatically compile your local packages (using `./build_packages.sh`) inside the container and launch the simulation.

---

## ⚙️ Customizing the Launch Configuration

You can customize the simulation mode, SLAM, Navigation, and RViz by overriding environment variables before calling `docker compose up`.

### 1. Run Simulation with Map-based Localization (No SLAM)
If you already have a saved map and want to run localization instead of mapping:

```bash
SLAM=False docker compose up
```
*(Make sure to copy/mount your valid map to the directory configured in `hbot_bringup.launch.py` or specify it in your bringup parameters).*

### 2. Run Headless (No RViz)
To run the simulation backend without displaying the RViz GUI on your host screen:

```bash
RUN_RVIZ=False docker compose up
```

### 3. Combine Overrides
You can combine multiple overrides on a single command line:

```bash
SLAM=False RUN_RVIZ=False docker compose up
```

---

## 🧹 Cleaning Up

To stop the running simulation and clean up container resources, run:

```bash
docker compose down
```

---

## 💻 Interacting with the Running Container

If you need to enter the running container to run ROS CLI tools (e.g. `ros2 topic echo /odom`, check package status, or re-run a specific command):

```bash
docker exec -it hbot_simulation_container bash
```

Inside the container, source the workspace setup file:
```bash
source install/setup.bash
```

> [!NOTE]
> **ROS Domain ID**:
> By default, the simulation and compose container run on **`ROS_DOMAIN_ID=9`** (as defined in `bringup.sh`). Any `docker exec` session will automatically inherit this environment variable. If you are running ROS 2 CLI commands on your *host machine* instead of inside the container, make sure to set `export ROS_DOMAIN_ID=9` in your host terminal first.

