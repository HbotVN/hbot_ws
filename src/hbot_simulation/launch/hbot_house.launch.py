#!/usr/bin/env python3
#
# Copyright 2019 ROBOTIS CO., LTD.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Authors: Joep Tool

import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch.conditions import UnlessCondition
from launch_ros.actions import Node

def generate_launch_description():
    launch_file_dir = os.path.join(get_package_share_directory('hbot_simulation'), 'launch')
    pkg_gazebo_ros = get_package_share_directory('gazebo_ros')

    use_sim_time = LaunchConfiguration('use_sim_time', default='true')
    x_pose = LaunchConfiguration('x_pose', default='-1.0')
    y_pose = LaunchConfiguration('y_pose', default='-4.5')
    headless = LaunchConfiguration('headless', default='false')

    world = os.path.join(
        get_package_share_directory('hbot_simulation'),
        'worlds',
        'hbot_house.world'
    )

    urdf_path = os.path.join(
        get_package_share_directory('hbot_description'),
        'urdf',
        'hbot.urdf'
    )

    with open(urdf_path, 'r') as infp:
        robot_desc = infp.read()

    sdf_path = os.path.join(
        get_package_share_directory('hbot_description'),
        'urdf',
        'hbot.sdf'
    )

    gzserver_cmd = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_gazebo_ros, 'launch', 'gzserver.launch.py')
        ),
        launch_arguments={'world': world}.items()
    )

    gzclient_cmd = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_gazebo_ros, 'launch', 'gzclient.launch.py')
        ),
        condition=UnlessCondition(headless)
    )

    robot_state_publisher_node = Node(
      package='robot_state_publisher',
      executable='robot_state_publisher',
      name='robot_state_publisher',
      parameters=[{'use_sim_time': use_sim_time,
          'robot_description': robot_desc}],
    )

    # spawn entity hbot with urdf file
    spawn_turtlebot_cmd = Node(
      package='gazebo_ros',
      executable='spawn_entity.py',
      arguments=[
          '-entity', 'hbot',
          '-file', sdf_path,
          '-x', x_pose,
          '-y', y_pose,
          '-z', '0.01'
      ],
      output='screen'
    )

    ld = LaunchDescription()

    # Add the commands to the launch description
    ld.add_action(gzserver_cmd)
    ld.add_action(gzclient_cmd)
    ld.add_action(robot_state_publisher_node)
    ld.add_action(spawn_turtlebot_cmd)

    return ld
