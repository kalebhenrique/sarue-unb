use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionType {
    Wifi,
    Cellular,
    Ethernet,
    Offline,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatus {
    pub connection_type: ConnectionType,
    pub is_metered: bool,
}

impl Default for NetworkStatus {
    fn default() -> Self {
        Self {
            connection_type: ConnectionType::Wifi,
            is_metered: false,
        }
    }
}
