import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promptTunerAgent } from "../src/ai/promptTunerAgent.js";

function getArgValue(args, name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const id = getArgValue(args, "--id");
  const seedPathArg = getArgValue(args, "--seed");
  const outPathArg = getArgValue(args, "--out");

  if (!id && !seedPathArg) {
    throw new Error("Usage: npm run tune:character -- --id yrsa or --seed ./character-seeds/yrsa.json");
  }

  const repoRoot = process.cwd();
  const seedPath = seedPathArg
    ? path.resolve(repoRoot, seedPathArg)
    : path.resolve(repoRoot, "character-seeds", `${id}.json`);
  const outPath = outPathArg
    ? path.resolve(repoRoot, outPathArg)
    : path.resolve(repoRoot, "generated-character-packs", `${id ?? path.parse(seedPath).name}.json`);

  const seedText = await fs.readFile(seedPath, "utf8");
  const seed = JSON.parse(seedText);
  const tunedPack = await promptTunerAgent.tuneCharacter(seed);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(tunedPack, null, 2)}\n`, "utf8");

  process.stdout.write(`${outPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
