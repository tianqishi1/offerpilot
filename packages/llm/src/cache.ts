export interface Cache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export class MemoryCache implements Cache {
  private map = new Map<string, string>();
  constructor(private max = 5000) {}
  get(key: string): string | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, value: string): void {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
}
