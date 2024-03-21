#!/bin/bash

# get all args to string
# example "arg1 arg2 arg3"
args_str="${@}"

# if numble of args is 0, build all packages
if [ $# -eq 0 ]; then
  echo "Building all packages"
  colcon build --symlink-install
  echo "Done building all packages"
else
  echo "Building package(s): $args_str"
  colcon build --symlink-install --packages-select ${args_str}
  echo "Done building package(s): $args_str"
fi
