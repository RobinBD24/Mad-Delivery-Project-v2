import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function ensureIsolatedTestDatabaseFile({
  projectRoot,
  databasePath,
}) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedDatabase = path.resolve(databasePath);
  const relativeDatabase = path.relative(resolvedRoot, resolvedDatabase);

  if (
    relativeDatabase === "" ||
    relativeDatabase.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeDatabase)
  ) {
    throw new Error("The isolated test database must stay inside the project root");
  }

  await mkdir(path.dirname(resolvedDatabase), { recursive: true });
  const databaseFile = await open(resolvedDatabase, "a");
  await databaseFile.close();

  return resolvedDatabase;
}

async function runCli() {
  const projectRoot = process.cwd();
  const databasePath = path.join(projectRoot, "prisma", "test.db");
  await ensureIsolatedTestDatabaseFile({ projectRoot, databasePath });
  process.stdout.write("Isolated SQLite test database file is ready.\n");
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  await runCli();
}

