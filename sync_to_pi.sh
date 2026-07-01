#!/bin/bash

set -e

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$workspace_dir"

PI_USER=${1:-root}
PI_HOST=${2:-hbot.local}
PI_DEST=${3:-/root/hbot_ws}

echo "==========================================="
echo "HBOT Pi Sync Tool"
echo "==========================================="
echo "Target Pi:  $PI_USER@$PI_HOST"
echo "Destination: $PI_DEST/install"
echo "==========================================="

if [ ! -d "install_pi" ]; then
	echo "Error: install_pi directory not found!"
	echo "Please run the Pi Docker container first to compile the packages:"
	echo "  docker compose -f docker/pi/docker-compose.yaml up"
	exit 1
fi

echo "Ensuring remote destination directory exists..."
ssh -o ConnectTimeout=5 "$PI_USER@$PI_HOST" "mkdir -p \"$PI_DEST\""

echo "Syncing install_pi to remote install/ directory..."
rsync -avz --delete --progress install_pi/ "$PI_USER@$PI_HOST:$PI_DEST/install/"

echo "==========================================="
echo "Sync completed successfully!"
echo "To source this on your Pi, run:"
echo "  source $PI_DEST/install/setup.bash"
echo "==========================================="
