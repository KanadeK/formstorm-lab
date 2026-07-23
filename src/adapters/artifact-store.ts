import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ArtifactReference, ArtifactStoreOptions, ArtifactWriteEvent } from "./types.js";

export class ArtifactPathError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ArtifactPathError";
  }
}

export class ArtifactStore {
  readonly #options: ArtifactStoreOptions;
  readonly #root: string;
  readonly #written: ArtifactWriteEvent[] = [];

  public constructor(rootDir: string, options: ArtifactStoreOptions = {}) {
    this.#root = resolve(rootDir);
    this.#options = options;
  }

  public get rootDir(): string {
    return this.#root;
  }

  public get events(): readonly ArtifactWriteEvent[] {
    return [...this.#written];
  }

  public async ensure(): Promise<void> {
    await mkdir(this.#root, { recursive: true });
  }

  public pathFor(relativePath: string): string {
    if (relativePath.length === 0 || isAbsolute(relativePath)) {
      throw new ArtifactPathError("Artifact paths must be non-empty and relative.");
    }
    const absolutePath = resolve(this.#root, relativePath);
    const relativeToRoot = relative(this.#root, absolutePath);
    if (
      relativeToRoot === ".." ||
      relativeToRoot.startsWith(`..${sep}`) ||
      isAbsolute(relativeToRoot)
    ) {
      throw new ArtifactPathError(`Artifact path escapes the output directory: ${relativePath}`);
    }
    return absolutePath;
  }

  public async write(
    relativePath: string,
    data: string | Uint8Array,
    kind: ArtifactReference["kind"],
  ): Promise<ArtifactReference> {
    const absolutePath = this.pathFor(relativePath);
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, data);
    const normalizedRelativePath = relative(this.#root, absolutePath).split(sep).join("/");
    const event = { absolutePath, kind, relativePath: normalizedRelativePath } as const;
    this.#written.push(event);
    this.#options.onWrite?.(event);
    return { kind, path: normalizedRelativePath };
  }
}
