# Workspace Overview: HBOT AMR Platform

This document provides a comprehensive breakdown of the `hbot_ws` ROS 2 workspace. It outlines the architectural components, package roles, mechanical configuration of the robot, and launch pipeline logic.

---

## 🏗️ Repository Architecture

The workspace is organized as a main repository containing utility scripts, Docker build recipes, documentation, and a series of Git submodules located under the `src` folder.

```mermaid
graph TD
    WS[hbot_ws Workspace] --> Scripts[bringup.sh / build_packages.sh]
    WS --> Docker[docker/ Dockerfile]
    WS --> Docs[docs/ dev_guide.md / PHASE0_RUNBOOK.md]
    WS --> Src[src/ Submodules]
    
    Src --> HB[hbot_bringup]
    Src --> HD[hbot_description]
    Src --> HDR[hbot_driver]
    Src --> HS[hbot_simulation]
    Src --> LDS[lds_006_driver]
    Src --> NAV[navigation2]
    Src --> SLAM[slam_toolbox]

    classDef pkg fill:#1f77b4,stroke:#333,stroke-width:2px,color:#fff;
    class HB,HD,HDR,HS,LDS,NAV,SLAM pkg;
```

---

## 📦 Package Directory & Roles

Under the `src/` directory, the following ROS 2 packages are configured as submodules:

