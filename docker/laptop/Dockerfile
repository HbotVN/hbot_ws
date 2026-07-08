FROM osrf/ros:humble-desktop-full 

ENV DEBIAN_FRONTEND=noninteractive 

RUN apt-get update && apt-get install -y \
    bash-completion \
    git \
    sudo \
    x11-apps \
    mesa-utils \
    python3-pip \
    ros-humble-gazebo-plugins \
    ros-humble-ros-gz \
    python3-lxml \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install flask flask-socketio eventlet psutil

# Pre-install workspace dependencies using rosdep
WORKDIR /root/hbot_ws
COPY src ./src
RUN apt-get update && \
    rosdep update && \
    rosdep install --from-paths src --ignore-src -y --rosdistro humble && \
    rm -rf src && \
    rm -rf /var/lib/apt/lists/*