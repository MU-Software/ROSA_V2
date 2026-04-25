mod serial;
mod usb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(serial::SerialState::default())
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            serial::serial_list_ports,
            serial::serial_open,
            serial::serial_close,
            serial::serial_write,
            serial::serial_read,
            usb::usb_list_devices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
