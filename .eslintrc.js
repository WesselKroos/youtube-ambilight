/* eslint-env node */
module.exports = {
    "env": {
        "browser": true,
        "es2021": true
    },
    "extends": "eslint:recommended",
    "globals": {
        "ambientlight": true,
        "cookieStore": true
    },
    "overrides": [
    ],
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "rules": {
        "no-unused-vars": "warn",
        "no-irregular-whitespace": ["error", { skipTemplates: true } ],
        "require-await": "error",
        "no-empty": "off"
    },
    "reportUnusedDisableDirectives": true
}
