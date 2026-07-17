import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...coreWebVitals,
  {
    ignores: [".next/**", "node_modules/**", "public/sw.js", "scripts/**"],
  },
  {
    rules: {
      "@next/next/no-img-element": "off",
      // These are advisory React-Compiler rules. We intentionally load
      // persisted state from localStorage inside mount effects (required for
      // hydration safety) and use the common "latest callback in a ref"
      // pattern, both of which these rules flag. They are correct here.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default config;
