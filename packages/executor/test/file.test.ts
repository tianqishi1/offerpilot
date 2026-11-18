import { describe, expect, it } from 'vitest';
import { attachFile } from '../src/file.js';
import { loadFixture, setupUpload } from './helpers.js';

describe('attachFile', () => {
  it('sets input.files via DataTransfer and fires change', async () => {
    loadFixture('upload.html');
    setupUpload();
    const input = document.getElementById('resume') as HTMLInputElement;
    await attachFile(input, { blob: new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }), name: 'resume.pdf' });
    expect(input.files?.length).toBe(1);
    expect(input.files?.[0]?.name).toBe('resume.pdf');
    expect((window as unknown as { __uploaded?: string }).__uploaded).toBe('resume.pdf');
  });
  it('also dispatches drop on dropzone', async () => {
    loadFixture('upload.html');
    setupUpload();
    const input = document.getElementById('resume') as HTMLInputElement;
    const dz = document.getElementById('dropzone')!;
    await attachFile(input, { blob: new Blob(['x']), name: 'r.pdf' }, { dropzone: dz });
    expect((window as unknown as { __dropped?: boolean }).__dropped).toBe(true);
  });
});
