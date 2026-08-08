use rusb::{Context, Device, DeviceHandle, Direction, TransferType, UsbContext};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const USB_CLASS_PRINTER: u8 = 0x07;

const TRANSFER_TIMEOUT_MS: u64 = 3000;
/// 응답이 64 B 단위로 쪼개져 오는 펌웨어가 있어, 한 번에 한 조각씩만 읽는다.
const READ_PACKET_SIZE: usize = 64;

#[derive(Debug, Serialize)]
pub struct UsbDeviceInfo {
    pub key: String,
    pub bus: u8,
    pub address: u8,
    pub vendor_id: u16,
    pub product_id: u16,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub class_code: u8,
    /// 복합 장치는 `class_code` 가 0 이고 실제 클래스가 인터페이스에 있다. 프린터를
    /// 가려내려면 이쪽을 봐야 한다.
    pub interface_classes: Vec<u8>,
}

struct OpenDevice {
    handle: DeviceHandle<Context>,
    interface: u8,
    endpoint_in: u8,
    endpoint_out: u8,
}

impl Drop for OpenDevice {
    fn drop(&mut self) {
        let _ = self.handle.release_interface(self.interface);
    }
}

/// 핸들이 `Arc` 인 것은 잠금을 조회하는 순간에만 잡기 위해서다. 전송 내내 쥐면 잡이
/// 끝날 때까지 다른 모든 USB 명령이 막힌다 — 닫기조차도.
#[derive(Default)]
pub struct UsbState {
    devices: Arc<Mutex<HashMap<String, Arc<OpenDevice>>>>,
}

fn take_device(
    devices: &Arc<Mutex<HashMap<String, Arc<OpenDevice>>>>,
    key: &str,
) -> Result<Arc<OpenDevice>, String> {
    let open = devices.lock().map_err(|e| e.to_string())?;
    open.get(key).cloned().ok_or("USB 장치가 열려 있지 않습니다".into())
}

fn device_key(bus: u8, address: u8) -> String {
    format!("{bus}:{address}")
}

#[tauri::command]
pub fn usb_list_devices() -> Result<Vec<UsbDeviceInfo>, String> {
    let context = Context::new().map_err(|e| e.to_string())?;
    let devices = context.devices().map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for device in devices.iter() {
        let desc = device.device_descriptor().map_err(|e| e.to_string())?;
        let handle = device.open().ok();

        let manufacturer = handle
            .as_ref()
            .and_then(|h| h.read_manufacturer_string_ascii(&desc).ok());
        let product = handle
            .as_ref()
            .and_then(|h| h.read_product_string_ascii(&desc).ok());
        let serial_number = handle
            .as_ref()
            .and_then(|h| h.read_serial_number_string_ascii(&desc).ok());

        // 설정 디스크립터는 장치가 잠들어 있거나 권한이 없으면 못 읽는다. 그때는
        // 인터페이스 클래스를 모른 채로 넘긴다 — 열거 자체를 실패시킬 일은 아니다.
        let interface_classes = device
            .active_config_descriptor()
            .map(|config| {
                let mut classes: Vec<u8> = config
                    .interfaces()
                    .flat_map(|i| i.descriptors().map(|d| d.class_code()).collect::<Vec<_>>())
                    .collect();
                classes.sort_unstable();
                classes.dedup();
                classes
            })
            .unwrap_or_default();

        result.push(UsbDeviceInfo {
            key: device_key(device.bus_number(), device.address()),
            bus: device.bus_number(),
            address: device.address(),
            vendor_id: desc.vendor_id(),
            product_id: desc.product_id(),
            manufacturer,
            product,
            serial_number,
            class_code: desc.class_code(),
            interface_classes,
        });
    }
    Ok(result)
}

/// 벌크 IN/OUT 이 모두 있는 인터페이스를 찾는다. 프린터 클래스를 먼저 보되, 없으면
/// 아무 인터페이스나 쓴다 — 클래스를 벤더 지정으로 내놓는 기기가 있고, 모르는 기기에
/// 붙어보려면 그쪽도 열 수 있어야 한다.
fn find_bulk_interface(device: &Device<Context>) -> Result<(u8, u8, u8, u8), String> {
    let config = device
        .active_config_descriptor()
        .map_err(|e| format!("설정 디스크립터를 읽지 못했습니다: {e}"))?;

    let mut candidates: Vec<(u8, u8, u8, u8, u8)> = Vec::new();
    for interface in config.interfaces() {
        for descriptor in interface.descriptors() {
            let mut endpoint_in = None;
            let mut endpoint_out = None;
            for endpoint in descriptor.endpoint_descriptors() {
                if endpoint.transfer_type() != TransferType::Bulk {
                    continue;
                }
                match endpoint.direction() {
                    Direction::In => endpoint_in.get_or_insert(endpoint.address()),
                    Direction::Out => endpoint_out.get_or_insert(endpoint.address()),
                };
            }

            if let (Some(input), Some(output)) = (endpoint_in, endpoint_out) {
                candidates.push((
                    descriptor.interface_number(),
                    descriptor.setting_number(),
                    input,
                    output,
                    descriptor.class_code(),
                ));
            }
        }
    }

    let chosen = candidates
        .iter()
        .find(|c| c.4 == USB_CLASS_PRINTER)
        .or_else(|| candidates.first())
        .ok_or("벌크 IN/OUT 엔드포인트를 가진 인터페이스가 없습니다")?;
    Ok((chosen.0, chosen.1, chosen.2, chosen.3))
}

