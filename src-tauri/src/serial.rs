use serde::Serialize;
use serialport::{available_ports, SerialPortType};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

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

pub struct SerialState {
    pub ports: Mutex<HashMap<String, Box<dyn serialport::SerialPort>>>,
}

impl Default for SerialState {
    fn default() -> Self {
        Self {
            ports: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn serial_list_ports() -> Result<Vec<PortInfo>, String> {
    let ports = available_ports().map_err(|e| e.to_string())?;
    Ok(ports
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
    state: State<'_, SerialState>,
    path: String,
    baud_rate: u32,
) -> Result<(), String> {
    let port = serialport::new(&path, baud_rate)
        .timeout(Duration::from_millis(1000))
        .open()
        .map_err(|e| e.to_string())?;

    let mut ports = state.ports.lock().map_err(|e| e.to_string())?;
    ports.insert(path, port);
    Ok(())
}

#[tauri::command]
pub fn serial_close(state: State<'_, SerialState>, path: String) -> Result<(), String> {
    let mut ports = state.ports.lock().map_err(|e| e.to_string())?;
    ports.remove(&path).ok_or("Port not open")?;
    Ok(())
}

#[tauri::command]
pub fn serial_write(
    state: State<'_, SerialState>,
    path: String,
    data: Vec<u8>,
) -> Result<usize, String> {
    let mut ports = state.ports.lock().map_err(|e| e.to_string())?;
    let port = ports.get_mut(&path).ok_or("Port not open")?;
    use std::io::Write;
    port.write(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn serial_read(
    state: State<'_, SerialState>,
    path: String,
    size: usize,
) -> Result<Vec<u8>, String> {
    let mut ports = state.ports.lock().map_err(|e| e.to_string())?;
    let port = ports.get_mut(&path).ok_or("Port not open")?;
    let mut buf = vec![0u8; size];
    use std::io::Read;
    let n = port.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(buf)
}
