// Shim: delegates to the native Capacitor bridge already injected by the iOS/Android shell.
// This prevents esbuild from bundling @capacitor/core (which would overwrite window.Capacitor).

export const Capacitor = window.Capacitor;
export const registerPlugin = window.Capacitor ? window.Capacitor.registerPlugin : function() {};
export class WebPlugin {}
export class CapacitorException extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
export const ExceptionCode = {};
