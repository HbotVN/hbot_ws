FROM osrf/ros:humble-desktop-full 

ENV DEBIAN_FRONTEND=noninteractive 

RUN apt-get update && apt-get install -y \
    bash-completion \
    git \
    sudo \
    x11-apps \
    mesa-utils \
    ros-humble-gazebo-plugins \
    ros-humble-ros-gz \
    && rm -rf /var/lib/apt/lists/*

# Pre-install workspace dependencies using rosdep
WORKDIR /root/hbot_ws
COPY src ./src
RUN apt-get update && \
    rosdep update && \
    rosdep install --from-paths src --ignore-src -y --rosdistro humble && \
    rm -rf src && \
    rm -rf /var/lib/apt/lists/*