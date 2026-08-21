#!/usr/bin/env python3
# coding: utf-8

import os
import sys
import time
import argparse

# Add Rosmaster_Lib to python search path
workspace_dir = os.path.dirname(os.path.abspath(__file__))
lib_path = os.path.join(workspace_dir, 'src', 'hbot_driver', 'Rosmaster_Lib')
sys.path.append(lib_path)

try:
    from Rosmaster_Lib import Rosmaster
except ImportError:
    print(f"Error: Could not import Rosmaster from {lib_path}")
    print("Please make sure you run this script from the workspace root directory.")
    sys.exit(1)


def run_library_test(port, target_rpm, duration):
    print(f"Connecting to Rosmaster via Rosmaster_Lib on {port}...")
    try:
        # Initialize Rosmaster
        bot = Rosmaster(com=port, delay=0.002, debug=False)
        bot.create_receive_threading()
        time.sleep(0.5)  # Let serial receiver thread warm up
        
        # Test connection by getting battery voltage/version
        vol = bot.get_battery_voltage()
        version = bot.get_version()
        print(f"Connected! Firmware Version: {version} | Battery: {vol}V")
        
        print("\nBeeping to alert motor start...")
        bot.set_beep(100)
        time.sleep(0.2)

        print(f"\nSetting motor speeds to target RPM: [{target_rpm}, {target_rpm}, {target_rpm}, {target_rpm}]")
        # bot.set_motor_speed_rpm(target_rpm, target_rpm, target_rpm, target_rpm)
        bot.set_motor(-30, 30, 30, 30)

        start_time = time.time()
        print("\nReading telemetry (Ctrl+C to stop)...")
        print("---------------------------------------------------------------------------------------------------------------------------------")
        print(f"{'Elapsed (s)':<12} | {'M1 (RPM)':<8} | {'M2 (RPM)':<8} | {'M3 (RPM)':<8} | {'M4 (RPM)':<8} || {'M1 (Ticks)':<11} | {'M2 (Ticks)':<11} | {'M3 (Ticks)':<11} | {'M4 (Ticks)':<11}")
        print("---------------------------------------------------------------------------------------------------------------------------------")

        while time.time() - start_time < duration:
            m1, m2, m3, m4 = bot.get_motor_speed_rpm()
            t1, t2, t3, t4 = bot.get_motor_encoder()
            elapsed = time.time() - start_time
            print(f"{elapsed:<12.2f} | {m1:<8d} | {m2:<8d} | {m3:<8d} | {m4:<8d} || {t1:<11d} | {t2:<11d} | {t3:<11d} | {t4:<11d}", end='\r')
            time.sleep(0.1)

        print("\n\nTest duration reached. Stopping motors...")

    except KeyboardInterrupt:
        print("\n\nInterrupted by user. Stopping motors...")
    except Exception as e:
        print(f"\nError occurred: {e}")
    finally:
        # Safety stop: Set target RPM to 0 and raw PWM to 0, flush buffers, and wait
        try:
            bot.set_motor_speed_rpm(0, 0, 0, 0)
            bot.set_motor(0, 0, 0, 0)
            if hasattr(bot.ser, 'flush'):
                bot.ser.flush()
            time.sleep(0.2)
        except:
            pass
        print("Disconnected.")


