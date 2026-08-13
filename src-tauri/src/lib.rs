mod error;
#[cfg(not(target_os = "ios"))]
mod serial;
#[cfg(not(target_os = "ios"))]
mod usb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder =
        tauri::Builder::default()
            .plugin(tauri_plugin_log::Builder::default().build())
            .plugin(tauri_plugin_http::init());

    #[cfg(not(target_os = "ios"))]
    {
        builder = builder
            .manage(serial::SerialState::default())
            .manage(usb::UsbState::default())
            .invoke_handler(tauri::generate_handler![
                serial::serial_list_ports,
                serial::serial_open,
                serial::serial_close,
                serial::serial_write,
                usb::usb_list_devices,
                usb::usb_open,
                usb::usb_close,
                usb::usb_write,
                usb::usb_read,
            ]);
    }
    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(tauri_plugin_bluetooth_spp::init());
    }
    #[cfg(target_os = "ios")]
    {
        builder = builder.plugin(tauri_plugin_blec::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
