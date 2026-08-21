# Source Changes and PC Serial API Guide

This document records the firmware changes made in this migration and explains how to use the updated serial API from a PC host.

## 1) What changed in source code

### 1.1 Build system migration (Keil -> STM32Cube + CMake)

Added files:
- `V3.5.1/CMakeLists.txt`
- `V3.5.1/CMakePresets.json`
- `V3.5.1/gcc-arm-none-eabi.cmake`
- `V3.5.1/cmake/target.cmake`
- `V3.5.1/cmake/flags.cmake`
- `V3.5.1/cmake/files.cmake`
- `V3.5.1/STM32F103RCTx_FLASH.ld`
- `V3.5.1/CMSIS/startup_stm32f10x_hd_gcc.s`
- `V3.5.1/Source/Src/syscalls.c`
- `V3.5.1/Source/Src/sysmem.c`

Updated for GCC compatibility:
- `V3.5.1/FreeRTOS/src/port.c`
- `V3.5.1/FreeRTOS/inc/portmacro.h`
- `V3.5.1/CMSIS/core_cm3.c`

### 1.2 Motion/RPM logic update

Updated file:
- `V3.5.1/Source/APP/app_motion.c`

Behavior changes:
- Motor RPM reporting now comes from raw encoder pulse delta (`g_Encoder_All_Offset`) every 10 ms.
- New conversion helper `Motion_Pulse_10ms_To_RPM(...)` is used for telemetry.
- Existing RPM command input still maps to internal mm/s control via `Motion_RPM_To_MM_S(...)`.

Why this matters:
- Reported RPM now reflects measured wheel motion directly.
- Command path and telemetry path are separated, so kinematic parameters no longer bias RPM readback.

### 1.3 Protocol command coverage for RPM API

Relevant IDs in `V3.5.1/Source/APP/protocol.h`:
- `FUNC_REPORT_MOTOR_SPEED_RPM = 0x16` (response/report)
- `FUNC_SET_MOTOR_SPEED_RPM = 0x17` (command)
- `FUNC_REQUEST_DATA = 0x50` (request wrapper)

Relevant handlers in `V3.5.1/Source/APP/protocol.c`:
- `FUNC_SET_MOTOR_SPEED_RPM`: calls `Motion_Set_Motor_Speed_RPM(m1, m2, m3, m4)`
- `FUNC_REQUEST_DATA` with request `0x16`: triggers `Motion_Send_Motor_Speed_RPM()`

## 2) PC serial API (updated usage)

### 2.1 Serial port settings

Host command channel is USART1 (`V3.5.1/Source/BSP/bsp_usart.h`):
- Baud: `115200`
- Data bits: `8`
- Parity: `N`
- Stop bits: `1`

Use `115200 8N1` on the PC.

### 2.2 Frame format

RX command frame to board:
- Byte 0: `0xFF` (header)
- Byte 1: `0xFC` (device ID)
- Byte 2: `len` where `len = total_frame_bytes - 2`
- Byte 3: `func`
- Byte 4..N-2: payload
- Byte N-1: checksum

TX response frame from board:
- Byte 0: `0xFF`
- Byte 1: `0xFB` (`PTO_DEVICE_ID - 1`)
- Byte 2..: same length/checksum convention

Checksum:
- `checksum = sum(frame[2] ... frame[N-2]) & 0xFF`

Multi-byte fields:
- 16-bit values are little-endian.

### 2.3 New/updated RPM commands

1) Set closed-loop motor target RPM (function `0x17`):
- Payload: `m1_l, m1_h, m2_l, m2_h, m3_l, m3_h, m4_l, m4_h`
- Value type: signed int16 RPM per wheel
- Full frame length: 13 bytes total (`len = 11`)

2) Request measured motor RPM report (wrapper function `0x50`):
- Payload: `request=0x16, param=0x00`
- Full frame length: 7 bytes total (`len = 5`)

3) RPM report returned by board (function `0x16`):
- Payload: `m1_l, m1_h, m2_l, m2_h, m3_l, m3_h, m4_l, m4_h`
- Value type: signed int16 measured RPM from raw encoder deltas
- Full frame length: 13 bytes total (`len = 11`)

