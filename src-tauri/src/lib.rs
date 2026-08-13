mod error;
#[cfg(not(target_os = "ios"))]
mod serial;
#[cfg(not(target_os = "ios"))]
mod usb;

/// Pi 의 vc4/v3d 에서 WebKitGTK 의 DMA-BUF 렌더러가 화면을 찢는다.
/// WebKit 초기화 전에 정해져야 한다.
#[cfg(target_os = "linux")]
fn apply_linux_webkit_workarounds() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

/// 키오스크 패널은 세로가 좁아 창 장식과 상단 패널에 내용이 밀린다.
#[cfg(target_os = "linux")]
fn apply_linux_kiosk_window(app: &tauri::App) {
    use tauri::Manager;

    if std::env::var("ROSA_KIOSK").is_ok_and(|value| value == "0") {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_fullscreen(true);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    apply_linux_webkit_workarounds();

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
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            apply_linux_kiosk_window(_app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
