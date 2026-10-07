// Las pruebas unitarias viven en test/; se ignoran las copias de trabajo de los agentes (.claude/worktrees).
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, ".claude/**", "e2e/**"] }
});
