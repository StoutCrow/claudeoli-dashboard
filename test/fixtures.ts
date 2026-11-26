// Reads dev/fixtures (the harness's sample vault) into the path → text map the core modules take.
import fs from "node:fs";
import path from "node:path";

export function loadFixtures(root = "dev/fixtures"): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".md")) out[path.relative(root, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  };
  walk(root);
  return out;
}
