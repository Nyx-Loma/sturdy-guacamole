export const zeroize = (buffer: Uint8Array | undefined | null) => {
  if (!buffer) return;
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = 0;
  }
};


