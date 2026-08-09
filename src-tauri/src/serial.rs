use crate::error::{CommandError, CommandResult};
use serde::Serialize;
use serialport::{available_ports, SerialPort, SerialPortInfo, SerialPortType};
use std::collections::HashMap;
#[cfg(target_os = "macos")]
use std::collections::HashSet;
use std::io::{ErrorKind, Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// 프론트엔드(`src/adapters/serial.ts`)의 상수와 반드시 동일해야 한다.
pub const DATA_EVENT: &str = "serial://data";
pub const ERROR_EVENT: &str = "serial://error";
pub const CLOSED_EVENT: &str = "serial://closed";

/// stop 플래그 확인 주기이자, 포트 닫힘이 반영되는 최대 지연 시간.
const READ_POLL_MS: u64 = 50;
const WRITE_TIMEOUT_MS: u64 = 1000;
const READ_BUFFER_SIZE: usize = 4096;

#[derive(Debug, Serialize)]
pub struct PortInfo {
    pub path: String,
    pub port_type: String,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
}

#[derive(Clone, Serialize)]
struct DataEvent {
    path: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct ErrorEvent {
    path: String,
    code: String,
    message: String,
}

#[derive(Clone, Serialize)]
struct ClosedEvent {
    path: String,
}

/// 읽기는 `try_clone` 한 별도 핸들로 처리해, 잠금을 잡지 않고 쓰기를 막지 않게 한다.
struct OpenPort {
    writer: Box<dyn SerialPort>,
    stop: Arc<AtomicBool>,
    reader: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct SerialState {
    ports: Mutex<HashMap<String, OpenPort>>,
}

#[cfg(target_os = "macos")]
fn prefer_callout_ports(ports: Vec<SerialPortInfo>) -> Vec<SerialPortInfo> {
    let callout_suffixes = ports
        .iter()
        .filter_map(|port| port.port_name.strip_prefix("/dev/cu."))
        .map(str::to_owned)
        .collect::<HashSet<_>>();

    ports
        .into_iter()
        .filter(|port| match port.port_name.strip_prefix("/dev/tty.") {
            Some(suffix) => !callout_suffixes.contains(suffix),
            None => true,
        })
        .collect()
}

#[cfg(not(target_os = "macos"))]
fn prefer_callout_ports(ports: Vec<SerialPortInfo>) -> Vec<SerialPortInfo> {
    ports
}

#[tauri::command]
pub fn serial_list_ports() -> CommandResult<Vec<PortInfo>> {
    let ports = available_ports()
        .map_err(|e| CommandError::serial("시리얼 포트 열거에 실패했습니다", e, "unavailable"))?;
    Ok(prefer_callout_ports(ports)
        .into_iter()
        .map(|p| {
            let (port_type, manufacturer, product, serial_number, vid, pid) = match &p.port_type {
                SerialPortType::UsbPort(usb) => (
                    "usb".to_string(),
                    usb.manufacturer.clone(),
                    usb.product.clone(),
                    usb.serial_number.clone(),
                    Some(usb.vid),
                    Some(usb.pid),
                ),
                SerialPortType::BluetoothPort => {
                    ("bluetooth".to_string(), None, None, None, None, None)
                }
                SerialPortType::PciPort => ("pci".to_string(), None, None, None, None, None),
                SerialPortType::Unknown => ("unknown".to_string(), None, None, None, None, None),
            };
            PortInfo {
                path: p.port_name,
                port_type,
                manufacturer,
                product,
                serial_number,
                vid,
                pid,
            }
        })
        .collect())
}

#[tauri::command]
pub fn serial_open(
    app: AppHandle,
    state: State<'_, SerialState>,
    path: String,
    baud_rate: u32,
) -> CommandResult<()> {
    let mut ports = state
        .ports
        .lock()
        .map_err(|e| CommandError::internal(e.to_string()))?;
    if ports.contains_key(&path) {
        return Err(CommandError::new(
            "already-open",
            format!("Port \"{path}\" is already open"),
        ));
    }

    let writer = serialport::new(&path, baud_rate)
        .timeout(Duration::from_millis(WRITE_TIMEOUT_MS))
        .open()
        .map_err(|e| CommandError::serial("시리얼 포트를 열지 못했습니다", e, "unavailable"))?;

    let mut reader = writer.try_clone().map_err(|e| {
        CommandError::serial("시리얼 읽기 핸들을 만들지 못했습니다", e, "disconnected")
    })?;
    reader
        .set_timeout(Duration::from_millis(READ_POLL_MS))
        .map_err(|e| {
            CommandError::serial(
                "시리얼 읽기 타임아웃을 설정하지 못했습니다",
                e,
                "disconnected",
            )
        })?;

    let stop = Arc::new(AtomicBool::new(false));
    let handle = spawn_read_loop(app, path.clone(), reader, stop.clone());

    ports.insert(
        path,
        OpenPort {
            writer,
            stop,
            reader: Some(handle),
        },
    );
    Ok(())
}

fn spawn_read_loop(
    app: AppHandle,
    path: String,
    mut reader: Box<dyn SerialPort>,
    stop: Arc<AtomicBool>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = vec![0u8; READ_BUFFER_SIZE];
        while !stop.load(Ordering::Relaxed) {
            match reader.read(&mut buf) {
                Ok(0) => {}
                Ok(n) => {
                    let _ = app.emit(
                        DATA_EVENT,
                        DataEvent {
                            path: path.clone(),
                            data: buf[..n].to_vec(),
                        },
                    );
                }
                // 타임아웃은 stop 플래그 확인 지점이고, 인터럽트는 재시도 대상이다.
                Err(e) if e.kind() == ErrorKind::TimedOut => {}
                Err(e) if e.kind() == ErrorKind::Interrupted => {}
                Err(e) => {
                    let _ = app.emit(
                        ERROR_EVENT,
                        ErrorEvent {
                            path: path.clone(),
                            code: "disconnected".to_string(),
                            message: e.to_string(),
                        },
                    );
                    break;
                }
            }
        }
        let _ = app.emit(CLOSED_EVENT, ClosedEvent { path });
    })
}

#[tauri::command]
pub fn serial_close(state: State<'_, SerialState>, path: String) -> CommandResult<()> {
    let mut ports = state
        .ports
        .lock()
        .map_err(|e| CommandError::internal(e.to_string()))?;
    let mut entry = ports
        .remove(&path)
        .ok_or_else(|| CommandError::new("disconnected", "Port not open"))?;
    // 리더는 복제된 핸들을 쓰므로 writer 를 드롭해도 멈추지 않는다.
    entry.stop.store(true, Ordering::Relaxed);
    drop(ports);

    // 스레드가 fd 를 놓기 전에 재개방하면 배타적 잠금 획득에 실패한다.
    if let Some(handle) = entry.reader.take() {
        handle
            .join()
            .map_err(|_| CommandError::internal("Reader thread panicked"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn serial_write(
    state: State<'_, SerialState>,
    path: String,
    data: Vec<u8>,
) -> CommandResult<usize> {
    let mut ports = state
        .ports
        .lock()
        .map_err(|e| CommandError::internal(e.to_string()))?;
    let entry = ports
        .get_mut(&path)
        .ok_or_else(|| CommandError::new("disconnected", "Port not open"))?;
    entry
        .writer
        .write(&data)
        .map_err(|e| CommandError::new("io", format!("시리얼 쓰기에 실패했습니다: {e}")))
}
