import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
]);

const CONFIG = {
  publicDir: path.resolve(
    process.env.PUBLIC_IMAGES_DIR || "public/images",
  ),
  rawDir: path.resolve(
    process.env.RAW_IMAGES_DIR || "assets/raw-images",
  ),
  maxSizeBytes:
    Number(process.env.MAX_IMAGE_SIZE_MB || 5) * 1024 * 1024,
  targetWidth: Number(process.env.IMAGE_TARGET_WIDTH || 1600),
  jpegQuality: Number(process.env.IMAGE_JPEG_QUALITY || 85),
  pngCompression: Number(process.env.IMAGE_PNG_COMPRESSION || 9),
};

const OPTIMIZED_META_DIR = path.join(CONFIG.rawDir, ".optimized");

function formatSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function ensureDirExists(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function getFilesRecursively(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getFilesRecursively(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function getRelativeKey(filePath) {
  const relativeToPublic = path.relative(CONFIG.publicDir, filePath);
  return relativeToPublic.startsWith("..")
    ? path.basename(filePath)
    : relativeToPublic;
}

function buildRawPath(rawDir, publicPath) {
  return path.join(rawDir, getRelativeKey(publicPath));
}

function parseArgs(argv) {
  const options = {
    onlyLarge: false,
    useRaw: false,
    dryRun: false,
    check: false,
    files: [],
  };

  for (const arg of argv) {
    if (arg === "--only-large" || arg === "--large-only") {
      options.onlyLarge = true;
    } else if (arg === "--dry-run" || arg === "-n") {
      options.dryRun = true;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--use-raw") {
      options.useRaw = true;
    } else if (arg === "--all") {
      // Retained for backwards compatibility; default already optimizes all files.
    } else {
      options.files.push(path.resolve(arg));
    }
  }

  return options;
}

async function findRawVariant(rawDir, publicPath) {
  const preferredPath = buildRawPath(rawDir, publicPath);
  if (fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  const fallbackPath = path.join(rawDir, path.basename(publicPath));
  if (fallbackPath !== preferredPath && fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }

  if (!fs.existsSync(rawDir)) {
    return null;
  }

  const baseName = path.parse(publicPath).name;
  const files = await getFilesRecursively(rawDir);
  for (const file of files) {
    if (path.parse(file).name === baseName) {
      return file;
    }
  }

  return null;
}

function getSentinelPath(filePath) {
  const key = getRelativeKey(filePath).replace(/[\\/]/g, "__");
  return path.join(OPTIMIZED_META_DIR, `${key}.json`);
}

async function prepareSourceImage(
  publicPath,
  rawDir,
  { dryRun },
  existingRawPath,
) {
  let rawPath =
    existingRawPath || buildRawPath(rawDir, publicPath);

  if (existingRawPath) {
    return {
      rawPath: existingRawPath,
      copied: false,
      sourcePath: existingRawPath,
      needsCopy: false,
    };
  }

  if (fs.existsSync(rawPath)) {
    return {
      rawPath,
      copied: false,
      sourcePath: rawPath,
      needsCopy: false,
    };
  }

  const fallbackRaw = await findRawVariant(
    rawDir,
    publicPath,
  );

  if (fallbackRaw) {
    return {
      rawPath: fallbackRaw,
      copied: false,
      sourcePath: fallbackRaw,
      needsCopy: false,
    };
  }

  if (dryRun) {
    return {
      rawPath,
      copied: false,
      sourcePath: publicPath,
      needsCopy: true,
    };
  }

  await ensureDirExists(path.dirname(rawPath));
  await fs.promises.copyFile(publicPath, rawPath);
  return {
    rawPath,
    copied: true,
    sourcePath: rawPath,
    needsCopy: true,
  };
}

function getTargetFormat(ext) {
  if (ext === ".png") {
    return "png";
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    return "jpeg";
  }

  console.log(
    `[optimize-images] Converting ${ext || "unknown"} to JPEG output.`,
  );

  return "jpeg";
}

async function optimizeImage(
  sourcePath,
  destinationPath,
  format,
  { dryRun },
) {
  let pipeline = sharp(sourcePath).resize({
    width: CONFIG.targetWidth,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (format === "png") {
    pipeline = pipeline.png({
      compressionLevel: CONFIG.pngCompression,
      adaptiveFiltering: true,
    });
  } else {
    pipeline = pipeline.jpeg({
      quality: CONFIG.jpegQuality,
      mozjpeg: true,
    });
  }

  const buffer = await pipeline.toBuffer();

  if (!dryRun) {
    await fs.promises.writeFile(destinationPath, buffer);
  }

  return buffer.length;
}

function resolveDestinationPath(filePath, targetExtension) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}${targetExtension}`);
}

async function ensureSentinel(filePath, data) {
  await ensureDirExists(OPTIMIZED_META_DIR);
  const sentinelPath = getSentinelPath(filePath);
  await fs.promises.writeFile(
    sentinelPath,
    JSON.stringify(
      {
        optimizedAt: new Date().toISOString(),
        ...data,
      },
      null,
      2,
    ),
  );
}

async function main() {
  if (!fs.existsSync(CONFIG.publicDir)) {
    console.error(`[optimize-images] Directory not found: ${CONFIG.publicDir}`);
    process.exit(1);
  }

  const {
    onlyLarge,
    useRaw,
    dryRun: rawDryRun,
    check,
    files,
  } = parseArgs(process.argv.slice(2));
  const dryRun = rawDryRun || check;

  if (dryRun) {
    console.log("[optimize-images] Dry run enabled; no files will be modified.");
  }

  const candidates = files.length
    ? files
    : (await getFilesRecursively(CONFIG.publicDir)).filter((file) =>
        IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()),
      );

  if (candidates.length === 0) {
    console.log("[optimize-images] No matching images found.");
    return;
  }

  const processedReports = [];
  let optimizedCount = 0;
  let skippedCount = 0;
  let copiesMade = 0;
  let copiesPlanned = 0;
  let alreadyOptimizedCount = 0;

  for (const filePath of candidates) {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      continue;
    }

    const stats = await fs.promises.stat(filePath);
    const sentinelPath = getSentinelPath(filePath);
    const sentinelExists = fs.existsSync(sentinelPath);
    const existingRawPath = await findRawVariant(
      CONFIG.rawDir,
      filePath,
    );

    if (
      sentinelExists &&
      !existingRawPath &&
      !dryRun
    ) {
      console.warn(
        `[optimize-images] Sentinel exists for ${path.relative(process.cwd(), filePath)} but raw backup is missing. Recreating backup and re-optimizing.`,
      );
    }

    if (sentinelExists && !useRaw && existingRawPath) {
      alreadyOptimizedCount += 1;
      skippedCount += 1;
      console.log(
        `[optimize-images] Skipping ${path.relative(process.cwd(), filePath)} (already optimized). Use --use-raw to reprocess.`,
      );
      continue;
    }

    if (onlyLarge && stats.size <= CONFIG.maxSizeBytes) {
      skippedCount += 1;
      continue;
    }

    const { rawPath, copied, sourcePath, needsCopy } =
      await prepareSourceImage(
        filePath,
        CONFIG.rawDir,
        { dryRun },
        existingRawPath,
      );

    const report = {
      path: path.relative(process.cwd(), filePath),
      beforeSize: stats.size,
      afterSize: undefined,
      destinationPath: path.relative(process.cwd(), filePath),
      actions: [],
      warnings: [],
    };

    if (copied) {
      copiesMade += 1;
      report.actions.push(
        `backed up original -> ${path.relative(process.cwd(), rawPath)}`,
      );
    } else if (needsCopy && dryRun) {
      copiesPlanned += 1;
      report.actions.push(
        `would back up original -> ${path.relative(process.cwd(), rawPath)}`,
      );
    }

    const targetFormat = getTargetFormat(ext);
    const targetExtension =
      targetFormat === "png"
        ? ".png"
        : ext === ".jpg" || ext === ".jpeg"
          ? ext
          : ".jpg";
    const destinationPath =
      targetExtension === ext
        ? filePath
        : resolveDestinationPath(filePath, targetExtension);

    if (
      destinationPath !== filePath &&
      !dryRun &&
      fs.existsSync(destinationPath)
    ) {
      console.warn(
        `[optimize-images] Skipping ${path.relative(process.cwd(), filePath)} because ${path.relative(process.cwd(), destinationPath)} already exists.`,
      );
      skippedCount += 1;
      continue;
    }

    const outputSize = await optimizeImage(
      sourcePath,
      destinationPath,
      targetFormat,
      {
        dryRun,
      },
    );

    if (outputSize === null) {
      continue;
    }

    optimizedCount += 1;
    report.afterSize = outputSize;
    report.destinationPath = path.relative(process.cwd(), destinationPath);

    if (destinationPath !== filePath) {
      if (dryRun) {
        report.actions.push("would remove original after conversion");
      } else {
        await fs.promises.unlink(filePath);
        report.actions.push("removed original after conversion");
      }
    }

    if (outputSize > CONFIG.maxSizeBytes) {
      report.warnings.push(
        `still exceeds size limit (${formatSize(outputSize)} > ${formatSize(CONFIG.maxSizeBytes)})`,
      );
    }

    if (!dryRun) {
      await ensureSentinel(filePath, {
        rawPath: path.relative(process.cwd(), rawPath),
        outputPath: path.relative(process.cwd(), destinationPath),
        targetFormat,
        targetWidth: CONFIG.targetWidth,
        sizeBytes: outputSize,
      });
      report.actions.push("marked optimized");
    } else if (!sentinelExists) {
      report.actions.push("would mark image as optimized");
    }

    processedReports.push(report);
  }

  if (processedReports.length > 0) {
    console.log(
      `\n[optimize-images] ${dryRun ? "Dry run" : "Processed"} ${processedReports.length} file(s):`,
    );
    processedReports.forEach((report, index) => {
      console.log(
        `  ${index + 1}. ${report.path}`,
      );
      if (report.beforeSize !== undefined && report.afterSize !== undefined) {
        console.log(
          `       size: ${formatSize(report.beforeSize)} -> ${formatSize(report.afterSize)}`,
        );
      }
      if (report.destinationPath !== report.path) {
        console.log(
          `       renamed: ${report.path} -> ${report.destinationPath}`,
        );
      }
      report.actions.forEach((action) => {
        console.log(`       - ${action}`);
      });
      report.warnings.forEach((warning) => {
        console.warn(`       ! ${warning}`);
      });
    });
  }

  console.log(
    `\n[optimize-images] ${dryRun ? "Dry run completed." : "Completed."} Optimized ${optimizedCount} file(s), skipped ${skippedCount}, already optimized ${alreadyOptimizedCount}, new backups ${copiesMade}${dryRun && copiesPlanned ? ` (would back up ${copiesPlanned} file(s))` : ""}.`,
  );

  if (check) {
    if (optimizedCount > 0) {
      console.error(
        `[optimize-images] ${optimizedCount} image(s) would be optimized. Run npm run images:optimize.`,
      );
      process.exit(1);
    } else {
      console.log("[optimize-images] All images are already optimized.");
    }
  }
}

main().catch((error) => {
  console.error("[optimize-images] Failed to optimize images:", error);
  process.exit(1);
});