fn open_device(bus: u8, address: u8) -> Result<OpenDevice, String> {
    let context = Context::new().map_err(|e| e.to_string())?;
    let device = context
        .devices()
        .map_err(|e| e.to_string())?
        .iter()
        .find(|d| d.bus_number() == bus && d.address() == address)
        .ok_or_else(|| format!("USB 장치 {bus}:{address} 를 찾지 못했습니다"))?;

    let (interface, alt_setting, endpoint_in, endpoint_out) = find_bulk_interface(&device)?;
    let handle = device
        .open()
        .map_err(|e| format!("USB 장치를 열지 못했습니다: {e}"))?;

    // Linux 의 usblp 가 붙어 있으면 claim 이 실패한다. 다른 OS 에서는 지원되지 않는다.
    let _ = handle.set_auto_detach_kernel_driver(true);

    handle.claim_interface(interface).map_err(|e| {
        format!("인터페이스 {interface} 를 점유하지 못했습니다 (다른 프로그램이 사용 중일 수 있습니다): {e}")
    })?;
    // 리셋하면 장치가 재열거되므로, alt setting 만 명시적으로 맞춘다.
    let _ = handle.set_alternate_setting(interface, alt_setting);

    Ok(OpenDevice {
        handle,
        interface,
        endpoint_in,
        endpoint_out,
    })
}

#[tauri::command]
pub async fn usb_open(state: tauri::State<'_, UsbState>, bus: u8, address: u8) -> Result<String, String> {
    let devices = state.devices.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let key = device_key(bus, address);
        if devices.lock().map_err(|e| e.to_string())?.contains_key(&key) {
            return Ok(key);
        }
        // 버스 열거와 claim 은 오래 걸리므로 잠금 밖에서 한다.
        let device = Arc::new(open_device(bus, address)?);
        devices
            .lock()
            .map_err(|e| e.to_string())?
            .entry(key.clone())
            .or_insert(device);
        Ok(key)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn usb_close(state: tauri::State<'_, UsbState>, key: String) -> Result<(), String> {
    let devices = state.devices.clone();
    tauri::async_runtime::spawn_blocking(move || {
        devices.lock().map_err(|e| e.to_string())?.remove(&key);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn usb_write(
    state: tauri::State<'_, UsbState>,
    key: String,
    data: Vec<u8>,
    chunk_bytes: usize,
) -> Result<usize, String> {
    let devices = state.devices.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let device = take_device(&devices, &key)?;

        let chunk = if chunk_bytes == 0 { data.len().max(1) } else { chunk_bytes };
        let timeout = Duration::from_millis(TRANSFER_TIMEOUT_MS);
        let mut written = 0;
        while written < data.len() {
            let end = (written + chunk).min(data.len());
            written += device
                .handle
                .write_bulk(device.endpoint_out, &data[written..end], timeout)
                .map_err(|e| format!("USB 쓰기에 실패했습니다 ({written} B 전송 후): {e}"))?;
        }
        Ok(written)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 응답에 프레이밍이 없어, 정확히 `length` 바이트가 쌓일 때까지 누적한다.
#[tauri::command]
pub async fn usb_read(
    state: tauri::State<'_, UsbState>,
    key: String,
    length: usize,
    timeout_ms: u64,
) -> Result<Vec<u8>, String> {
    let devices = state.devices.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let device = take_device(&devices, &key)?;

        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        let mut buffer = vec![0u8; READ_PACKET_SIZE];
        let mut received: Vec<u8> = Vec::with_capacity(length);

        while received.len() < length {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(format!(
                    "USB 읽기가 시간을 초과했습니다: {} / {length} B",
                    received.len()
                ));
            }
            let want = (length - received.len()).min(READ_PACKET_SIZE);
            match device
                .handle
                .read_bulk(device.endpoint_in, &mut buffer[..want], remaining)
            {
                Ok(n) => received.extend_from_slice(&buffer[..n]),
                Err(rusb::Error::Timeout) => continue,
                Err(e) => return Err(format!("USB 읽기에 실패했습니다: {e}")),
            }
        }
        Ok(received)
    })
    .await
    .map_err(|e| e.to_string())?
}
