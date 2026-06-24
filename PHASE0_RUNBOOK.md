# Phase 0 Runbook

Muc tieu cua Phase 0 la xac minh nen tang AMR co the chay on dinh o 4 bien the co ban:

1. Simulation + SLAM
2. Simulation + Localization
3. Real Robot + SLAM
4. Real Robot + Localization

## Build

```bash
./build_packages.sh hbot_description hbot_driver_yahboom hbot_bringup
```

Neu da build toan workspace truoc do bang Conda Python, can xoa `build/`, `install/`, `log/` roi build lai bang script tren.

## Simulation + SLAM

```bash
./bringup.sh simulation_mode:=True use_sim_time:=True slam:=True enable_navigation:=True run_rviz:=True
```

## Real Robot + SLAM

```bash
./bringup.sh simulation_mode:=False use_sim_time:=False slam:=True enable_navigation:=True run_rviz:=True
```

## Localization Mode

Localization can map YAML hop le. Hay thay `/absolute/path/to/map.yaml` bang map that cua ban.

### Simulation + Localization

```bash
./bringup.sh simulation_mode:=True use_sim_time:=True slam:=False enable_navigation:=True map:=/absolute/path/to/map.yaml run_rviz:=True
```

### Real Robot + Localization

```bash
./bringup.sh simulation_mode:=False use_sim_time:=False slam:=False enable_navigation:=True map:=/absolute/path/to/map.yaml run_rviz:=True
```

## Baseline Acceptance

1. `robot_state_publisher`, lidar, Nav2 va SLAM/localization deu len khong crash.
2. `/tf`, `/odom`, `/scan`, `/cmd_vel` co du lieu dung mode.
3. Robot di duoc 5 waypoint lien tiep trong sim.
4. Robot that chay teleop va odom khong drift bat thuong tren doan ngan.

## Notes

- `bringup.sh` tu dong default `CONTROLLER=yahboom` neu bien moi truong chua duoc set.
- `build_packages.sh` uu tien Python he thong de tranh xung dot voi Conda khi build ROS 2.
- `slam:=False` yeu cau map hop le; launch khong tu cung cap sample map.