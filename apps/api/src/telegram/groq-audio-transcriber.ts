type GroqAudioTranscriberOptions = {
  apiKey?: string;
  model: string;
};

export class GroqAudioTranscriber {
  constructor(private readonly options: GroqAudioTranscriberOptions) {}

  public isEnabled(): boolean {
    return Boolean(this.options.apiKey);
  }

  public async transcribe(input: {
    filename: string;
    content: Buffer;
    mimeType?: string;
  }): Promise<string> {
    if (!this.options.apiKey) {
      throw new Error("Groq transcription is not configured");
    }

    const formData = new FormData();
    const binary = new Uint8Array(input.content);
    const file = new File([binary], input.filename, {
      type: input.mimeType || "application/octet-stream",
    });

    formData.append("file", file);
    formData.append("model", this.options.model);
    formData.append("response_format", "verbose_json");
    formData.append("language", "pt");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[groq-transcription] request failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { text?: string };
    return (data.text || "").trim();
  }
}
