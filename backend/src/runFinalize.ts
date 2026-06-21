import { tryFinalize } from "./finalizer.js";

async function main() {
  console.log("[runFinalize] Running one-off finalizer...");
  try {
    await tryFinalize();
    console.log("[runFinalize] Done");
    process.exit(0);
  } catch (err) {
    console.error("[runFinalize] Error:", err);
    process.exit(1);
  }
}

void main();
