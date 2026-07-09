import { Blob, File } from "node:buffer";

const defineGlobal = (name: "Blob" | "File", value: typeof Blob | typeof File): void => {
  if (!(name in globalThis)) {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true
    });
  }
};

defineGlobal("Blob", Blob);
defineGlobal("File", File);
