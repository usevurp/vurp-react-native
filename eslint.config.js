import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["lib", "node_modules", "example"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
