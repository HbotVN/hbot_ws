import os
import sys
import time
import socket
import threading
import subprocess
import sqlite3
import signal
import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from geometry_msgs.msg import Twist, PoseWithCovarianceStamped, PoseStamped
from std_msgs.msg import Float32
from nav_msgs.msg import Odometry, OccupancyGrid, Path
from sensor_msgs.msg import LaserScan
from rclpy.parameter import ParameterType
from rcl_interfaces.msg import ParameterDescriptor

try:
    import tf2_ros
    HAS_TF2 = True
except ImportError:
    HAS_TF2 = False

# Directory holding the shell scripts used to launch mapping/navigation modes
SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts')

# SQLite and Maps configuration
MAPS_DIR = '/root/hbot_ws/map'
if not os.path.exists(MAPS_DIR):
    # Fallback to local user workspace for laptop development
    MAPS_DIR = os.path.expanduser('~/Documents/03.MyProjects/hbot_ws/maps')
os.makedirs(MAPS_DIR, exist_ok=True)
DB_PATH = os.path.join(MAPS_DIR, 'hbot_maps.db')

def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS maps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                yaml_path TEXT NOT NULL,
                pgm_path TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active INTEGER DEFAULT 0
            )
        ''')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error initializing database: {e}")

def save_map_to_db(name, yaml_path, pgm_path):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE maps SET is_active = 0")
        cursor.execute(
            "INSERT OR REPLACE INTO maps (name, yaml_path, pgm_path, is_active) VALUES (?, ?, ?, 1)",
            (name, yaml_path, pgm_path)
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Database error: {e}")
        return False

def get_all_maps():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, yaml_path, created_at, is_active FROM maps ORDER BY created_at DESC")
        rows = cursor.fetchall()
        conn.close()
        return [{"id": r[0], "name": r[1], "yaml_path": r[2], "created_at": r[3], "is_active": r[4]} for r in rows]
    except Exception as e:
        print(f"Database error: {e}")
        return []

def delete_map_from_db(map_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT yaml_path, pgm_path FROM maps WHERE id = ?", (map_id,))
        row = cursor.fetchone()
        if row:
            yaml_path, pgm_path = row[0], row[1]
            if os.path.exists(yaml_path):
                try: os.remove(yaml_path)
                except Exception: pass
            if os.path.exists(pgm_path):
                try: os.remove(pgm_path)
                except Exception: pass
            cursor.execute("DELETE FROM maps WHERE id = ?", (map_id,))
            conn.commit()
            conn.close()
            return True
        conn.close()
        return False
    except Exception as e:
        print(f"Database error: {e}")
        return False

class ROSLaunchManager:
    def __init__(self, node):
        self.node = node
        self.logger = node.get_logger()
        self.active_process = None
        self.current_mode = None  # 'mapping', 'navigation', or None
        self.active_map = None

    def stop_active_launch(self):
        if self.active_process:
            self.logger.info("Terminating active ROS 2 launch session...")
            try:
                os.killpg(os.getpgid(self.active_process.pid), signal.SIGINT)
                self.active_process.wait(timeout=5)
            except Exception as e:
                self.logger.warn(f"SIGINT failed or timed out, forcing SIGKILL: {e}")
                try:
                    os.killpg(os.getpgid(self.active_process.pid), signal.SIGKILL)
                    self.active_process.wait()
                except Exception:
                    pass
            self.active_process = None
            self.current_mode = None
            self.active_map = None

    def start_mapping_mode(self):
        self.stop_active_launch()
        self.logger.info("Starting SLAM Mapping mode...")
        sim_time_str = "True" if self.node.use_sim_time else "False"
        script_path = os.path.join(SCRIPTS_DIR, 'start_mapping.sh')
        cmd = f"bash '{script_path}' {sim_time_str}"
        self.active_process = subprocess.Popen(
            cmd, shell=True, preexec_fn=os.setsid, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        self.current_mode = "mapping"
        self.active_map = None

    def start_navigation_mode(self, map_name, yaml_path):
        self.stop_active_launch()
        self.logger.info(f"Starting Navigation mode with map: {yaml_path}")
        sim_time_str = "True" if self.node.use_sim_time else "False"
        script_path = os.path.join(SCRIPTS_DIR, 'start_navigation.sh')
        cmd = f"bash '{script_path}' {sim_time_str} '{yaml_path}'"
        self.active_process = subprocess.Popen(
            cmd, shell=True, preexec_fn=os.setsid, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        self.current_mode = "navigation"
        self.active_map = map_name


# Check and import Flask dependencies
try:
    from flask import Flask, render_template, jsonify, request
    from flask_socketio import SocketIO, emit
except ImportError as e:
    print(f"Error: Flask and Flask-SocketIO must be installed. {e}")
    sys.exit(1)

try:
    import psutil
except ImportError as e:
    print(f"Warning: psutil not found, system metrics will be unavailable. {e}")
    psutil = None

# Get the path to templates and static folders relative to this script
base_dir = os.path.dirname(os.path.abspath(__file__))
template_dir = os.path.join(base_dir, 'templates')
static_dir = os.path.join(base_dir, 'static')

# Use threading mode to remain compatible with standard ROS 2 executor threads
async_mode = 'threading'

app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode=async_mode)


# Global references for Flask handlers to interact with ROS node
ros_node = None

def run_cmd(cmd, timeout=5):
    """Run a shell command and return (returncode, stdout, stderr)"""
    try:
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return res.returncode, res.stdout.strip(), res.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", "Command timeout"
    except Exception as e:
        return -1, "", str(e)

class WebNode(Node):
    def __init__(self):
        super().__init__('hbot_web_node')

        # Declare parameters
        self.declare_parameter(
            name='host', value='0.0.0.0',
            descriptor=ParameterDescriptor(type=ParameterType.PARAMETER_STRING, description="Host to run Flask server on")
        )
        self.declare_parameter(
            name='port', value=80,
            descriptor=ParameterDescriptor(type=ParameterType.PARAMETER_INTEGER, description="Port to run Flask server on")
        )
        self.declare_parameter(
            name='cmd_vel_topic', value='cmd_vel',
            descriptor=ParameterDescriptor(type=ParameterType.PARAMETER_STRING, description="Topic to publish velocity commands")
        )
        self.declare_parameter(
            name='battery_voltage_topic', value='battery/voltage',
            descriptor=ParameterDescriptor(type=ParameterType.PARAMETER_STRING, description="Battery voltage topic")
        )
        self.declare_parameter(
            name='battery_percent_topic', value='battery/percent',
            descriptor=ParameterDescriptor(type=ParameterType.PARAMETER_STRING, description="Battery percentage topic")
        )
        if not self.has_parameter('use_sim_time'):
            self.declare_parameter(
                name='use_sim_time', value=False,
                descriptor=ParameterDescriptor(type=ParameterType.PARAMETER_BOOL, description="Whether to run in simulation time")
            )

        # Get parameter values
        self.host = self.get_parameter('host').value
        self.port = self.get_parameter('port').value
        self.cmd_vel_topic = self.get_parameter('cmd_vel_topic').value
        self.battery_voltage_topic = self.get_parameter('battery_voltage_topic').value
        self.battery_percent_topic = self.get_parameter('battery_percent_topic').value
        self.use_sim_time = self.get_parameter('use_sim_time').value

        self.get_logger().info(f"Starting hbot_web_node on {self.host}:{self.port} (sim_time: {self.use_sim_time})")

        # Publishers
        self.cmd_vel_pub = self.create_publisher(Twist, self.cmd_vel_topic, 10)
        self.initial_pose_pub = self.create_publisher(PoseWithCovarianceStamped, 'initialpose', 10)
        self.goal_pose_pub = self.create_publisher(PoseStamped, 'goal_pose', 10)

        # Subscribers
        self.battery_voltage = 0.0
        self.battery_percent = 0.0
        self.create_subscription(Float32, self.battery_voltage_topic, self.battery_voltage_callback, 10)
        self.create_subscription(Float32, self.battery_percent_topic, self.battery_percent_callback, 10)
        self.create_subscription(Odometry, 'odom', self.odom_callback, 10)
        self.create_subscription(OccupancyGrid, 'map', self.map_callback, 10)
        self.create_subscription(LaserScan, 'scan', self.scan_callback, qos_profile_sensor_data)
        self.create_subscription(PoseWithCovarianceStamped, 'amcl_pose', self.amcl_pose_callback, 10)
        self.create_subscription(Path, 'plan', self.plan_callback, 10)

        # TF Buffer & Listener for map frame robot pose and laser pose lookup
        self.scan_frame_id = 'laser'
        if HAS_TF2:
            self.tf_buffer = tf2_ros.Buffer()
            self.tf_listener = tf2_ros.TransformListener(self.tf_buffer, self)
            self.create_timer(0.1, self.tf_timer_callback)

        # Timer for publishing system metrics (1Hz)
        self.create_timer(1.0, self.system_metrics_timer_callback)

        # Network interface detection
        self.wifi_interface = self.detect_wifi_interface()
        self.get_logger().info(f"Detected Wifi Interface: {self.wifi_interface}")

        # Networking throughput tracking variables
        self.last_net_time = time.time()
        self.last_bytes_sent = 0
        self.last_bytes_recv = 0
        if psutil:
            try:
                io_stats = psutil.net_io_counters()
                self.last_bytes_sent = io_stats.bytes_sent
                self.last_bytes_recv = io_stats.bytes_recv
            except Exception:
                pass

        # E-Stop and Dynamic Launching
        self.estop_active = False
        self.estop_timer = self.create_timer(0.05, self.estop_timer_callback)
        self.launch_manager = ROSLaunchManager(self)


    def estop_timer_callback(self):
        if self.estop_active:
            twist = Twist()
            twist.linear.x = 0.0
            twist.linear.y = 0.0
            twist.linear.z = 0.0
            twist.angular.x = 0.0
            twist.angular.y = 0.0
            twist.angular.z = 0.0
            self.cmd_vel_pub.publish(twist)

    def destroy_node(self):
        self.launch_manager.stop_active_launch()
        super().destroy_node()

    def battery_voltage_callback(self, msg):
        self.battery_voltage = msg.data
        self.emit_battery_status()

    def battery_percent_callback(self, msg):
        self.battery_percent = msg.data
        self.emit_battery_status()

    def emit_battery_status(self):
        socketio.emit('battery_status', {
            'voltage': round(self.battery_voltage, 2),
            'percent': round(self.battery_percent, 1)
        })

    def odom_callback(self, msg):
        import math
        vx = msg.twist.twist.linear.x
        wz = msg.twist.twist.angular.z
        x = msg.pose.pose.position.x
        y = msg.pose.pose.position.y
        
        # Calculate yaw orientation from quaternion (z, w)
        qz = msg.pose.pose.orientation.z
        qw = msg.pose.pose.orientation.w
        yaw = 2.0 * math.atan2(qz, qw)
        # Normalize to -pi to pi range
        if yaw > math.pi:
            yaw -= 2.0 * math.pi
        elif yaw < -math.pi:
            yaw += 2.0 * math.pi

        socketio.emit('odom_status', {
            'vx': round(vx, 3),
            'wz': round(wz, 3),
            'x': round(x, 3),
            'y': round(y, 3),
            'yaw': round(yaw, 3)
        })

    def map_callback(self, msg):
        try:
            origin = {
                'x': msg.info.origin.position.x,
                'y': msg.info.origin.position.y,
                'qz': msg.info.origin.orientation.z,
                'qw': msg.info.origin.orientation.w
            }
            map_info = {
                'resolution': msg.info.resolution,
                'width': msg.info.width,
                'height': msg.info.height,
                'origin': origin
            }
            map_data_list = list(msg.data)
            
            socketio.emit('map_status', {
                'info': map_info,
                'data': map_data_list
            })
        except Exception as e:
            self.get_logger().error(f"Error in map_callback: {e}")

    def scan_callback(self, msg):
        try:
            import math
            if hasattr(msg.header, 'frame_id') and msg.header.frame_id:
                self.scan_frame_id = msg.header.frame_id
            ranges_list = []
            for r in msg.ranges:
                if math.isnan(r) or math.isinf(r):
                    ranges_list.append(999.0)
                else:
                    ranges_list.append(round(r, 3))

            scan_data = {
                'angle_min': msg.angle_min,
                'angle_max': msg.angle_max,
                'angle_increment': msg.angle_increment,
                'range_min': msg.range_min,
                'range_max': msg.range_max,
                'ranges': ranges_list
            }
            socketio.emit('scan_status', scan_data)
        except Exception as e:
            self.get_logger().error(f"Error in scan_callback: {e}")

    def tf_timer_callback(self):
        if not HAS_TF2:
            return

        import math
        # Look up robot pose in 'map' frame first, falling back to 'odom'
        robot_pose = None
        used_frame = None

        for frame in ['map', 'odom']:
            try:
                t_base = self.tf_buffer.lookup_transform(frame, 'base_footprint', rclpy.time.Time())
                bx = t_base.transform.translation.x
                by = t_base.transform.translation.y
                bqx = t_base.transform.rotation.x
                bqy = t_base.transform.rotation.y
                bqz = t_base.transform.rotation.z
                bqw = t_base.transform.rotation.w

                byaw = math.atan2(2.0 * (bqw * bqz + bqx * bqy), 1.0 - 2.0 * (bqy * bqy + bqz * bqz))
                if byaw > math.pi:
                    byaw -= 2.0 * math.pi
                elif byaw < -math.pi:
                    byaw += 2.0 * math.pi

                robot_pose = {'x': round(bx, 3), 'y': round(by, 3), 'yaw': round(byaw, 3)}
                used_frame = frame
                break
            except Exception:
                continue

        if robot_pose is None:
            return

        # Look up laser pose in the same frame
        laser_pose = None
        target_laser_frame = getattr(self, 'scan_frame_id', 'laser') or 'laser'
        for lf in [target_laser_frame, 'laser', 'base_scan']:
            try:
                t_laser = self.tf_buffer.lookup_transform(used_frame, lf, rclpy.time.Time())
                lx = t_laser.transform.translation.x
                ly = t_laser.transform.translation.y
                lqx = t_laser.transform.rotation.x
                lqy = t_laser.transform.rotation.y
                lqz = t_laser.transform.rotation.z
                lqw = t_laser.transform.rotation.w

                lyaw = math.atan2(2.0 * (lqw * lqz + lqx * lqy), 1.0 - 2.0 * (lqy * lqy + lqz * lqz))
                if lyaw > math.pi:
                    lyaw -= 2.0 * math.pi
                elif lyaw < -math.pi:
                    lyaw += 2.0 * math.pi

                laser_pose = {'x': round(lx, 3), 'y': round(ly, 3), 'yaw': round(lyaw, 3)}
                break
            except Exception:
                continue

        payload = {
            'x': robot_pose['x'],
            'y': robot_pose['y'],
            'yaw': robot_pose['yaw'],
            'frame': used_frame
        }
        if laser_pose is not None:
            payload['laser_x'] = laser_pose['x']
            payload['laser_y'] = laser_pose['y']
            payload['laser_yaw'] = laser_pose['yaw']

        socketio.emit('map_pose_status', payload)

    def amcl_pose_callback(self, msg):
        try:
            import math
            x = msg.pose.pose.position.x
            y = msg.pose.pose.position.y
            
            qz = msg.pose.pose.orientation.z
            qw = msg.pose.pose.orientation.w
            yaw = 2.0 * math.atan2(qz, qw)
            if yaw > math.pi:
                yaw -= 2.0 * math.pi
            elif yaw < -math.pi:
                yaw += 2.0 * math.pi

            socketio.emit('amcl_pose_status', {
                'x': round(x, 3),
                'y': round(y, 3),
                'yaw': round(yaw, 3)
            })
        except Exception as e:
            self.get_logger().error(f"Error in amcl_pose_callback: {e}")

    def plan_callback(self, msg):
        try:
            points = [
                {'x': round(p.pose.position.x, 3), 'y': round(p.pose.position.y, 3)}
                for p in msg.poses
            ]
            socketio.emit('plan_status', {'points': points})
        except Exception as e:
            self.get_logger().error(f"Error in plan_callback: {e}")

    def detect_wifi_interface(self):
        """Find the wifi interface name using nmcli or default to wlan0"""
        ret, stdout, stderr = run_cmd("nmcli -t -f DEVICE,TYPE device")
        if ret == 0 and stdout:
            for line in stdout.split('\n'):
                parts = line.split(':')
                if len(parts) >= 2 and parts[1] == 'wifi':
                    return parts[0]
        return "wlan0"

    def system_metrics_timer_callback(self):
        if not psutil:
            return

        try:
            cpu = psutil.cpu_percent()
            ram = psutil.virtual_memory().percent
            disk = psutil.disk_usage('/').percent
            
            # Network throughput calculation
            curr_time = time.time()
            dt = curr_time - self.last_net_time
            io_stats = psutil.net_io_counters()
            
            sent_diff = io_stats.bytes_sent - self.last_bytes_sent
            recv_diff = io_stats.bytes_recv - self.last_bytes_recv
            
            self.last_bytes_sent = io_stats.bytes_sent
            self.last_bytes_recv = io_stats.bytes_recv
            self.last_net_time = curr_time
            
            tx_speed = (sent_diff / dt) / 1024.0 if dt > 0 else 0.0 # KB/s
            rx_speed = (recv_diff / dt) / 1024.0 if dt > 0 else 0.0 # KB/s

            # Get WiFi signal strength if connected
            signal_strength = 0
            ssid = ""
            active_conn = ""
            mode = "sta"

            # Check if AP connection is active
            ret, stdout, stderr = run_cmd("nmcli -t -f NAME,TYPE,DEVICE connection show --active")
            if ret == 0 and stdout:
                for line in stdout.split('\n'):
                    parts = line.split(':')
                    if len(parts) >= 3:
                        conn_name, conn_type, device = parts[0], parts[1], parts[2]
                        if conn_type == '802-11-wireless' and device == self.wifi_interface:
                            active_conn = conn_name
                            # Check if the connection profile is AP
                            # To check mode, run nmcli connection show <name> | grep wireless.mode
                            m_ret, m_stdout, _ = run_cmd(f"nmcli -t -f 802-11-wireless.mode connection show '{conn_name}'")
                            if m_ret == 0 and "ap" in m_stdout:
                                mode = "ap"
                            break

            # Get SSID and signal strength for STA mode
            if mode == "sta":
                # Find current active AP signal
                s_ret, s_stdout, _ = run_cmd("nmcli -t -f IN-USE,SSID,SIGNAL dev wifi")
                if s_ret == 0 and s_stdout:
                    for line in s_stdout.split('\n'):
                        if line.startswith('*'):
                            parts = line.split(':')
                            if len(parts) >= 3:
                                ssid = parts[1]
                                try:
                                    signal_strength = int(parts[2])
                                except ValueError:
                                    signal_strength = 0
                                break
            else:
                ssid = active_conn if active_conn else "hbot_ap_hotspot"

            # Get IP Address
            ip_address = "127.0.0.1"
            ip_ret, ip_stdout, _ = run_cmd("hostname -I")
            if ip_ret == 0 and ip_stdout:
                ips = ip_stdout.split()
                if ips:
                    ip_address = ips[0]

            socketio.emit('system_status', {
                'cpu': cpu,
                'ram': ram,
                'disk': disk,
                'ip': ip_address,
                'wifi_interface': self.wifi_interface,
                'wifi_mode': mode,
                'ssid': ssid,
                'signal': signal_strength,
                'tx_speed': round(tx_speed, 1),
                'rx_speed': round(rx_speed, 1)
            })

        except Exception as e:
            self.get_logger().error(f"Error in system_metrics_timer_callback: {e}")

# --- Flask Server Routes ---

@app.route('/')
def index():
    return render_template('index.html')

# --- SocketIO Command Handlers ---

@socketio.on('teleop_cmd')
def handle_teleop_cmd(data):
    if not ros_node or ros_node.estop_active:
        return
    try:
        linear_x = float(data.get('x', 0.0))
        angular_z = float(data.get('z', 0.0))
        
        twist = Twist()
        twist.linear.x = linear_x
        twist.angular.z = angular_z
        ros_node.cmd_vel_pub.publish(twist)
    except Exception as e:
        ros_node.get_logger().error(f"Error publishing Twist command: {e}")

@socketio.on('initialpose_cmd')
def handle_initialpose_cmd(data):
    if not ros_node:
        return
    try:
        x = float(data.get('x', 0.0))
        y = float(data.get('y', 0.0))
        yaw = float(data.get('yaw', 0.0))

        import math
        qz = math.sin(yaw / 2.0)
        qw = math.cos(yaw / 2.0)

        msg = PoseWithCovarianceStamped()
        msg.header.frame_id = 'map'
        msg.header.stamp = ros_node.get_clock().now().to_msg()

        msg.pose.pose.position.x = x
        msg.pose.pose.position.y = y
        msg.pose.pose.position.z = 0.0
        msg.pose.pose.orientation.x = 0.0
        msg.pose.pose.orientation.y = 0.0
        msg.pose.pose.orientation.z = qz
        msg.pose.pose.orientation.w = qw

        msg.pose.covariance = [
            0.25, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.25, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.068
        ]

        ros_node.initial_pose_pub.publish(msg)
        ros_node.get_logger().info(f"Published Initial Pose from WebUI: x={x:.2f}, y={y:.2f}, yaw={yaw:.2f}")
    except Exception as e:
        ros_node.get_logger().error(f"Error publishing Initial Pose: {e}")

@socketio.on('goal_pose_cmd')
def handle_goal_pose_cmd(data):
    if not ros_node:
        return
    try:
        x = float(data.get('x', 0.0))
        y = float(data.get('y', 0.0))
        yaw = float(data.get('yaw', 0.0))

        import math
        qz = math.sin(yaw / 2.0)
        qw = math.cos(yaw / 2.0)

        msg = PoseStamped()
        msg.header.frame_id = 'map'
        msg.header.stamp = ros_node.get_clock().now().to_msg()

        msg.pose.position.x = x
        msg.pose.position.y = y
        msg.pose.position.z = 0.0
        msg.pose.orientation.x = 0.0
        msg.pose.orientation.y = 0.0
        msg.pose.orientation.z = qz
        msg.pose.orientation.w = qw

        ros_node.goal_pose_pub.publish(msg)
        ros_node.get_logger().info(f"Published Nav Goal from WebUI: x={x:.2f}, y={y:.2f}, yaw={yaw:.2f}")
    except Exception as e:
        ros_node.get_logger().error(f"Error publishing Nav Goal: {e}")

@socketio.on('estop_toggle')
def handle_estop_toggle(data):
    if not ros_node:
        return
    state = bool(data.get('active', False))
    ros_node.estop_active = state
    ros_node.get_logger().info(f"E-Stop toggle: {state}")
    socketio.emit('estop_status', {'active': state})

@socketio.on('switch_mode')
def handle_switch_mode(data):
    if not ros_node:
        return
    mode = data.get('mode')  # 'mapping', 'navigation', or 'idle'
    map_id = data.get('map_id')  # required for 'navigation'

    # Clear any stale path plan overlay from a previous navigation session
    socketio.emit('plan_status', {'points': []})

    if mode == 'mapping':
        ros_node.launch_manager.start_mapping_mode()
        emit('mode_status', {
            'mode': 'mapping',
            'active_map': None,
            'message': 'Switched to Mapping Mode (SLAM Toolbox)'
        }, broadcast=True)
    elif mode == 'navigation':
        if not map_id:
            emit('mode_status', {'success': False, 'message': 'Map ID is required for navigation'})
            return
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT name, yaml_path FROM maps WHERE id = ?", (map_id,))
            row = cursor.fetchone()
            cursor.execute("UPDATE maps SET is_active = 0")
            cursor.execute("UPDATE maps SET is_active = 1 WHERE id = ?", (map_id,))
            conn.commit()
            conn.close()
            
            if row:
                map_name, yaml_path = row[0], row[1]
                ros_node.launch_manager.start_navigation_mode(map_name, yaml_path)
                emit('mode_status', {
                    'mode': 'navigation',
                    'active_map': map_name,
                    'message': f"Switched to Navigation Mode with map: {map_name}"
                }, broadcast=True)
            else:
                emit('mode_status', {'success': False, 'message': 'Map ID not found in database'})
        except Exception as e:
            emit('mode_status', {'success': False, 'message': f"Database error: {e}"})
    else:
        ros_node.launch_manager.stop_active_launch()
        emit('mode_status', {
            'mode': 'idle',
            'active_map': None,
            'message': 'System idle (launches stopped)'
        }, broadcast=True)

@socketio.on('get_mode_status')
def handle_get_mode_status():
    if not ros_node:
        return
    emit('mode_status', {
        'mode': ros_node.launch_manager.current_mode or 'idle',
        'active_map': ros_node.launch_manager.active_map,
        'estop_active': ros_node.estop_active
    })

@socketio.on('save_map')
def handle_save_map(data):
    if not ros_node:
        return
    map_name = data.get('name', '').strip()
    if not map_name:
        emit('save_map_response', {'success': False, 'message': 'Map name is required'})
        return
        
    ros_node.get_logger().info(f"Saving map: {map_name} to {MAPS_DIR}...")
    base_path = os.path.join(MAPS_DIR, map_name)
    yaml_path = base_path + ".yaml"
    pgm_path = base_path + ".pgm"
    
    cmd = f"ros2 run nav2_map_server map_saver_cli -f '{base_path}'"
    
    def run_map_saver():
        ret, stdout, stderr = run_cmd(cmd, timeout=15)
        if ret == 0 and os.path.exists(yaml_path):
            db_success = save_map_to_db(map_name, yaml_path, pgm_path)
            if db_success:
                socketio.emit('save_map_response', {
                    'success': True,
                    'message': f"Map '{map_name}' saved and registered successfully!",
                    'map_name': map_name
                })
                # Broadcast list update
                maps = get_all_maps()
                socketio.emit('maps_list', maps)
            else:
                socketio.emit('save_map_response', {'success': False, 'message': 'Map saved, but failed to write to database'})
        else:
            ros_node.get_logger().error(f"Map saver failed: {stderr or stdout}")
            socketio.emit('save_map_response', {'success': False, 'message': f"Map saver failed: {stderr or stdout}"})
            
    threading.Thread(target=run_map_saver, daemon=True).start()

@socketio.on('list_maps')
def handle_list_maps():
    maps = get_all_maps()
    emit('maps_list', maps)

@socketio.on('delete_map')
def handle_delete_map(data):
    map_id = data.get('id')
    if not map_id:
        return
    success = delete_map_from_db(map_id)
    if success:
        emit('delete_map_response', {'success': True, 'message': 'Map deleted successfully'})
        maps = get_all_maps()
        socketio.emit('maps_list', maps)
    else:
        emit('delete_map_response', {'success': False, 'message': 'Failed to delete map'})

@socketio.on('wifi_scan')
def handle_wifi_scan():
    if not ros_node:
        return
    ros_node.get_logger().info("Scanning for WiFi networks...")
    # Rescan to find new APs (timeout 15s)
    run_cmd("nmcli dev wifi rescan", timeout=15)
    # Fetch scan results
    ret, stdout, stderr = run_cmd("nmcli -t -f SSID,SIGNAL,SECURITY dev wifi list", timeout=10)
    networks = []
    seen_ssids = set()
    if ret == 0 and stdout:
        for line in stdout.split('\n'):
            if not line:
                continue
            # Splitting needs to handle double colons or special chars carefully
            # Format: SSID:SIGNAL:SECURITY
            parts = line.split(':')
            if len(parts) >= 3:
                # Signal is usually the second from last, Security is last
                security = parts[-1]
                signal_str = parts[-2]
                ssid = ":".join(parts[:-2])
                
                if not ssid:  # Skip empty SSIDs (hidden networks)
                    continue
                    
                try:
                    signal = int(signal_str)
                except ValueError:
                    signal = 0
                
                # Keep only the strongest signal for duplicate SSIDs
                if ssid in seen_ssids:
                    # Update if signal is stronger
                    for net in networks:
                        if net['ssid'] == ssid and signal > net['signal']:
                            net['signal'] = signal
                    continue
                
                seen_ssids.add(ssid)
                networks.append({
                    'ssid': ssid,
                    'signal': signal,
                    'security': security if security else "Open"
                })
    
    # Sort by signal strength descending
    networks.sort(key=lambda x: x['signal'], reverse=True)
    emit('wifi_scan_results', networks)

@socketio.on('wifi_connect')
def handle_wifi_connect(data):
    if not ros_node:
        return
    ssid = data.get('ssid')
    password = data.get('password')
    
    # Check if AP is currently active
    ret_act, stdout_act, _ = run_cmd("nmcli -t -f NAME connection show --active")
    was_ap_active = False
    if ret_act == 0 and stdout_act:
        was_ap_active = 'hbot_ap' in stdout_act.split('\n')
        
    ros_node.get_logger().info(f"Connecting to WiFi: {ssid} (was AP active: {was_ap_active})")
    
    if was_ap_active:
        # Explicitly bring down hbot_ap first so the interface is freed to connect as a client
        ros_node.get_logger().info("Bringing down hbot_ap before connecting...")
        run_cmd("nmcli connection down hbot_ap")
        time.sleep(1.0)
        
    if password:
        cmd = f'nmcli dev wifi connect "{ssid}" password "{password}"'
    else:
        cmd = f'nmcli dev wifi connect "{ssid}"'
        
    ret, stdout, stderr = run_cmd(cmd, timeout=30)
    if ret == 0:
        ros_node.get_logger().info(f"Connected successfully to {ssid}")
        emit('wifi_connect_response', {'success': True, 'message': f"Connected to {ssid}"})
    else:
        ros_node.get_logger().error(f"Failed to connect to {ssid}: {stderr or stdout}")
        
        # If it was AP mode and connection failed, restore the AP hotspot
        if was_ap_active:
            ros_node.get_logger().info("Restoring AP hotspot connection...")
            run_cmd("nmcli connection up hbot_ap")
            
        emit('wifi_connect_response', {'success': False, 'message': stderr or stdout or "Unknown error"})

@socketio.on('wifi_saved_connections')
def handle_wifi_saved_connections():
    if not ros_node:
        return
    ret, stdout, stderr = run_cmd("nmcli -t -f NAME,TYPE,UUID connection show")
    saved = []
    if ret == 0 and stdout:
        for line in stdout.split('\n'):
            if not line:
                continue
            parts = line.split(':')
            if len(parts) >= 3:
                name, conn_type, uuid = parts[0], parts[1], parts[2]
                # Filter WiFi connections and exclude the AP hotspot profile
                if conn_type == '802-11-wireless' and name != 'hbot_ap':
                    saved.append({
                        'name': name,
                        'uuid': uuid
                    })
    emit('wifi_saved_connections_list', saved)

@socketio.on('wifi_connect_saved')
def handle_wifi_connect_saved(data):
    uuid = data.get('uuid')
    name = data.get('name')
    if not ros_node:
        return
        
    # Check if AP is currently active
    ret_act, stdout_act, _ = run_cmd("nmcli -t -f NAME connection show --active")
    was_ap_active = False
    if ret_act == 0 and stdout_act:
        was_ap_active = 'hbot_ap' in stdout_act.split('\n')
        
    ros_node.get_logger().info(f"Connecting to saved network: {name} ({uuid}) (was AP active: {was_ap_active})")
    
    if was_ap_active:
        # Explicitly bring down hbot_ap first so the interface is freed to connect as a client
        ros_node.get_logger().info("Bringing down hbot_ap before connecting...")
        run_cmd("nmcli connection down hbot_ap")
        time.sleep(1.0)
        
    ret, stdout, stderr = run_cmd(f'nmcli connection up uuid {uuid}', timeout=30)
    if ret == 0:
        emit('wifi_connect_response', {'success': True, 'message': f"Connected to {name}"})
    else:
        ros_node.get_logger().error(f"Failed to connect to saved network {name} ({uuid}): {stderr or stdout}")
        # If it was AP mode and connection failed, restore the AP hotspot
        if was_ap_active:
            ros_node.get_logger().info("Restoring AP hotspot connection...")
            run_cmd("nmcli connection up hbot_ap")
            
        emit('wifi_connect_response', {'success': False, 'message': stderr or stdout or "Failed to connect"})

@socketio.on('wifi_delete_saved')
def handle_wifi_delete_saved(data):
    uuid = data.get('uuid')
    name = data.get('name')
    if not ros_node:
        return
    ros_node.get_logger().info(f"Deleting saved network connection: {name} ({uuid})")
    ret, stdout, stderr = run_cmd(f'nmcli connection delete uuid {uuid}')
    if ret == 0:
        emit('wifi_delete_response', {'success': True, 'message': f"Deleted {name}"})
        # Refresh the list
        handle_wifi_saved_connections()
    else:
        emit('wifi_delete_response', {'success': False, 'message': stderr or stdout or "Failed to delete connection"})

@socketio.on('wifi_set_mode')
def handle_wifi_set_mode(data):
    if not ros_node:
        return
    mode = data.get('mode') # 'ap' or 'sta'
    
    if mode == 'ap':
        ros_node.get_logger().info("Switching to AP Mode...")
        # Check if hbot_ap profile exists, if not, create it
        ret, stdout, _ = run_cmd("nmcli connection show hbot_ap")
        if ret != 0:
            ros_node.get_logger().info("Creating hbot_ap connection profile...")
            # SSID defaults to hbot_ap_xxxx where xxxx is suffix of hostname/MAC
            ssid_suffix = socket.gethostname()[-4:] if len(socket.gethostname()) >= 4 else "robot"
            ap_ssid = f"hbot_ap_{ssid_suffix}"
            
            # Add AP connection
            add_cmd = f'nmcli connection add type wifi ifname {ros_node.wifi_interface} mode ap con-name hbot_ap ssid {ap_ssid}'
            run_cmd(add_cmd)
            # Modify for WPA2 security
            run_cmd('nmcli connection modify hbot_ap 802-11-wireless-security.key-mgmt wpa-psk')
            run_cmd('nmcli connection modify hbot_ap 802-11-wireless-security.psk "12345678"')
            # Modify IPv4 method to shared (starts DHCP server)
            run_cmd('nmcli connection modify hbot_ap ipv4.method shared')
            
        # Bring UP the AP connection
        up_ret, up_stdout, up_stderr = run_cmd("nmcli connection up hbot_ap")
        if up_ret == 0:
            emit('wifi_mode_response', {'success': True, 'mode': 'ap', 'message': "Hotspot is now active!"})
        else:
            ros_node.get_logger().error(f"Failed to activate AP: {up_stderr or up_stdout}")
            emit('wifi_mode_response', {'success': False, 'message': up_stderr or up_stdout or "Failed to activate hotspot"})
            
    elif mode == 'sta':
        ros_node.get_logger().info("Switching to STA Mode...")
        # Bring DOWN the AP connection. NetworkManager will auto-reconnect to a saved STA network
        down_ret, down_stdout, down_stderr = run_cmd("nmcli connection down hbot_ap")
        if down_ret == 0:
            emit('wifi_mode_response', {'success': True, 'mode': 'sta', 'message': "Deactivated hotspot. Connecting to saved WiFi..."})
        else:
            emit('wifi_mode_response', {'success': False, 'message': down_stderr or down_stdout or "Failed to deactivate hotspot"})


def main(args=None):
    global ros_node
    init_db()
    rclpy.init(args=args)
    ros_node = WebNode()

    # Run Flask-SocketIO in a separate thread so ROS node executor can spin in main thread
    flask_thread = threading.Thread(
        target=socketio.run,
        args=(app,),
        kwargs={'host': ros_node.host, 'port': ros_node.port, 'log_output': False, 'allow_unsafe_werkzeug': True},
        daemon=True
    )
    flask_thread.start()

    try:
        rclpy.spin(ros_node)
    except KeyboardInterrupt:
        pass
    finally:
        ros_node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
