import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SystemInfo {
  os_name: string;
  os_version: string;
  architecture: string;
  hostname: string;
  cpu: string;
  ram_gb: string;
  rom_gb: string;
  gpu_dedicada: string;
  gpu_integrada: string;
}

let cachedInfo: SystemInfo | null = null;
let cachedVersion: string | null = null;

export function useSystemInfo() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(cachedInfo);
  const [appVersion, setAppVersion] = useState<string>(cachedVersion ?? "");
  const [loading, setLoading] = useState(!cachedInfo);

  useEffect(() => {
    if (cachedInfo !== null && cachedVersion !== null) {
      setSystemInfo(cachedInfo);
      setAppVersion(cachedVersion);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      try {
        const [info, version] = await Promise.all([
          invoke<SystemInfo>("get_system_info"),
          invoke<string>("get_app_version"),
        ]);
        cachedInfo = info;
        cachedVersion = version;
        if (!cancelled) {
          setSystemInfo(info);
          setAppVersion(version);
        }
      } catch {
        if (!cancelled) {
          setSystemInfo(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  return { systemInfo, appVersion, loading };
}
