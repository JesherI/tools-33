use serde::Serialize;
use sysinfo::{Disks, System};

#[derive(Serialize)]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub architecture: String,
    pub hostname: String,
    pub cpu: String,
    pub ram_gb: String,
    pub rom_gb: String,
    pub gpu_dedicada: String,
    pub gpu_integrada: String,
}

#[derive(Serialize)]
pub struct GpuPair {
    pub dedicada: String,
    pub integrada: String,
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let os_name = System::name().unwrap_or_else(|| "Desconocido".into());
    let os_version = System::os_version().unwrap_or_else(|| "".into());
    let hostname = System::host_name().unwrap_or_else(|| "Desconocido".into());
    let architecture = std::env::consts::ARCH.to_string();

    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_else(|| "No detectado".into());

    let total_ram_bytes = sys.total_memory();
    let total_ram_gb = format!("{:.1} GB", total_ram_bytes as f64 / 1_073_741_824.0);

    let disks = Disks::new_with_refreshed_list();
    let total_rom_bytes: u64 = disks.list().iter().map(|d| d.total_space()).sum();
    let total_rom_gb = if total_rom_bytes > 0 {
        format!("{:.1} GB", total_rom_bytes as f64 / 1_073_741_824.0)
    } else {
        "No detectado".into()
    };

    let gpu_pair = detect_gpu_pair();

    SystemInfo {
        os_name,
        os_version,
        architecture,
        hostname,
        cpu: cpu_brand,
        ram_gb: total_ram_gb,
        rom_gb: total_rom_gb,
        gpu_dedicada: gpu_pair.dedicada,
        gpu_integrada: gpu_pair.integrada,
    }
}

fn is_dedicated(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("nvidia")
        || lower.contains("geforce")
        || lower.contains("rtx")
        || lower.contains("gtx")
        || lower.contains("radeon rx")
        || lower.contains("radeon pro")
        || lower.contains("amd radeon")
        || lower.contains("arc")
        || lower.contains("tesla")
        || lower.contains("quadro")
}

fn detect_gpu_pair() -> GpuPair {
    let mut gpu_dedicada = String::new();
    let mut gpu_integrada = String::new();

    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "& {(Get-CimInstance Win32_VideoController).Name}",
            ])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                let raw = String::from_utf8_lossy(&out.stdout);
                for line in raw.lines() {
                    let name = line.trim();
                    if name.is_empty() {
                        continue;
                    }
                    if is_dedicated(name) {
                        if gpu_dedicada.is_empty() {
                            gpu_dedicada = name.to_string();
                        }
                    } else if gpu_integrada.is_empty() {
                        gpu_integrada = name.to_string();
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("sh")
            .args([
                "-c",
                "system_profiler SPDisplaysDataType 2>/dev/null | grep \"Chipset Model\" | sed 's/.*: //'",
            ])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                let raw = String::from_utf8_lossy(&out.stdout);
                for line in raw.lines() {
                    let name = line.trim();
                    if name.is_empty() {
                        continue;
                    }
                    if is_dedicated(name) {
                        if gpu_dedicada.is_empty() {
                            gpu_dedicada = name.to_string();
                        }
                    } else if gpu_integrada.is_empty() {
                        gpu_integrada = name.to_string();
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let output = std::process::Command::new("sh")
            .args(["-c", "lspci 2>/dev/null | grep -i 'vga\\|3d\\|display' | sed 's/^.*: //'"])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                let raw = String::from_utf8_lossy(&out.stdout);
                for line in raw.lines() {
                    let name = line.trim();
                    if name.is_empty() {
                        continue;
                    }
                    if is_dedicated(name) {
                        if gpu_dedicada.is_empty() {
                            gpu_dedicada = name.to_string();
                        }
                    } else if gpu_integrada.is_empty() {
                        gpu_integrada = name.to_string();
                    }
                }
            }
        }
    }

    if gpu_dedicada.is_empty() {
        gpu_dedicada = "No detectada".into();
    }
    if gpu_integrada.is_empty() {
        gpu_integrada = "No detectada".into();
    }

    GpuPair {
        dedicada: gpu_dedicada,
        integrada: gpu_integrada,
    }
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_system_info, get_app_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
