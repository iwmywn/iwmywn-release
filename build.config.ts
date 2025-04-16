import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/index"],
  declaration: false,
  clean: true,
  rollup: {
    esbuild: {
      minify: true,
    },
  },
});
