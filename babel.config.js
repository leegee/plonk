module.exports = {
  "plugins": [
    "@babel/syntax-dynamic-import",
    [
      "@babel/plugin-transform-runtime",
      {
        "regenerator": true
      }
    ]
  ],
  "presets": [
    [
      "modern-browsers"
    ],
  ]
};

