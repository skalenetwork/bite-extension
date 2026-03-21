export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);

  for (let index = 0; index < cleanHex.length; index += 2) {
    bytes[index / 2] = parseInt(cleanHex.slice(index, index + 2), 16);
  }

  return bytes;
}

export function ensure0x(value: string): string {
  return value.startsWith('0x') ? value : `0x${value}`;
}

export function strip0x(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

export function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