### 1. [hbot_bringup](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_bringup)
* **Role**: The central orchestration package.
* **Key Files**:
  * [hbot_bringup.launch.py](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_bringup/launch/hbot_bringup.launch.py): The main entry launch file handling arguments for simulation/real hardware, mapping, navigation, and localization.
  * [base_bringup.launch.py](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_bringup/launch/base_bringup.launch.py): Production Pi entry point (driver + web dashboard + EKF). `hbot_web`'s teleop `cmd_vel` is published on `cmd_vel_teleop` and passed through a dedicated `nav2_velocity_smoother` instance named `teleop_velocity_smoother` (own `lifecycle_manager_smoother`, reusing the `velocity_smoother` block from `nav2_params.yaml` via a `RewrittenYaml` key rewrite) onto `cmd_vel_teleop_smoothed`. `hbot_bringup.launch.py`'s on-demand Nav2 stack similarly smooths its output onto `cmd_vel_nav_smoothed` (via a `SetRemap` around the vendored `navigation_launch.py` include, so the `navigation2` submodule itself is never edited). A `twist_mux` node (config `config/twist_mux.yaml`, teleop priority 100 > nav priority 10) arbitrates the two into the single final `cmd_vel` the driver consumes — see [walkthrough.md](walkthrough.md#2026-08-20-fixed-nav2-not-accepting-goals--velocity_smoother-node-name-collision) and the twist_mux follow-up entry for why both smoothers can't just write to `cmd_vel` directly.
  * `config/`: Contains YAML parameters for navigation (`nav2_params.yaml`), SLAM (`slam_params.yaml`), and the serial driver (`yahboom_driver_params.yaml`). `nav2_params.yaml`'s `controller_server` uses the Regulated Pure Pursuit controller (`nav2_regulated_pure_pursuit_controller`) with a rectangular robot footprint (not `robot_radius`) and a tight inflation radius, tuned to fit through ~10cm-clearance corridors — see [walkthrough.md](walkthrough.md#2026-08-19-nav2-local-controller-swapped-to-rpp--narrow-corridor-costmap-tuning) for details.

### 2. [hbot_description](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_description)
* **Role**: Defines the mechanical and physical properties of the robot.
* **Key Files**:
  * [hbot.urdf.xacro](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_description/urdf/hbot.urdf.xacro): The primary parameterised Xacro file.
  * `CMakeLists.txt`: Instructs the build process to automatically compile the Xacro into `hbot.urdf` and export the Gazebo-compatible `hbot.sdf`.

### 3. [hbot_driver](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_driver)
* **Role**: High-level hardware interfacing (ported to C++; the Python node below is legacy).
* **Key Files**:
  * [hbot_driver_yahboom_node.cpp](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_driver/src/hbot_driver_yahboom_node.cpp): Subscribes to `cmd_vel`, translates linear/angular velocity to per-wheel RPM commands over serial to the Yahboom Rosmaster board, and publishes odometry, battery status, and optional IMU telemetry. Includes a `cmd_vel` watchdog (`cmd_vel_timeout` param, default `0.5s`): a timer checks time-since-last-`cmd_vel` and zeroes the motors if it's exceeded, so the robot stops itself if the publisher (teleop client, Nav2, etc.) disconnects or the network drops instead of coasting on the last command forever.
  * [hbot_driver_yahboom.py](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_driver/hbot_driver_yahboom/hbot_driver_yahboom.py): Legacy Python implementation of the same node, predating the C++ port.
  * `Rosmaster_Lib/`: Underlying python library for low-level serial communication with the Yahboom controller board (still used by `test/calibrate_pid.py`).

### 4. [hbot_simulation](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_simulation)
* **Role**: Simulation environment.
* **Key Files**:
  * [hbot_house.launch.py](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_simulation/launch/hbot_house.launch.py): Launches Gazebo, loads a virtual indoor environment (`hbot_house.world`), and spawns the robot description.

### 5. [lds_006_driver](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/lds_006_driver)
* **Role**: Driver node for the physical LDS-006 LiDAR sensor.
* **Key Files**:
  * `src/lds006_laser_publisher.cpp`: Interfaces with the serial LiDAR stream and publishes `sensor_msgs/LaserScan` messages on the `/scan` topic.

### 6. [navigation2](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/navigation2) & [slam_toolbox](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/slam_toolbox)
* **Role**: Standard localization, mapping, and path planning components customized or referenced for this robot.

---

## 🤖 Robot Specifications (Mechanical & Kinematics)

From [hbot.urdf.xacro](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_description/urdf/hbot.urdf.xacro) and [yahboom_driver_params.yaml](file:///home/huy/Documents/03.MyProjects/hbot_ws/src/hbot_bringup/config/yahboom_driver_params.yaml):

* **Type**: Differential Drive Robot
* **Dimensions**: Length: `0.17m`, Width: `0.14m`, Height: `0.12m`.
* **Wheels**:
  * **Diameter**: `0.065m` (radius `0.0325m`).
  * **Track Width / Separation**: `0.17m` (defined as `base_width + 2 * wheel_ygap`).
  * **Encoder Resolution**: `11` PPR, Gear Ratio: `56:1`. Total encoder ticks per rotation = `11 * 56 * 4 = 2464` ticks.
* **Lidar Sensor**:
  * **Mounting**: Mounted `0.075m` above the base center.
  * **Orientation**: Flipped 180 degrees (`rpy="0 0 3.14"`).

---

## 🚀 Operations & Orchestration Pipeline

### 🔄 Build Script (`build_packages.sh`)
Forces the system's python executable (`/usr/bin/python3`) and environment configs to avoid conflicts with virtual/conda environment python installations when invoking `colcon build`.

### 🚀 Bringup Script (`bringup.sh`)
Wraps the `ros2 launch hbot_bringup hbot_bringup.launch.py` command, sourcing the installation space and pre-defining environmental configurations like `ROS_DOMAIN_ID=9` and `CONTROLLER=yahboom`.

### 🗺️ Operational Modes matrix

```
                 +-------------------+
                 |    bringup.sh     |
                 +---------+---------+
                           |
            +--------------+--------------+
            |                             |
  [simulation_mode:=True]       [simulation_mode:=False]
            |                             |
     (Gazebo simulation)        (Real Yahboom HW & LiDAR)
            |                             |
      +-----+-----+                 +-----+-----+
      |           |                 |           |
  [slam:=T]   [slam:=F]         [slam:=T]   [slam:=F]
      |           |                 |           |
  SLAM/Map    Nav2 Map-based    SLAM/Map    Nav2 Map-based
  Building    Localization      Building    Localization
```
