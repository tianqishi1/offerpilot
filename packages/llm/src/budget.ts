export interface Budget {
  remaining(userId: string): number;
  consume(userId: string, tokens: number): void;
}

/** 每用户每月 token 预算（免费层硬限额）；MVP 内存版，规模化换 Redis。 */
export class MemoryBudget implements Budget {
  private used = new Map<string, number>();
  constructor(private monthlyCap: number) {}
  private key(userId: string): string {
    const d = new Date();
    return `${userId}:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
  }
  remaining(userId: string): number {
    return Math.max(0, this.monthlyCap - (this.used.get(this.key(userId)) ?? 0));
  }
  consume(userId: string, tokens: number): void {
    const k = this.key(userId);
    this.used.set(k, (this.used.get(k) ?? 0) + tokens);
  }
}
