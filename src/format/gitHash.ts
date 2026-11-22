import { createHash } from 'node:crypto';

/** Git-Blob-SHA (`git hash-object`), identisch mit den SHAs der GitHub-API. */
export function gitBlobSha(content: Uint8Array): string {
  return createHash('sha1').update(`blob ${content.byteLength}\0`).update(content).digest('hex');
}
