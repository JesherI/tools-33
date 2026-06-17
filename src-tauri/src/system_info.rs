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
struct GpuPair {
    dedicada: String,
    integrada: String,
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
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

    let ram_gb = format!("{:.1} GB", sys.total_memory() as f64 / 1_073_741_824.0);

    let disks = Disks::new_with_refreshed_list();
    let rom_bytes: u64 = disks.list().iter().map(|d| d.total_space()).sum();
    let rom_gb = if rom_bytes > 0 {
        format!("{:.1} GB", rom_bytes as f64 / 1_073_741_824.0)
    } else {
        "No detectado".into()
    };

    let gpu = detect_gpu_pair();

    SystemInfo {
        os_name,
        os_version,
        architecture,
        hostname,
        cpu: cpu_brand,
        ram_gb,
        rom_gb,
        gpu_dedicada: gpu.dedicada,
        gpu_integrada: gpu.integrada,
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

fn parse_gpu_names(raw: &str) -> GpuPair {
    let mut dedicada = String::new();
    let mut integrada = String::new();
    for line in raw.lines() {
        let name = line.trim();
        if name.is_empty() {
            continue;
        }
        if is_dedicated(name) {
            if dedicada.is_empty() {
                dedicada = name.to_string();
            }
        } else if integrada.is_empty() {
            integrada = name.to_string();
        }
    }
    if dedicada.is_empty() {
        dedicada = "No detectada".into();
    }
    if integrada.is_empty() {
        integrada = "No detectada".into();
    }
    GpuPair { dedicada, integrada }
}

fn detect_gpu_pair() -> GpuPair {
    let output = if cfg!(target_os = "windows") {
        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "& {(Get-CimInstance Win32_VideoController).Name}",
            ])
            .output()
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("sh")
            .args([
                "-c",
                "system_profiler SPDisplaysDataType 2>/dev/null | grep \"Chipset Model\" | sed 's/.*: //'",
            ])
            .output()
    } else if cfg!(target_os = "linux") {
        std::process::Command::new("sh")
            .args(["-c", "lspci 2>/dev/null | grep -i 'vga\\|3d\\|display' | sed 's/^.*: : '"])
            .output()
    } else {
        return GpuPair {
            dedicada: "No detectada".into(),
            integrada: "No detectada".into(),
        };
    };

    match output {
        Ok(out) if out.status.success() => parse_gpu_names(&String::from_utf8_lossy(&out.stdout)),
        _ => GpuPair {
            dedicada: "No detectada".into(),
            integrada: "No detectada".into(),
        },
    }
}
