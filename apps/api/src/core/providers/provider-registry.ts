import { ILlmProvider } from "./provider.interface";
import { ProviderName } from "./provider.types";

export class ProviderRegistry {
  private readonly providers = new Map<ProviderName, ILlmProvider>();

  public register(provider: ILlmProvider): void {
    this.providers.set(provider.name, provider);
  }

  public get(name: ProviderName): ILlmProvider | undefined {
    return this.providers.get(name);
  }

  public list(): Array<{ name: ProviderName; enabled: boolean; model: string }> {
    return Array.from(this.providers.values()).map((provider: ILlmProvider) => ({
      name: provider.name,
      enabled: provider.isEnabled(),
      model: provider.defaultModel,
    }));
  }
}
