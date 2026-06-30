# HBOT Raspberry Pi Build and Sync Runner (Docker Compose)

This directory contains the Docker configuration to build arm64 (aarch64) packages for the HBOT robot (Raspberry Pi) using QEMU emulation on your laptop, and to output them into `install_pi` on the host, which can be directly synced to your Pi.

---

## 🛠️ Step 1: Register QEMU Emulation (Host Terminal)

Since your laptop runs on `x86_64` and the Raspberry Pi runs on `arm64`, you must enable QEMU multi-architecture support in Docker. 

Open a terminal on your host machine and run:

```bash
docker run --privileged --rm tonistiigi/binfmt --install all
```

---

## 🏗️ Step 2: Build the Container

Build the Docker image for the Pi build environment:

```bash
cd docker/pi
docker compose build
```

---

## 🚀 Step 3: Compile Packages for the Pi

Run the container to compile the workspace packages:

```bash
docker compose up
```

This will run the `./build_packages_pi.sh` script, compiling the code to `install_pi/` on your host. 
The script will also automatically fix ownership of `build_pi`, `install_pi`, and `log_pi` to match the owner of your source code.

---

## 🔄 Step 4: Sync to the Raspberry Pi

To sync the compiled `install_pi` folder directly to the Raspberry Pi, use the helper script:

```bash
./sync_to_pi.sh [PI_USER] [PI_HOST] [PI_DEST]
```

Example:
```bash
./sync_to_pi.sh ubuntu 192.168.1.100 ~/hbot_ws
```

By default, if you don't specify arguments, it defaults to:
- User: `ubuntu`
- IP/Host: `192.168.1.100` (which you can override)
- Destination directory: `~/hbot_ws`
