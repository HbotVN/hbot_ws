
### [18/8/2026] Fix bug move robot

[x] Sync to pi, correct polarity
[x] Add polarity calib scripts into hbot_driver 
[x] Run test on robot: 
    - Disable ekf (in scripts/web_bringup.sh)
    - mapping not work, need to check 
    - Navigation worked, but has some issues: 
        - PID of two motors not same 
        - lidar mis-align when rotate. 
        - The robot can't go through the gap less than 0.3m

TODO: 
[x] Fix move robot
[] Calib navigation params. 
[] Replace new LiDAR 

### [18/8/2026] PID calib script fix, cmd_vel safety, teleop smoothing, Pi build fixes

[x] Fix calibrate_pid.py crash - duplicate plot_matplotlib() def referenced m3/m4 RPM keys that don't exist (2-motor robot); also fixed export_csv() field mismatch
[x] Analyze PID step response plots (20/40/80 rpm) - 20rpm shows a persistent oscillation/limit cycle that never settles, even with wheels off the ground (not a load issue - likely encoder quantization at low speed, needs a retune)
[x] Investigate "robot turns a bit going straight" - ruled out a cmd_vel decomposition bug (driver always sends equal L/R rpm when angular.z=0); unloaded test shows M1/M2 well matched, so it's probably mechanical (wheel diameter/tire wear/traction/caster), not motor/PID asymmetry - not yet confirmed on the physical robot
[x] Route hbot_web teleop cmd_vel through nav2_velocity_smoother in base_bringup.launch.py (previously only Nav2-driven cmd_vel was smoothed, teleop bypassed it entirely and hit the driver raw) -> the "turn a bit when go straight" is eliminated. 
[x] Add cmd_vel watchdog to hbot_driver_yahboom_node.cpp - robot now auto-stops (cmd_vel_timeout param, default 0.5s) if cmd_vel stops publishing instead of coasting on the last command forever
[x] Create deploy-to-pi and commit-and-deploy skills (.claude/skills/)
[x] Deploy to pi - build, sync, restart hbot_web.service, verified logs clean (driver connected, velocity_smoother activated, web dashboard serving)
[x] Fix docker/pi build robustness - uncommented the build command in docker-compose.yaml; build_packages.sh/build_packages_pi.sh now self-source ROS 2 if not already sourced (was silently breaking under `docker exec`)

TODO:
[] Calib navigation params.
[] Replace new LiDAR
[] Web interface: 
  - Add goal input from map 
  - Show global path 
