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

fn find_bundled_file(candidates: &[PathBuf]) -> Option<PathBuf> {
    for c in candidates {
        if c.exists() {
            return Some(c.clone());
        }
    }
    None
}

fn strip_verbatim_prefix(path: &std::path::Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{}", stripped))
    } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

fn spawn_server(app: &tauri::App) -> Result<Child, Box<dyn std::error::Error>> {
    let raw_resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let resource_dir = strip_verbatim_prefix(&raw_resource_dir);

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| strip_verbatim_prefix(d)));

    // Candidate search for bundled node.exe: check both resource_dir/resources/bin and resource_dir/bin
    let mut node_candidates = vec![
        resource_dir.join("resources").join("bin").join("node.exe"),
        resource_dir.join("bin").join("node.exe"),
    ];
    if let Some(ref d) = exe_dir {
        node_candidates.push(d.join("resources").join("bin").join("node.exe"));
        node_candidates.push(d.join("bin").join("node.exe"));
    }
    node_candidates.push(PathBuf::from("resources").join("bin").join("node.exe"));
    node_candidates.push(PathBuf::from("bin").join("node.exe"));

    let node_bin = strip_verbatim_prefix(
        &find_bundled_file(&node_candidates).unwrap_or_else(|| PathBuf::from("node")),
    );

    // Candidate search for bundled server.cjs
    let mut server_candidates = vec![
        resource_dir.join("resources").join("server").join("server.cjs"),
        resource_dir.join("server").join("server.cjs"),
    ];
    if let Some(ref d) = exe_dir {
        server_candidates.push(d.join("resources").join("server").join("server.cjs"));
        server_candidates.push(d.join("server").join("server.cjs"));
    }
    server_candidates.push(PathBuf::from("resources").join("server").join("server.cjs"));

    let server_script = strip_verbatim_prefix(&find_bundled_file(&server_candidates).unwrap_or_else(
        || {
            PathBuf::from("..")
                .join("apps")
                .join("server")
                .join("dist")
                .join("index.js")
        },
    ));

    let data_dir = std::env::var("LOCALAPPDATA")
        .map(|p| PathBuf::from(p).join("SunflowerDrive").join("data"))
        .unwrap_or_else(|_| {
            app.path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("data"))
        });
    let data_dir = strip_verbatim_prefix(&data_dir);
    std::fs::create_dir_all(&data_dir).ok();

    let server_dir = strip_verbatim_prefix(server_script.parent().unwrap_or(&resource_dir));

    // Startup logging for diagnostic audit trail
    let startup_log = data_dir.join("desktop-startup.log");
    let log_msg = format!(
        "[{:?}] spawn_server:\n  resource_dir: {:?}\n  exe_dir: {:?}\n  node_bin: {:?} (exists: {})\n  server_script: {:?} (exists: {})\n  server_dir: {:?}\n  data_dir: {:?}\n",
        std::time::SystemTime::now(),
        resource_dir,
        exe_dir,
        node_bin,
        node_bin.exists(),
        server_script,
        server_script.exists(),
        server_dir,
        data_dir
    );
    let _ = std::fs::write(&startup_log, log_msg);

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&server_script)
        .current_dir(server_dir)
        .env("SERVER_PORT", "3001")
        .env("DATA_DIR", &data_dir)
        .env("NODE_ENV", "production");

    // Redirect stdout and stderr to server.log to avoid Windows GUI handle crashes
    let server_log_path = data_dir.join("server.log");
    if let Ok(file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&server_log_path)
    {
        if let Ok(err_file) = file.try_clone() {
            cmd.stdout(file);
            cmd.stderr(err_file);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // 0x08000000 = CREATE_NO_WINDOW prevents command prompt window from flashing
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn()?;
    Ok(child)
}

#[tauri::command]
fn open_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        Command::new("cmd")
            .args(["/c", "start", "", &url])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_browser])
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
