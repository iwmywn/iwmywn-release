import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/index", "iwmywn-release.schema.json"],
  declaration: false,
  clean: true,
  rollup: {
    esbuild: {
      minify: true,
    },
  },
});
