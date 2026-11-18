import {
  DEFAULT_RELAY_URL,
  RELAY_PRESETS,
  formatRelayHost,
  resolveRelayUrl,
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
