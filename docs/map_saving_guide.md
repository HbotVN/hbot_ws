# Map Saving Guide

This guide describes how to save occupancy grid maps generated during SLAM (Simultaneous Localization and Mapping) for use with Navigation2 (Nav2) and Localization modes.

---

> [!IMPORTANT]
> **ROS Domain ID Configuration**:
> Before running any command, ensure your terminal is set to the correct ROS domain ID. For the HBOT workspace, it defaults to:
> ```bash
> export ROS_DOMAIN_ID=9
> ```

---

## 🏗️ Option 1: Using Nav2 Map Saver CLI (Recommended)
This is the standard and most reliable way in ROS 2 to save the current map. It generates a `.pgm` image file and a `.yaml` metadata file, which are required for Map-based Localization.

Run this command from a terminal on either your laptop or the Pi:

```bash
ros2 run nav2_map_server map_saver_cli -f ~/hbot_ws/src/hbot_bringup/maps/my_map
```
*(Replace `~/hbot_ws/src/hbot_bringup/maps/my_map` with your desired save directory and map name).*

**Generated Files:**
* `my_map.pgm`: The map image file.
* `my_map.yaml`: The configuration metadata file containing resolution, origin, and thresholds.

---

## 🛠️ Option 2: Calling the SLAM Toolbox Service
If you are running SLAM Toolbox, it exposes a service that you can call directly from the command line:

### 1. Save standard map (`.yaml` / `.pgm`)
```bash
ros2 service call /slam_toolbox/save_map slam_toolbox/srv/SaveMap "{name: {data: '/root/hbot_ws/maps/my_map'}}"
```

### 2. Save SLAM Pose Graph (For resuming SLAM later)
If you want to save the serialized pose graph to resume mapping in the future, run:
```bash
ros2 service call /slam_toolbox/serialize_map slam_toolbox/srv/SerializePoseGraph "{filename: 'my_map'}"
```

---

## 🖥️ Option 3: Using the RViz GUI (SLAM Toolbox Panel)
If you are running RViz on your laptop:
1. In the top menu, go to **Panels** -> **Add New Panel**.
2. Select **SlamToolboxPlugin** and click **OK**.
3. A panel will appear on the side. In the text box next to the **Save Map** button, type the path/name where you want to save the map (e.g., `~/maps/my_map`).
4. Click:
   * **Save Map**: Generates standard `.yaml` and `.pgm` files.
   * **Save Serialize**: Generates the pose graph files.