## 3) Example byte frames

### 3.1 Request RPM report

Command:
- `FF FC 05 50 16 00 6B`

Breakdown:
- `05`: len (`7 - 2`)
- `50`: request wrapper
- `16`: request RPM report
- `00`: param
- `6B`: checksum of `05 + 50 + 16 + 00`

### 3.2 Set RPM targets m1..m4 = 100, 100, 100, 100

100 decimal = `0x0064` (little-endian `64 00`):
- `FF FC 0B 17 64 00 64 00 64 00 64 00 B2`

## 4) Python host example (pyserial)

```python
import struct
import serial
import time

HEAD = 0xFF
DEV  = 0xFC

FUNC_REQUEST_DATA = 0x50
FUNC_REPORT_MOTOR_SPEED_RPM = 0x16
FUNC_SET_MOTOR_SPEED_RPM = 0x17


def pack_frame(func_id: int, payload: bytes) -> bytes:
    length = len(payload) + 3  # len + func + payload + checksum => total-2
    frame_wo_checksum = bytes([HEAD, DEV, length, func_id]) + payload
    checksum = sum(frame_wo_checksum[2:]) & 0xFF
    return frame_wo_checksum + bytes([checksum])


def request_rpm_frame() -> bytes:
    payload = bytes([FUNC_REPORT_MOTOR_SPEED_RPM, 0x00])
    return pack_frame(FUNC_REQUEST_DATA, payload)


def set_rpm_frame(m1: int, m2: int, m3: int, m4: int) -> bytes:
    payload = struct.pack('<hhhh', m1, m2, m3, m4)
    return pack_frame(FUNC_SET_MOTOR_SPEED_RPM, payload)


def parse_frame(frame: bytes):
    if len(frame) < 6 or frame[0] != 0xFF:
        return None
    length = frame[2]
    if len(frame) != length + 2:
        return None
    if (sum(frame[2:-1]) & 0xFF) != frame[-1]:
        return None
    func = frame[3]
    payload = frame[4:-1]
    return func, payload


with serial.Serial('/dev/ttyUSB0', 115200, timeout=0.5) as ser:
    # 1) Flush any old data in the buffer
    ser.reset_input_buffer()

    # Configure target RPM for each motor
    target_rpm_m1 = 100
    target_rpm_m2 = 100
    target_rpm_m3 = 100
    target_rpm_m4 = 100

    # 2) Set target RPM
    print(f'Setting RPM to {target_rpm_m1}, {target_rpm_m2}, {target_rpm_m3}, {target_rpm_m4} for motors M1..M4...')
    ser.write(set_rpm_frame(target_rpm_m1, target_rpm_m2, target_rpm_m3, target_rpm_m4))
    time.sleep(0.05)  # 50ms delay to let board process

    # 3) Request measured RPM
    print('Requesting measured RPM...')
    ser.write(request_rpm_frame())

    # 4) Read one response frame (13 bytes expected for RPM report)
    # Give board time to queue and send the response (main loop runs every ~10ms)
    time.sleep(0.1)  # 100ms delay for board to prepare response
    resp = ser.read(13)

    print(f'Received {len(resp)} bytes: {resp.hex()}')

    parsed = parse_frame(resp)
    if parsed and parsed[0] == FUNC_REPORT_MOTOR_SPEED_RPM and len(parsed[1]) == 8:
        m1, m2, m3, m4 = struct.unpack('<hhhh', parsed[1])
        print('Measured RPM:', m1, m2, m3, m4)
    else:
        print('No valid RPM response')
        if parsed:
            print(f'  Parsed: func=0x{parsed[0]:02X}, payload_len={len(parsed[1])}')
        else:
            print(f'  Frame parse failed')
```

## 5) Compatibility notes

- Existing motion command `FUNC_MOTION (0x12)` remains valid and uses `Vx/Vy/Vz`.
- New RPM set/report API is intended for wheel-speed-oriented control and diagnostics.
- On receive, frame parser limit is `PTO_MAX_BUF_LEN = 20`; keep command frames short.
- Verify wheel order mapping on your robot setup (M1..M4 physical placement may differ by chassis wiring).
