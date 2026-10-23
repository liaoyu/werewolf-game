const OTA_URL = "https://xrobo.qiniuapi.com/v1/ota/";
const ACTIVATE_URL = "https://xrobo.qiniuapi.com/v1/ota/activate";

export interface OtaResult {
  activation?: { code: string; message: string; challenge: string };
  websocket?: { url: string; token?: string };
  error?: string;
}

function otaBody(deviceId: string, clientId: string) {
  const mac = deviceId.toUpperCase();
  return {
    version: 0,
    uuid: clientId,
    application: {
      name: "werewolf-mac",
      version: "0.1.0",
      compile_time: "2026-10-23 16:00:00",
      idf_version: "web",
      elf_sha256: "0".repeat(64),
    },
    ota: { label: "werewolf-mac" },
    board: {
      type: "xiaoling-web-test",
      ssid: "local",
      rssi: 0,
      channel: 0,
      ip: "127.0.0.1",
      mac,
    },
    flash_size: 0,
    minimum_free_heap_size: 0,
    mac_address: mac,
    chip_model_name: "",
    chip_info: { model: 0, cores: 0, revision: 0, features: 0 },
    partition_table: [
      { label: "", type: 0, subtype: 0, address: 0, size: 0 },
    ],
  };
}

export async function requestOta(
  deviceId: string,
  clientId: string,
): Promise<OtaResult> {
  const mac = deviceId.toUpperCase();
  const res = await fetch(OTA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Activation-Version": "1",
      "Accept-Language": "zh-CN",
      "Device-Id": mac,
      "Client-Id": clientId,
      "User-Agent": "werewolf-mac/0.1.0",
    },
    body: JSON.stringify(otaBody(deviceId, clientId)),
  });
  return (await res.json()) as OtaResult;
}

export async function pollActivate(deviceId: string): Promise<boolean> {
  const res = await fetch(ACTIVATE_URL, {
    method: "POST",
    headers: { "Device-Id": deviceId.toUpperCase() },
  });
  return res.status === 200;
}
