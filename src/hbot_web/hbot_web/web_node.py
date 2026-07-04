import os
import sys
import time
import socket
import threading
import subprocess
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from std_msgs.msg import Float32
from nav_msgs.msg import Odometry
from rclpy.parameter import ParameterType
from rcl_interfaces.msg import ParameterDescriptor

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

        # Get parameter values
        self.host = self.get_parameter('host').value
        self.port = self.get_parameter('port').value
        self.cmd_vel_topic = self.get_parameter('cmd_vel_topic').value
        self.battery_voltage_topic = self.get_parameter('battery_voltage_topic').value
        self.battery_percent_topic = self.get_parameter('battery_percent_topic').value

        self.get_logger().info(f"Starting hbot_web_node on {self.host}:{self.port}")

        # Publishers
        self.cmd_vel_pub = self.create_publisher(Twist, self.cmd_vel_topic, 10)

        # Subscribers
        self.battery_voltage = 0.0
        self.battery_percent = 0.0
        self.create_subscription(Float32, self.battery_voltage_topic, self.battery_voltage_callback, 10)
        self.create_subscription(Float32, self.battery_percent_topic, self.battery_percent_callback, 10)
        self.create_subscription(Odometry, 'odom', self.odom_callback, 10)

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
    if not ros_node:
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
