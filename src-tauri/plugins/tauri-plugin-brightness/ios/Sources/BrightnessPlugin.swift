import Foundation
import Tauri
import UIKit

struct SetMaxBrightnessArgs: Decodable {
  let enable: Bool
}

class BrightnessPlugin: Plugin {
  private var previousBrightness: CGFloat?
  private var previousIdleTimerDisabled: Bool?

  @objc public func setMaxBrightness(_ invoke: Invoke) {
    do {
      let args = try invoke.parseArgs(SetMaxBrightnessArgs.self)
      DispatchQueue.main.async {
        if args.enable {
          if self.previousBrightness == nil {
            self.previousBrightness = UIScreen.main.brightness
          }
          if self.previousIdleTimerDisabled == nil {
            self.previousIdleTimerDisabled = UIApplication.shared.isIdleTimerDisabled
          }
          UIScreen.main.brightness = 1.0
          UIApplication.shared.isIdleTimerDisabled = true
        } else {
          if let prev = self.previousBrightness {
            UIScreen.main.brightness = prev
            self.previousBrightness = nil
          }
          if let prevIdle = self.previousIdleTimerDisabled {
            UIApplication.shared.isIdleTimerDisabled = prevIdle
            self.previousIdleTimerDisabled = nil
          } else {
            UIApplication.shared.isIdleTimerDisabled = false
          }
        }
        invoke.resolve()
      }
    } catch {
      invoke.reject(error.localizedDescription)
    }
  }
}

@_cdecl("init_plugin_brightness")
public func initPlugin() -> Plugin {
  return BrightnessPlugin()
}
