export ROS_DOMAIN_ID=9
source /home/pi/install/setup.bash

ros2 launch hbot_bringup hbot_bringup.launch.py ${@}

