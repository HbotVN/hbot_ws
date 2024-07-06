#!/bin/bash

# get all args to string
# example "arg1 arg2 arg3"
args_str="${@}"

echo "Number of args: $numArgs"

# build packages
echo "Building package(s): $args_str"

colcon build --symlink-install --packages-select ${args_str}


