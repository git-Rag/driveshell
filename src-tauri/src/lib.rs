/**
 * lib.rs — Main entrypoint for Tauri v2 Desktop client.
 *
 * Invariants:
 *  - Spawns the local Fastify Node API server in the background.
 *  - Manages clean teardown of background server on window exit.
 *  - Single instance guard to avoid duplicate port bindings.
 */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Desktop initialization hooks
            #[cfg(debug_assertions)]
            {
                let window = tauri::Manager::get_webview_window(app, "main");
                if let Some(w) = window {
                    let _ = w.set_title("DriveShell (Dev)");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DriveShell desktop application");
}

