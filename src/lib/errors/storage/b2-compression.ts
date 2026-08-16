// lib/errors/storage/b2-compression.ts
// الإصدار: 1.0.1
// الدور: دوال ضغط وفك ضغط gzip (معزولة وعالية الأداء)

export async function gzipCompress(text: string): Promise<Uint8Array> {
  try {
    const stream = new Response(text).body;
    if (!stream) {
      throw new Error('Failed to create readable stream from input text');
    }

    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const arrayBuffer = await new Response(compressedStream).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error: unknown) {
    console.warn('[B2] CompressionStream failed:', error);
    throw new Error('Compression failed');
  }
}

export async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  try {
    const bodyInit = data as unknown as BodyInit;
    const stream = new Response(bodyInit).body;
    if (!stream) {
      throw new Error('Failed to create readable stream from compressed data');
    }

    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const arrayBuffer = await new Response(decompressedStream).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error: unknown) {
    console.warn('[B2] DecompressionStream failed:', error);
    throw new Error('Decompression failed');
  }
}