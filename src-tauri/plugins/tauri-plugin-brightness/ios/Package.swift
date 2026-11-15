// swift-tools-version:5.3

import PackageDescription

let package = Package(
  name: "tauri-plugin-brightness",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v13),
  ],
  products: [
    .library(
      name: "tauri-plugin-brightness",
      type: .static,
      targets: ["tauri-plugin-brightness"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-brightness",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
