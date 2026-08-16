// lib/errors/storage/b2-client.ts
// الإصدار: 1.0.3
// الدور: العميل الأساسي للتواصل مع Backblaze B2 (توقيع الطلبات، HTTP Methods)

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

export interface B2ClientOptions {
  endpoint: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

// ═══════════════════════════════════════════════════════════════
// 🏗️  عميل B2 الخام
// ═══════════════════════════════════════════════════════════════

export class B2Client {
  private readonly endpoint: string;
  private readonly bucketName: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region: string;

  constructor(options: B2ClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, '');
    this.bucketName = options.bucketName;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.region = options.region ?? 'us-east-005';
  }

  private getUrl(key: string): string {
    return `${this.endpoint}/${this.bucketName}/${key}`;
  }

  private async signRequest(
    method: string,
    key: string,
    body?: BodyInit,
    headers: Record<string, string> = {}
  ): Promise<Headers> {
    const { AwsClient } = await import('aws4fetch');
    const client = new AwsClient({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
      service: 's3',
    });

    const url = this.getUrl(key);
    const request = new Request(url, {
      method,
      headers: { Host: new URL(url).host, ...headers },
      body,
    });

    const signedRequest = await client.sign(request);
    return signedRequest.headers;
  }

  async put(key: string, body: Uint8Array, headers: Record<string, string>): Promise<{ etag: string }> {
    // ✅ تحويل Uint8Array لـ BodyInit بشكل آمن ومتوافق مع Web APIs القياسية
    const requestBody = body as unknown as BodyInit;

    const signedHeaders = await this.signRequest('PUT', key, requestBody, headers);
    const response = await fetch(this.getUrl(key), { 
      method: 'PUT', 
      headers: signedHeaders, 
      body: requestBody 
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`B2 PUT failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return { etag: response.headers.get('etag')?.replace(/^"|"$/g, '') || 'unknown' };
  }

  async get(key: string): Promise<{ body: Uint8Array; etag: string; metadata: Record<string, string> }> {
    const signedHeaders = await this.signRequest('GET', key);
    const response = await fetch(this.getUrl(key), { method: 'GET', headers: signedHeaders });

    if (!response.ok) {
      if (response.status === 404) throw new Error(`File not found: ${key}`);
      const errorText = await response.text();
      throw new Error(`B2 GET failed: ${response.status} - ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);
    const etag = response.headers.get('etag')?.replace(/^"|"$/g, '') || 'unknown';

    const metadata: Record<string, string> = {};
    for (const [k, v] of response.headers.entries()) {
      if (k.startsWith('x-amz-meta-')) {
        metadata[k.replace('x-amz-meta-', '')] = v;
      }
    }

    return { body, etag, metadata };
  }

  async delete(key: string): Promise<void> {
    const signedHeaders = await this.signRequest('DELETE', key);
    const response = await fetch(this.getUrl(key), { method: 'DELETE', headers: signedHeaders });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`B2 DELETE failed: ${response.status} - ${errorText}`);
    }
  }

  async head(key: string): Promise<boolean> {
    const signedHeaders = await this.signRequest('HEAD', key);
    const response = await fetch(this.getUrl(key), { method: 'HEAD', headers: signedHeaders });
    return response.ok;
  }
}