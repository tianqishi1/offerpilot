import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

export interface RegistrySigner {
  keyId: string;
  publicKeyPem: string;
  sign(payload: unknown): string;
}

/** Ed25519 签名注册中心响应；插件内置公钥验签（dev 模式启动时生成密钥对）。 */
export function createSigner(privatePem?: string): RegistrySigner {
  const pair = privatePem
    ? (() => { const priv = createPrivateKey(privatePem); return { privateKey: priv, publicKey: createPublicKey(priv) }; })()
    : generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keyId = 'dev-1';
  return {
    keyId,
    publicKeyPem,
    sign(payload: unknown): string {
      return sign(null, Buffer.from(JSON.stringify(payload)), pair.privateKey).toString('base64');
    },
  };
}

export function verifySignature(publicKeyPem: string, payload: unknown, signatureB64: string): boolean {
  return verify(null, Buffer.from(JSON.stringify(payload)), createPublicKey(publicKeyPem), Buffer.from(signatureB64, 'base64'));
}
