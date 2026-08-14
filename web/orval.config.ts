import { defineConfig } from "orval";

export default defineConfig({
  portcullis: {
    input: {
      target: "../openapi.json",
    },
    output: {
      target: "./src/api/generated.ts",
      client: "react-query",
      override: {
        mutator: {
          path: "./src/lib/axios-instance.ts",
          name: "axiosInstance",
        },
      },

    },
  },
});
