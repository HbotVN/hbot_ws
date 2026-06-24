# Developer Guide: ROS 2 Development in Docker

This guide walks you through setting up and using a Docker container for compiling and building ROS 2 workspace packages on ARM64 architecture.

---

## 🛠️ Phase 1: The First-Time Setup (Create & Configure)

Run these steps only once to create your builder environment and install all your required robot dependencies.

### 1. Launch the Container
Run this command from your laptop terminal inside your workspace directory (`~/myproject/hbot_ws`). Note the use of the `--name` flag, which makes it easy to find and manage the container later.

```bash
docker run -it --name hbot_builder \
  --platform linux/arm64 \
  -v "$(pwd)":/root/hbot_ws \
  ros:humble-ros-base
```

> [!NOTE]
> Running this command will place you inside the container prompt.

### 2. Update and Install Core Tools
Inside the container, update the package list and install the foundational development utilities you will need:

```bash
apt-get update && apt-get install -y python3-pip wget curl
```

### 3. Install ROS 2 Dependencies (`rosdep`)
Run `rosdep` to scan your workspace's `package.xml` files and auto-install underlying libraries. We explicitly skip packages we do not need on the robot (like RViz):

```bash
cd /root/hbot_ws
rosdep update
rosdep install --from-paths src --ignore-src -y --rosdistro humble --skip-keys "rviz rviz2"
```

### 4. Build the Workspace
Compile your packages for the ARM64 architecture:

```bash
colcon build --merge-install
```

Once the build finishes successfully, type `exit` to close the container and return to your host terminal.

---

## 🔁 Phase 2: Daily Development (Re-run & Resuming)

When returning to develop later, **do not** use `docker run` again. Your container already exists and has all the dependencies you installed in Phase 1 preserved inside its isolated storage.

### 1. Wake up your existing container
From your laptop terminal, turn the container back on:

```bash
docker start hbot_builder
```

### 2. Jump inside to compile or run tools
Attach an interactive terminal session to the running container:

```bash
docker exec -it hbot_builder bash
```

> [!NOTE]
> This command drops you back inside your container environment.

### 3. Develop, Edit, and Re-build
Because your workspace is live-mapped, you can modify code in VS Code on your laptop, and then instantly re-compile it inside the container terminal:

```bash
cd /root/hbot_ws
colcon build --merge-install
```

### 4. Exit safely
When you are done building, simply exit:

```bash
exit
```

> [!NOTE]
> This drops you back to your laptop terminal but leaves the container sleeping in the background.

---

## 🧹 Useful Housekeeping Commands

Keep these quick commands in your back pocket to manage your Docker environment:

| Task | Command |
| :--- | :--- |
| **See running containers** | `docker ps` |
| **See ALL containers (even stopped ones)** | `docker ps -a` |
| **Stop the builder background service** | `docker stop hbot_builder` |
| **Delete the container completely (to start fresh)** | `docker rm hbot_builder` |
