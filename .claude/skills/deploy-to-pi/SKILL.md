---
name: deploy-to-pi
description: Cross-compile the workspace for the Raspberry Pi (arm64) via the docker/pi container, rsync the result to the robot, and restart the driver/web service. Use when the user asks to deploy, ship, push, sync, or install the current code onto the Pi/robot.
---

# Deploy to Pi

Builds `install_pi/` via the QEMU cross-compile container in `docker/pi/`, syncs it to the robot with `sync_to_pi.sh`, and restarts the running service so the new code actually takes effect.

This is an outward-facing, hard-to-reverse action against real hardware: restarting `hbot_web.service` briefly kills driver + web dashboard on the physical robot. If the robot might be in motion or mid-task, confirm with the user before restarting the service, unless they've clearly already authorized it (e.g. this skill was explicitly invoked for that purpose).

## Steps

1. **Check for a target host.** Default is `root@hbot.local` → `/root/hbot_ws` (matches `sync_to_pi.sh`'s own defaults and `CLAUDE.md`). If the user gave a different `PI_USER`/`PI_HOST`/`PI_DEST`, use those instead. Don't ask if defaults are likely fine — just proceed and state what you used.

2. **Build the arm64 packages:**
   ```bash
   cd docker/pi
   docker compose build
   docker compose up
   ```
   `docker compose up` runs `build_packages_pi.sh` inside the container, writing to `install_pi/` on the host (ignores `hbot_simulation`). Do **not** run `build_packages_pi.sh` directly on the host — it only works inside this container.

   If the build fails with an `exec format error` or similar QEMU-related error, the multi-arch emulation likely isn't registered yet — run once:
   ```bash
   docker run --privileged --rm tonistiigi/binfmt --install all
   ```
   then retry the build.

3. **Verify `install_pi/` exists** before syncing (`sync_to_pi.sh` itself checks this and errors out if missing, but confirm the build actually produced fresh output rather than reusing a stale directory from a failed prior run).

4. **Sync to the Pi:**
   ```bash
   ./sync_to_pi.sh [PI_USER] [PI_HOST] [PI_DEST]
   ```
   This rsyncs `install_pi/` → `<PI_DEST>/install/` and `scripts/` → `<PI_DEST>/scripts/` (with `--delete`, so it mirrors exactly — deleted local files disappear on the Pi too).

5. **Restart the service on the Pi** so the synced code takes effect:
   ```bash
   ssh <PI_USER>@<PI_HOST> "systemctl restart hbot_web.service"
   ```
   If `hbot_web.service` isn't installed on that Pi yet (fresh setup), fall back to the manual path instead, per `agent/walkthrough.md`:
   ```bash
   ssh <PI_USER>@<PI_HOST> "pkill -f web_node; pkill -f hbot_driver; cd <PI_DEST> && nohup ./scripts/web_bringup.sh > log/web_bringup.log 2>&1 &"
   ```

6. **Verify it came back up:**
   ```bash
   ssh <PI_USER>@<PI_HOST> "systemctl status hbot_web.service --no-pager -l" 
   ssh <PI_USER>@<PI_HOST> "journalctl -u hbot_web.service -n 50 --no-pager"
   ```
   Look for the driver connecting to the Rosmaster board and the Flask server binding without errors. Report the outcome plainly — if it crashed or the log shows errors, say so rather than declaring success.

## Notes

- `ROS_DOMAIN_ID=9` and `CONTROLLER=yahboom` are the standing defaults baked into the systemd unit and scripts — no need to pass them unless the user has a nonstandard setup.
- This skill only ships `install_pi/` + `scripts/`; it does not commit or push any git changes. If the user also wants their working changes committed and docs updated first, use the `commit-and-deploy` skill instead.
