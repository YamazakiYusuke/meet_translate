export default {
  files: ["**/*.js"],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module"
  },
  rules: {
    semi: "error",
    "no-unused-vars": "warn",
    "no-undef": "error"
  }
}; 