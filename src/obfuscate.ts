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

  const byteSize = Buffer.byteLength(obfuscatedCode, "utf8");
  const sizeInKB = (byteSize / 1024).toFixed(2);

  console.log(`✅ Obfuscated: ${file}`);
  console.log(`📦 Size: ${sizeInKB} kB`);
} else {
  console.warn(`⚠️ File not found: ${file}`);
}
