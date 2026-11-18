import Foundation
import Tauri
import UIKit

struct ShareImageArgs: Decodable {
  let base64Png: String
  let filename: String
  let title: String?
}

class SharePlugin: Plugin {
  @objc public func shareImage(_ invoke: Invoke) {
    do {
      let args = try invoke.parseArgs(ShareImageArgs.self)
      let rawBase64: String
      if let range = args.base64Png.range(of: "base64,") {
        rawBase64 = String(args.base64Png[range.upperBound...])
      } else {
        rawBase64 = args.base64Png
      }

      guard let imageData = Data(base64Encoded: rawBase64, options: .ignoreUnknownCharacters) else {
        invoke.reject("Base64 inválido para shareImage")
        return
      }

      let safeName = (args.filename as NSString).lastPathComponent
      let finalName = safeName.isEmpty ? "grade-unb.png" : safeName
      let fileUrl = FileManager.default.temporaryDirectory.appendingPathComponent(finalName)
      try imageData.write(to: fileUrl, options: .atomic)

      DispatchQueue.main.async {
        guard let vc = self.manager.viewController else {
          invoke.reject("ViewController indisponível para compartilhamento")
          return
        }
        let activityVC = UIActivityViewController(activityItems: [fileUrl], applicationActivities: nil)
        if let popover = activityVC.popoverPresentationController {
          popover.sourceView = vc.view
          popover.sourceRect = CGRect(
            x: vc.view.bounds.midX,
            y: vc.view.bounds.midY,
            width: 0,
            height: 0
          )
          popover.permittedArrowDirections = []
        }
        vc.present(activityVC, animated: true) {
          invoke.resolve()
        }
      }
    } catch {
      invoke.reject(error.localizedDescription)
    }
  }
}

@_cdecl("init_plugin_share")
public func initPlugin() -> Plugin {
  return SharePlugin()
}
