// lib/errors/storage/b2-client.ts
// الإصدار: 1.0.5
// الدور: العميل الأساسي للتواصل مع Backblaze B2 (توقيع الطلبات، HTTP Methods)

import { AwsClient } from 'aws4fetch';

// ═══════════════════════════════════════════════════════════════
// 📦 الأنواع
// ═══════════════════════════════════════════════════════════════

export interface B2ClientOptions {
  endpoint: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export interface B2PutResult {
  etag: string;
}

export interface B2GetResult {
  body: Uint8Array;
  etag: string;
  metadata: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════
// 🏗️ عميل B2 الخام
// ═══════════════════════════════════════════════════════════════

export class B2Client {
  private readonly endpoint: string;
  private readonly bucketName: string;
  private readonly awsClient: AwsClient;

  constructor(options: B2ClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, '');
    this.bucketName = options.bucketName;
    
    this.awsClient = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: options.region ?? 'us-east-005',
      service: 's3',
    });
  }

  private getUrl(key: string): string {
    return `${this.endpoint}/${this.bucketName}/${key.replace(/^\//, '')}`;
  }

  private async signRequest(
    method: string,
    key: string,
    body?: BodyInit,
    headers: Record<string, string> = {}
  ): Promise<Headers> {
    const url = this.getUrl(key);
    const request = new Request(url, {
      method,
      headers: { Host: new URL(url).host, ...headers },
      body,
    });

    const signedRequest = await this.awsClient.sign(request);
    return signedRequest.headers;
  }

  async put(
    key: string,
    body: Uint8Array,
    headers: Record<string, string>
  ): Promise<B2PutResult> {
    // 💡 اقتطاع الـ ArrayBuffer الخالص لضمان توافق TypeScript مع BodyInit
    const payload = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;

    const signedHeaders = await this.signRequest('PUT', key, payload, headers);
    const response = await fetch(this.getUrl(key), { 
      method: 'PUT', 
      headers: signedHeaders, 
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`B2 PUT failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const rawEtag = response.headers.get('etag');
    const etag = rawEtag ? rawEtag.replace(/^"|"$/g, '') : 'unknown';

    return { etag };
  }

  async get(key: string): Promise<B2GetResult> {
    const signedHeaders = await this.signRequest('GET', key);
    const response = await fetch(this.getUrl(key), { method: 'GET', headers: signedHeaders });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${key}`);
      }
      const errorText = await response.text();
      throw new Error(`B2 GET failed: ${response.status} - ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);
    
    const rawEtag = response.headers.get('etag');
    const etag = rawEtag ? rawEtag.replace(/^"|"$/g, '') : 'unknown';

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