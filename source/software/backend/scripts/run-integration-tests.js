import { spawnSync } from "node:child_process";

const testFiles = [
  "test/api.integration.test.js",
  "test/face-flow.test.js"
];

for (const testFile of testFiles) {
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", testFile],
    {
      cwd: process.cwd(),
      env: { ...process.env, RUN_INTEGRATION: "1" },
      stdio: "inherit"
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
