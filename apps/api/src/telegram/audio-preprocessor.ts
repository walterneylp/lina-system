import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type PreprocessAudioInput = {
  filename: string;
  content: Buffer;
};

type PreprocessAudioOutput = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

export class AudioPreprocessor {
  public async transcodeToWav(input: PreprocessAudioInput): Promise<PreprocessAudioOutput> {
    const workdir = join(tmpdir(), "lina-audio", randomUUID());
    const sourcePath = join(workdir, input.filename);
    const outputPath = join(workdir, "normalized.wav");

    await mkdir(workdir, { recursive: true });
    await writeFile(sourcePath, input.content);

    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        sourcePath,
        "-ar",
        "16000",
        "-ac",
        "1",
        outputPath,
      ]);

      const output = await readFile(outputPath);

      return {
        filename: "telegram-audio.wav",
        mimeType: "audio/wav",
        content: output,
      };
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  }
}
