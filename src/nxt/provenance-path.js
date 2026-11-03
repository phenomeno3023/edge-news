import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PROVENANCE_APPLICATION_ID = 0x454e5854; // ENXT
export const PROVENANCE_SCHEMA_VERSION = 1;

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const within = (parent, candidate) => {
  if (parent === candidate) return false;
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const withinOrEqual = (parent, candidate) => parent === candidate || within(parent, candidate);

function protectedProductionPaths() {
  const candidates = [
    path.resolve(moduleRoot, 'data/edge-news.sqlite'),
    path.resolve(process.cwd(), 'data/edge-news.sqlite')
  ];
  if (process.env.DB_PATH) candidates.push(path.resolve(process.env.DB_PATH));
  return [...new Set(candidates)];
}

/** Resolve only existing-root paths under a dedicated OS temporary directory. */
export function resolveProvenanceStoragePath({dbPath, allowedRoot} = {}) {
  if (typeof dbPath !== 'string' || !path.isAbsolute(dbPath)) throw new Error('provenance_db_path_must_be_absolute');
  if (typeof allowedRoot !== 'string' || !path.isAbsolute(allowedRoot)) throw new Error('provenance_allowed_root_must_be_absolute');

  const rootInput = path.resolve(allowedRoot);
  const root = fs.realpathSync(rootInput);
  if (root !== rootInput) throw new Error('provenance_allowed_root_must_not_be_symlinked');
  const tempRoot = fs.realpathSync(os.tmpdir());
  if (!within(tempRoot, root)) throw new Error('provenance_allowed_root_must_be_under_os_temp');

  const candidate = path.resolve(dbPath);
  if (!within(root, candidate)) throw new Error('provenance_db_path_outside_allowed_root');
  if (protectedProductionPaths().includes(candidate)) throw new Error('production_database_path_forbidden');

  const parent = fs.realpathSync(path.dirname(candidate));
  if (!withinOrEqual(root, parent)) throw new Error('provenance_db_parent_symlink_escapes_allowed_root');
  const canonical = path.join(parent, path.basename(candidate));
  if (fs.existsSync(canonical)) {
    const stat = fs.lstatSync(canonical);
    if (stat.isSymbolicLink()) throw new Error('provenance_db_file_symlink_forbidden');
    if (!stat.isFile()) throw new Error('provenance_db_path_must_be_file');
    const real = fs.realpathSync(canonical);
    if (!within(root, real)) throw new Error('provenance_db_realpath_outside_allowed_root');
    for (const protectedPath of protectedProductionPaths()) {
      if (!fs.existsSync(protectedPath)) continue;
      const protectedStat = fs.statSync(protectedPath);
      if (stat.dev === protectedStat.dev && stat.ino === protectedStat.ino) throw new Error('production_database_inode_forbidden');
      if (real === fs.realpathSync(protectedPath)) throw new Error('production_database_realpath_forbidden');
    }
  }
  return canonical;
}

export function isWithinPath(parent, candidate) {
  return within(parent, candidate);
}
