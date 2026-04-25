use rusb::{Context, UsbContext};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct UsbDeviceInfo {
    pub bus: u8,
    pub address: u8,
    pub vendor_id: u16,
    pub product_id: u16,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub class_code: u8,
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

        result.push(UsbDeviceInfo {
            bus: device.bus_number(),
            address: device.address(),
            vendor_id: desc.vendor_id(),
            product_id: desc.product_id(),
            manufacturer,
            product,
            serial_number,
            class_code: desc.class_code(),
        });
    }
    Ok(result)
}
