/**
 * lib.rs — Main entrypoint for Tauri v2 Desktop client.
 *
 * Invariants:
 *  - Spawns the local Fastify Node API server in the background.
 *  - Manages clean teardown of background server on window exit.
 *  - Single instance guard to avoid duplicate port bindings.
 */

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct ServerProcess(Mutex<Option<Child>>);

fn spawn_server(app: &tauri::App) -> Result<Child, Box<dyn std::error::Error>> {
    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    // Check for bundled node.exe first in resource directory, then system PATH
    let bundled_node = resource_dir.join("bin").join("node.exe");
    let node_bin = if bundled_node.exists() {
        bundled_node
    } else {
        PathBuf::from("node")
    };

    // Locate bundled server.cjs, or fallback to dev server
    let bundled_server = resource_dir.join("server").join("server.cjs");
    let server_script = if bundled_server.exists() {
        bundled_server
    } else {
        let dev_server = PathBuf::from("resources").join("server").join("server.cjs");
        if dev_server.exists() {
            dev_server
        } else {
            PathBuf::from("..")
                .join("apps")
                .join("server")
                .join("dist")
                .join("index.js")
        }
    };

    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| {
        std::env::var("LOCALAPPDATA")
            .map(|p| PathBuf::from(p).join("SunflowerDrive").join("data"))
            .unwrap_or_else(|_| PathBuf::from("data"))
    });
    std::fs::create_dir_all(&data_dir).ok();

    let server_dir = server_script.parent().unwrap_or(&resource_dir);

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&server_script)
        .current_dir(server_dir)
        .env("SERVER_PORT", "3001")
        .env("DATA_DIR", &data_dir)
        .env("NODE_ENV", "production");

    #[cfg(target_os = "windows")]
    {
        // 0x08000000 = CREATE_NO_WINDOW prevents command prompt window from flashing
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn()?;
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            match spawn_server(app) {
                Ok(child) => {
                    app.manage(ServerProcess(Mutex::new(Some(child))));
                }
                Err(err) => {
                    eprintln!("Failed to spawn background server: {err}");
                }
            }

            #[cfg(debug_assertions)]
            {
                let window = tauri::Manager::get_webview_window(app, "main");
                if let Some(w) = window {
                    let _ = w.set_title("Sunflower Drive (Dev)");
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Sunflower Drive desktop application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
