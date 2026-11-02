const path = require("path");
const webpack = require("webpack");

// Bannière conservée dans main.js : licence et sources du module (le code tiers garde ses propres mentions)
const banner = [
  "geo-dfi " + require("./package.json").version,
  "SPDX-License-Identifier: GPL-3.0-or-later",
  "Source : https://github.com/vienne-condrieu-agglomeration/geo-module-dfi"
].join("\n");

module.exports = {

  entry: { main: path.join(__dirname, "/src/js/extension.js") },
  mode: "production",
  output: {
    path: path.join(__dirname, "/dist"),
    filename: "[name].js"
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      },
      {
        // CHANGELOG.md embarqué en texte brut (journal des nouveautés, voir src/js/changelog.js)
        test: /\.md$/,
        use: "raw-loader"
      },
      {
        // driver.js (visite guidée, MIT) est publié en syntaxe récente (?., ??) que le parseur de
        // webpack 4 ne comprend pas : on ne transpile que ces deux constructions (comme le module Panoramax).
        test: /\.c?js$/,
        include: /node_modules[\\/]driver\.js/,
        use: {
          loader: "babel-loader",
          options: {
            plugins: [
              "@babel/plugin-transform-optional-chaining",
              "@babel/plugin-transform-nullish-coalescing-operator"
            ]
          }
        }
      }
    ]
  },
  externals: {
    angular: "angular"
  },
  resolve: {
    extensions: [".js"],
    // Build CJS de driver.js (le build « module » est en syntaxe que webpack 4 ne lit pas). Alias limité à ce seul paquet
    // (`$` : correspondance exacte, `driver.js/dist/driver.css` reste résolu normalement), comme le module Panoramax.
    alias: {
      "driver.js$": path.join(__dirname, "node_modules/driver.js/dist/driver.js.cjs")
    }
  },
  optimization: {
    minimize: true
  },
  plugins: [
    new webpack.BannerPlugin({ banner: banner, entryOnly: true })
  ]
};
