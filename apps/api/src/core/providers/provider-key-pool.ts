import { ProviderKeyState } from "./provider.types";

export class ProviderKeyPool {
  private keys: ProviderKeyState[] = [];
  private pointer = 0;

  constructor(rawKeys: string[] = []) {
    this.keys = rawKeys
      .map((key) => key.trim())
      .filter(Boolean)
      .map((key) => ({
        key,
        maskedKey: this.mask(key),
        failures: 0,
        cooldownUntil: undefined,
        lastUsedAt: undefined,
      }));
  }

  public hasKeys(): boolean {
    return this.keys.length > 0;
  }

  public getNextAvailableKey(): ProviderKeyState | null {
    if (!this.keys.length) return null;

    const now = Date.now();

    for (let i = 0; i < this.keys.length; i++) {
      const index = (this.pointer + i) % this.keys.length;
      const candidate = this.keys[index];

      if (!candidate.cooldownUntil || candidate.cooldownUntil <= now) {
        this.pointer = (index + 1) % this.keys.length;
        candidate.lastUsedAt = now;
        return candidate;
      }
    }

    return null;
  }

  public markFailure(key: string, cooldownMs = 60_000): void {
    const found = this.keys.find((item) => item.key === key);
    if (!found) return;

    found.failures += 1;
    found.cooldownUntil = Date.now() + cooldownMs;
  }

  public markSuccess(key: string): void {
    const found = this.keys.find((item) => item.key === key);
    if (!found) return;

    found.failures = 0;
    found.cooldownUntil = undefined;
    found.lastUsedAt = Date.now();
  }

  public inspect(): ProviderKeyState[] {
    return this.keys.map((item) => ({ ...item }));
  }

  private mask(key: string): string {
    if (key.length <= 8) return "****";
    return `${key.slice(0, 4)}****${key.slice(-4)}`;
  }
}
