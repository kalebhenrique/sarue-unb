import Foundation
import Network
import Tauri
import WebKit

struct NetworkStatusResponse: Encodable {
  let connectionType: String
  let isMetered: Bool
}

class NetworkStatusPlugin: Plugin {
  private let monitor = NWPathMonitor()
  private let queue = DispatchQueue(label: "br.unb.sarue.networkstatus")
  private let lock = NSLock()
  private var latestPath: NWPath?

  override public init() {
    super.init()
    monitor.pathUpdateHandler = { [weak self] path in
      guard let self = self else { return }
      self.lock.lock()
      self.latestPath = path
      self.lock.unlock()
    }
    monitor.start(queue: queue)
  }

  deinit {
    monitor.cancel()
  }

  private func statusFromPath(_ path: NWPath) -> NetworkStatusResponse {
    if path.status != .satisfied {
      return NetworkStatusResponse(connectionType: "offline", isMetered: false)
    }

    let connectionType: String
    if path.usesInterfaceType(.wifi) {
      connectionType = "wifi"
    } else if path.usesInterfaceType(.cellular) {
      connectionType = "cellular"
    } else if path.usesInterfaceType(.wiredEthernet) {
      connectionType = "ethernet"
    } else {
      connectionType = "other"
    }

    return NetworkStatusResponse(
      connectionType: connectionType,
      isMetered: path.isExpensive
    )
  }

  @objc public func getNetworkStatus(_ invoke: Invoke) {
    lock.lock()
    let cached = latestPath
    lock.unlock()

    if let path = cached {
      invoke.resolve(statusFromPath(path))
      return
    }

    let tempMonitor = NWPathMonitor()
    let onceLock = NSLock()
    var resolved = false
    tempMonitor.pathUpdateHandler = { [weak self] path in
      onceLock.lock()
      let shouldResolve = !resolved
      if shouldResolve {
        resolved = true
      }
      onceLock.unlock()

      if shouldResolve {
        if let self = self {
          invoke.resolve(self.statusFromPath(path))
        } else {
          invoke.resolve(
            NetworkStatusResponse(
              connectionType: path.status == .satisfied ? "other" : "offline",
              isMetered: path.isExpensive
            )
          )
        }
        tempMonitor.cancel()
      }
    }
    tempMonitor.start(queue: queue)
  }
}

@_cdecl("init_plugin_network_status")
public func initPlugin() -> Plugin {
  return NetworkStatusPlugin()
}
