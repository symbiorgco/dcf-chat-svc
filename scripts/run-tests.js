const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const bannedFile = path.join(process.cwd(), "banned.json");
const createdBannedFile = !fs.existsSync(bannedFile);
const distDir = path.join(process.cwd(), "dist");

const findTestFiles = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return findTestFiles(entryPath);
    }

    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      return [entryPath];
    }

    return [];
  });
};

const testFiles = findTestFiles(distDir).sort();

if (testFiles.length === 0) {
  console.error("No compiled test files were discovered under dist.");
  process.exit(1);
}

if (createdBannedFile) {
  fs.writeFileSync(bannedFile, "[]\n", "utf8");
}

const result = spawnSync(
  process.execPath,
  ["--test", "--test-reporter=tap", ...testFiles],
  {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
  },
);

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (createdBannedFile) {
  fs.rmSync(bannedFile, { force: true });
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  console.error(`Test runner terminated with signal ${result.signal}`);
  process.exit(1);
}

const testCountMatch = result.stdout.match(/^# tests\s+(\d+)$/m);
const testCount = testCountMatch ? Number.parseInt(testCountMatch[1], 10) : 0;

if (result.status !== 0) {
  process.exit(result.status || 1);
}

if (!Number.isInteger(testCount) || testCount <= 0) {
  console.error("Test runner reported zero tests; failing strict test gate.");
  process.exit(1);
}
