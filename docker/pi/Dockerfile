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
RUN apt-get update && \
    rosdep update && \
    rosdep install --from-paths src --ignore-src -y --rosdistro humble && \
    rm -rf src && \
    rm -rf /var/lib/apt/lists/*
