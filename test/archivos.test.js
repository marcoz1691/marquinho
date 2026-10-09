import { describe, it, expect } from "vitest";
import { tipoArchivo } from "../api/_lib/archivos.js";

const bytes = (...b) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("tipoArchivo", () => {
  it("reconoce PDF, JPG, PNG y WEBP por sus primeros bytes", () => {
    expect(tipoArchivo(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("application/pdf");
    expect(tipoArchivo(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(tipoArchivo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(tipoArchivo(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });

  it("rechaza ejecutables, texto y archivos vacíos o muy cortos", () => {
    expect(tipoArchivo(bytes(0x4d, 0x5a, 0x90))).toBeNull();
    expect(tipoArchivo(new TextEncoder().encode("<html>hola</html>"))).toBeNull();
    expect(tipoArchivo(new Uint8Array([]))).toBeNull();
    expect(tipoArchivo(new Uint8Array([0x25]))).toBeNull();
  });
});
