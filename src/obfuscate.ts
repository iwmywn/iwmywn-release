import { readFileSync, writeFileSync, existsSync } from "fs";
import javascriptObfuscator from "javascript-obfuscator";

const file = "dist/index.mjs";

if (existsSync(file)) {
  const code = readFileSync(file, "utf8");

  const obfuscatedCode = javascriptObfuscator
    .obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      stringArray: true,
      stringArrayThreshold: 0.75,
      stringArrayEncoding: ["rc4"],
      renameGlobals: true,
    })
    .getObfuscatedCode();

  writeFileSync(file, obfuscatedCode, "utf8");
  console.log(`✅ Obfuscated: ${file}`);
} else {
  console.warn(`⚠️ File not found: ${file}`);
}
