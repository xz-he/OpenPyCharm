import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { pythonProjectFiles } from "../src/features/app/pythonTemplate.ts";

const destination = process.argv[2];
if (!destination) throw new Error("Usage: node scripts/create-python-example.ts <new-directory>");
const root = resolve(destination);
await mkdir(root);
for (const file of pythonProjectFiles(basename(root))) {
  const path = resolve(root, file.path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, file.content, { flag: "wx" });
}
process.stdout.write(root + "\n");
