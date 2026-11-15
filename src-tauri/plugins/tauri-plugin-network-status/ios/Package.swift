// swift-tools-version:5.3

import PackageDescription

let package = Package(
  name: "tauri-plugin-network-status",
  platforms: [
    .macOS(.v10_14),
    .iOS(.v13),
  ],
  products: [
    .library(
      name: "tauri-plugin-network-status",
      type: .static,
      targets: ["tauri-plugin-network-status"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-network-status",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
