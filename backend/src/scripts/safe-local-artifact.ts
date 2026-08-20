import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function isWithin(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
}

export function requireExternalOutputPath(argv: string[]): string {
  const outputIndex = argv.indexOf('--output');
  const outputValue = outputIndex >= 0 ? argv[outputIndex + 1] : undefined;
  if (!outputValue || outputValue.startsWith('--')) {
    throw new Error('Ange en explicit utdatafil utanför repot med --output <absolut sökväg>.');
  }
  if (!isAbsolute(outputValue)) {
    throw new Error('Utdatafilen måste anges med en absolut sökväg.');
  }

  const outputPath = resolve(outputValue);
  if (isWithin(REPO_ROOT, outputPath)) {
    throw new Error('Känsliga lokala utdrag får inte skrivas i repot. Välj en skyddad katalog utanför repot.');
  }
  const parent = dirname(outputPath);
  mkdirSync(parent, { recursive: true });

  const realRepoRoot = realpathSync(REPO_ROOT);
  const realParent = realpathSync(parent);
  if (isWithin(realRepoRoot, realParent)) {
    throw new Error('Känsliga lokala utdrag får inte skrivas i repot. Välj en skyddad katalog utanför repot.');
  }
  if (existsSync(outputPath) && !argv.includes('--overwrite')) {
    throw new Error('Utdatafilen finns redan. Välj en ny fil eller bekräfta ersättning med --overwrite.');
  }
  return outputPath;
}

export function writeSensitiveArtifact(outputPath: string, content: string): void {
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  try {
    // POSIX gets an explicit owner-only mode. Windows inherits the protected
    // destination directory ACL; passing a POSIX mode can fail under sandboxes.
    writeFileSync(temporaryPath, content, {
      encoding: 'utf8',
      flag: 'wx',
      ...(process.platform === 'win32' ? {} : { mode: 0o600 }),
    });
    renameSync(temporaryPath, outputPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}
