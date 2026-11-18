import {
  DEFAULT_RELAY_URL,
  RELAY_PRESETS,
  deleteCustomRelay,
  formatRelayHost,
  getAllRelayOptions,
  getDefaultRelayUrl,
  isWebSocketRelayUrl,
  loadSavedRelays,
  normalizeNetDeviceType,
  probeRelayConnection,
  resolveRelayUrl,
  saveCustomRelay,
  setDefaultRelayUrl,
  validateRelayUrl,
} from './lib/relay-config';
import {
  SerialTerminalBuffer,
  mapKeyEventToSerial,
} from './lib/serial-terminal';
import {
  buildSparklinePaths,
  computeCpuUtilization,
  computeMipsSample,
  formatInstructionCount,
  formatMegabytes,
  formatUptime,
} from './lib/vm-telemetry';

declare global {
  interface Window {
    WebVMCore?: {
      relay: {
        DEFAULT_RELAY_URL: string;
        RELAY_PRESETS: typeof RELAY_PRESETS;
        validateRelayUrl: typeof validateRelayUrl;
        resolveRelayUrl: typeof resolveRelayUrl;
        formatRelayHost: typeof formatRelayHost;
        normalizeNetDeviceType: typeof normalizeNetDeviceType;
        isWebSocketRelayUrl: typeof isWebSocketRelayUrl;
        probeRelayConnection: typeof probeRelayConnection;
        loadSavedRelays: typeof loadSavedRelays;
        saveCustomRelay: typeof saveCustomRelay;
        deleteCustomRelay: typeof deleteCustomRelay;
        getDefaultRelayUrl: typeof getDefaultRelayUrl;
        setDefaultRelayUrl: typeof setDefaultRelayUrl;
        getAllRelayOptions: typeof getAllRelayOptions;
      };
      telemetry: {
        computeMipsSample: typeof computeMipsSample;
        computeCpuUtilization: typeof computeCpuUtilization;
        formatInstructionCount: typeof formatInstructionCount;
        formatUptime: typeof formatUptime;
        formatMegabytes: typeof formatMegabytes;
        buildSparklinePaths: typeof buildSparklinePaths;
      };
      serial: {
        SerialTerminalBuffer: typeof SerialTerminalBuffer;
        mapKeyEventToSerial: typeof mapKeyEventToSerial;
      };
    };
  }
}

window.WebVMCore = {
  relay: {
    DEFAULT_RELAY_URL,
    RELAY_PRESETS,
    validateRelayUrl,
    resolveRelayUrl,
    formatRelayHost,
    normalizeNetDeviceType,
    isWebSocketRelayUrl,
    probeRelayConnection,
    loadSavedRelays,
    saveCustomRelay,
    deleteCustomRelay,
    getDefaultRelayUrl,
    setDefaultRelayUrl,
    getAllRelayOptions,
  },
  telemetry: {
    computeMipsSample,
    computeCpuUtilization,
    formatInstructionCount,
    formatUptime,
    formatMegabytes,
    buildSparklinePaths,
  },
  serial: {
    SerialTerminalBuffer,
    mapKeyEventToSerial,
  },
};
