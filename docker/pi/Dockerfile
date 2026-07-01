FROM --platform=linux/arm64 ros:humble-ros-base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    bash-completion \
    git \
    sudo \
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
