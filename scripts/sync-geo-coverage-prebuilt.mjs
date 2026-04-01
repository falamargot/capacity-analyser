import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE_DIR = new URL('../public/coverage/', import.meta.url);
const TARGET_DIR = new URL('../public/coverage-prebuilt/', import.meta.url);
const SUMMARY_MANIFEST_PATH = new URL('../public/coverage-prebuilt/manifest.json', import.meta.url);
const BUILD_SCRIPT_PATH = new URL('./build-geo-coverage-prebuilt.mjs', import.meta.url);
const WATCH_MODE = process.argv.includes('--watch');
const DEBOUNCE_MS = 250;

const isCoverageSourceFile = (fileName) => fileName.endsWith('.json') && fileName !== 'coverageManifest.json';
const getSatelliteIdFromSourceFile = (fileName) => fileName.replace(/\.json$/i, '');

const isSummaryManifestFormat = (data) => (
  typeof data === 'object' &&
  data !== null &&
  data.format === 'geo-coverage-prebuilt-v5' &&
  Array.isArray(data.entries)
);

const readJsonFile = async (path) => JSON.parse(await readFile(path, 'utf8'));

const pathExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const getSourceCoverageFiles = async () => {
  const fileNames = (await readdir(SOURCE_DIR))
    .filter(isCoverageSourceFile)
    .sort();

  return Promise.all(fileNames.map(async (fileName) => {
    const path = new URL(fileName, SOURCE_DIR);
    const sourceStat = await stat(path);

    return {
      fileName,
      satelliteId: getSatelliteIdFromSourceFile(fileName),
      path,
      mtimeMs: sourceStat.mtimeMs,
    };
  }));
};

const getStaleReason = async () => {
  const sourceFiles = await getSourceCoverageFiles();

  if (!await pathExists(SUMMARY_MANIFEST_PATH)) {
    return 'summary manifest missing';
  }

  let summaryManifest;
  try {
    summaryManifest = await readJsonFile(SUMMARY_MANIFEST_PATH);
  } catch {
    return 'summary manifest unreadable';
  }

  if (!isSummaryManifestFormat(summaryManifest)) {
    return 'summary manifest format invalid';
  }

  const entriesBySatelliteId = new Map(
    summaryManifest.entries.map((entry) => [entry.satelliteId, entry]),
  );

  if (entriesBySatelliteId.size !== sourceFiles.length) {
    return 'source/prebuilt file count mismatch';
  }

  for (const sourceFile of sourceFiles) {
    const expectedManifestFileName = `${sourceFile.satelliteId}.manifest.json`;
    const expectedMeshFileName = `${sourceFile.satelliteId}.mesh.bin`;
    const summaryEntry = entriesBySatelliteId.get(sourceFile.satelliteId);

    if (!summaryEntry) {
      return `missing summary entry for ${sourceFile.fileName}`;
    }

    if (
      summaryEntry.manifestFileName !== expectedManifestFileName ||
      summaryEntry.meshFileName !== expectedMeshFileName
    ) {
      return `summary entry mismatch for ${sourceFile.fileName}`;
    }

    const manifestPath = new URL(expectedManifestFileName, TARGET_DIR);
    const meshPath = new URL(expectedMeshFileName, TARGET_DIR);

    if (!await pathExists(manifestPath) || !await pathExists(meshPath)) {
      return `missing prebuilt artifact for ${sourceFile.fileName}`;
    }

    const [manifestStat, meshStat] = await Promise.all([stat(manifestPath), stat(meshPath)]);
    const oldestArtifactMtimeMs = Math.min(manifestStat.mtimeMs, meshStat.mtimeMs);

    if (sourceFile.mtimeMs > oldestArtifactMtimeMs) {
      return `source file newer than prebuilt for ${sourceFile.fileName}`;
    }
  }

  return null;
};

const runBuild = async () => {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(BUILD_SCRIPT_PATH)], {
      stdio: 'inherit',
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`build-geo-coverage-prebuilt exited with code ${code ?? 'null'} (${signal ?? 'no signal'})`));
    });

    child.on('error', reject);
  });
};

const ensurePrebuiltCoverage = async () => {
  const staleReason = await getStaleReason();
  if (!staleReason) {
    console.log('[geo-prebuilt] coverage-prebuilt is up to date.');
    return false;
  }

  console.log(`[geo-prebuilt] rebuilding coverage-prebuilt (${staleReason}).`);
  await runBuild();
  return true;
};

const runWatchMode = async () => {
  const sourceDirPath = fileURLToPath(SOURCE_DIR);
  let rebuildTimer = null;
  let rebuildInFlight = false;
  let rebuildQueued = false;

  const scheduleEnsure = () => {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
    }

    rebuildTimer = setTimeout(async () => {
      rebuildTimer = null;

      if (rebuildInFlight) {
        rebuildQueued = true;
        return;
      }

      rebuildInFlight = true;
      try {
        await ensurePrebuiltCoverage();
      } catch (error) {
        console.error('[geo-prebuilt] sync failed:', error);
      } finally {
        rebuildInFlight = false;
        if (rebuildQueued) {
          rebuildQueued = false;
          scheduleEnsure();
        }
      }
    }, DEBOUNCE_MS);
  };

  await ensurePrebuiltCoverage();

  const watcher = watch(sourceDirPath, (_, fileName) => {
    if (typeof fileName !== 'string' || !isCoverageSourceFile(fileName)) {
      return;
    }
    scheduleEnsure();
  });

  const cleanup = () => {
    watcher.close();
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  console.log('[geo-prebuilt] watching public/coverage for changes.');
};

if (WATCH_MODE) {
  runWatchMode().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  ensurePrebuiltCoverage().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
