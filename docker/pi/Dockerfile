FROM --platform=linux/arm64 ros:humble-ros-base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    bash-completion \
    git \
    sudo \
    python3-flask \
    python3-flask-socketio \
    python3-psutil \
    python3-eventlet \
    ros-humble-rosidl-default-generators \
    ros-humble-rosidl-default-runtime \
    ros-humble-rosidl-typesupport-c \
    ros-humble-rosidl-typesupport-cpp \
    ros-humble-geographic-msgs \
    ros-humble-diagnostic-updater \
    libgeographic-dev \
    ros-humble-angles \
    libboost-system-dev \
    build-essential \
    ros-humble-cartographer \
    ros-humble-cartographer-ros \
    ros-humble-hls-lfcd-lds-driver \
    && rm -rf /var/lib/apt/lists/*


# Pre-install workspace dependencies using rosdep
WORKDIR /root/hbot_ws
COPY src ./src
RUN rm -rf src/hbot_simulation && \
    apt-get update && \
    rosdep update && \
    rosdep install --from-paths src --ignore-src -y --rosdistro humble \
    --skip-keys "rviz2 rviz_common rviz_default_plugins rviz_ogre_vendor rviz_rendering nav2_rviz_plugins" && \
    rm -rf src && \
    rm -rf /var/lib/apt/lists/*
