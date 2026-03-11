import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type RuntimeLockOptions = {
  lockFilePath: string;
};

export class RuntimeLock {
  private releaseHandler?: () => Promise<void>;

  constructor(private readonly options: RuntimeLockOptions) {}

  public async acquire(): Promise<void> {
    await mkdir(dirname(this.options.lockFilePath), { recursive: true });

    try {
      await this.createLockFile();
      return;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "EEXIST") {
        throw error;
      }
    }

    const stalePid = await this.readLockPid();

    if (!stalePid || this.isProcessAlive(stalePid)) {
      throw new Error(
        `Another LiNa instance is already running${stalePid ? ` (pid ${stalePid})` : ""}`
      );
    }

    await rm(this.options.lockFilePath, { force: true });
    await this.createLockFile();
  }

  public async release(): Promise<void> {
    if (this.releaseHandler) {
      await this.releaseHandler();
      this.releaseHandler = undefined;
    }
  }

  private async createLockFile(): Promise<void> {
    const handle = await open(this.options.lockFilePath, "wx");
    const payload = JSON.stringify(
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    );

    await writeFile(this.options.lockFilePath, payload, "utf8");
    await handle.close();

    this.releaseHandler = async () => {
      await rm(this.options.lockFilePath, { force: true });
    };
  }

  private async readLockPid(): Promise<number | null> {
    try {
      const raw = await readFile(this.options.lockFilePath, "utf8");
      const payload = JSON.parse(raw) as { pid?: number };
      return Number.isInteger(payload.pid) ? (payload.pid as number) : null;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