def run_raw_serial_test(port, target_rpm, duration):
    import serial
    import struct

    HEAD = 0xFF
    DEV = 0xFC
    FUNC_REQUEST_DATA = 0x50
    FUNC_REPORT_MOTOR_SPEED_RPM = 0x16
    FUNC_SET_MOTOR_SPEED_RPM = 0x17

    def pack_frame(func_id: int, payload: bytes) -> bytes:
        length = len(payload) + 3  # len + func + payload + checksum => total - 2
        frame_wo_checksum = bytes([HEAD, DEV, length, func_id]) + payload
        checksum = sum(frame_wo_checksum[2:]) & 0xFF
        return frame_wo_checksum + bytes([checksum])

    def parse_frame(frame: bytes):
        if len(frame) < 6 or frame[0] != HEAD:
            return None
        length = frame[2]
        if len(frame) != length + 2:
            return None
        if (sum(frame[2:-1]) & 0xFF) != frame[-1]:
            return None
        func = frame[3]
        payload = frame[4:-1]
        return func, payload

    print(f"Connecting to raw serial on {port} (115200 8N1)...")
    try:
        with serial.Serial(port, 115200, timeout=0.5) as ser:
            ser.reset_input_buffer()
            
            # Send beep command via raw serial just to test connection
            # FUNC_BEEP (0x02), payload: duration in ms (100 ms => struct.pack('h', 100))
            ser.write(pack_frame(0x02, struct.pack('<h', 100)))
            time.sleep(0.2)

            print(f"Setting target RPM speed to {target_rpm} for M1..M4...")
            target_payload = struct.pack('<hhhh', target_rpm, target_rpm, target_rpm, target_rpm)
            ser.write(pack_frame(FUNC_SET_MOTOR_SPEED_RPM, target_payload))
            time.sleep(0.05)

            start_time = time.time()
            print("\nReading measured RPM (Ctrl+C to stop)...")
            print("-----------------------------------------------------------------")
            print(f"{'Elapsed (s)':<12} | {'M1 (RPM)':<8} | {'M2 (RPM)':<8} | {'M3 (RPM)':<8} | {'M4 (RPM)':<8}")
            print("-----------------------------------------------------------------")

            request_cmd = pack_frame(FUNC_REQUEST_DATA, bytes([FUNC_REPORT_MOTOR_SPEED_RPM, 0x00]))

            while time.time() - start_time < duration:
                # Request RPM
                ser.write(request_cmd)
                time.sleep(0.05)
                
                # 13 bytes expected for RPM report
                resp = ser.read(13)
                parsed = parse_frame(resp)
                
                m1, m2, m3, m4 = 0, 0, 0, 0
                if parsed and parsed[0] == FUNC_REPORT_MOTOR_SPEED_RPM and len(parsed[1]) == 8:
                    m1, m2, m3, m4 = struct.unpack('<hhhh', parsed[1])
                
                elapsed = time.time() - start_time
                print(f"{elapsed:<12.2f} | {m1:<8d} | {m2:<8d} | {m3:<8d} | {m4:<8d}", end='\r')
                time.sleep(0.05)

            print("\n\nTest duration reached. Stopping motors...")
            ser.write(pack_frame(FUNC_SET_MOTOR_SPEED_RPM, struct.pack('<hhhh', 0, 0, 0, 0)))
            ser.write(pack_frame(0x10, bytes([0, 0, 0, 0])))
            ser.flush()
            time.sleep(0.2)

    except KeyboardInterrupt:
        print("\n\nInterrupted by user. Stopping motors...")
        try:
            with serial.Serial(port, 115200, timeout=0.5) as ser:
                ser.write(pack_frame(FUNC_SET_MOTOR_SPEED_RPM, struct.pack('<hhhh', 0, 0, 0, 0)))
                ser.write(pack_frame(0x10, bytes([0, 0, 0, 0])))
                ser.flush()
                time.sleep(0.2)
        except:
            pass
    except Exception as e:
        print(f"\nError occurred: {e}")
    finally:
        print("Disconnected.")


def main():
    parser = argparse.ArgumentParser(description="Test script for HBOT RPM-based motor commands.")
    parser.add_argument("--port", type=str, default="/dev/myserial", help="Serial port of the Rosmaster board (default: /dev/myserial)")
    parser.add_argument("--speed", type=int, default=50, help="Target RPM speed for motors (default: 50)")
    parser.add_argument("--duration", type=float, default=5.0, help="Test duration in seconds (default: 5.0)")
    parser.add_argument("--raw", action="store_true", help="Run using raw serial communication instead of Rosmaster_Lib")
    args = parser.parse_args()

    if args.raw:
        run_raw_serial_test(args.port, args.speed, args.duration)
    else:
        run_library_test(args.port, args.speed, args.duration)


if __name__ == "__main__":
    main()
