use crate::models::{Course, FeedItem, FeedItemType, PlatformType};
use serde_json::Value;
use std::collections::HashSet;
use tauri::AppHandle;

pub struct HiddenWebviewScraper;

impl HiddenWebviewScraper {
    /// Sincronização do Teams via Hidden Webview + cliente HTTP nativo Rust (reqwest)
    pub async fn sync_teams(
        app: &AppHandle,
        _email: &str,
        _senha: &str,
    ) -> Result<(Vec<FeedItem>, Vec<Course>), String> {
        #[cfg(not(desktop))]
        {
            let _ = (app, _email, _senha);
            Err("Sincronização do Microsoft Teams não é suportada no mobile.".into())
        }
        #[cfg(desktop)]
        {
            use std::sync::{Arc, Mutex};
            use tauri::{WebviewUrl, WebviewWindowBuilder};

            use tauri::Manager;
            for (label, existing_win) in app.webview_windows() {
                if label.starts_with("scraper-teams-") {
                    let _ = existing_win.destroy();
                }
            }

            let window_label = format!(
                "scraper-teams-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis()
            );
            let target_url = "https://teams.microsoft.com";

            log::info!(
                "Iniciando webview 100% invisível em segundo plano para sincronizar Teams: {}",
                window_label
            );

            let (tx, rx) =
                tokio::sync::oneshot::channel::<Result<(Vec<FeedItem>, Vec<Course>), String>>();
            let tx_cell = Arc::new(Mutex::new(Some(tx)));
            let tx_clone_nav = tx_cell.clone();

            let chunks_map = Arc::new(Mutex::new(
                std::collections::BTreeMap::<usize, String>::new(),
            ));
            let chunks_clone = chunks_map.clone();

            let raw_payload_cell = Arc::new(Mutex::new(String::new()));
            let raw_payload_clone = raw_payload_cell.clone();

            let modern_ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

            let auto_crawl_script =
                format!("window.__unb_auto_crawl = true;\n{}", TEAMS_CRAWLER_SCRIPT);

            let maybe_window = WebviewWindowBuilder::new(
                app,
                &window_label,
                WebviewUrl::External(
                    target_url
                        .parse()
                        .map_err(|e| format!("URL inválida: {}", e))?,
                ),
            )
            .inner_size(1200.0, 800.0)
            .visible(false)
            .focused(false)
            .skip_taskbar(true)
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
            .user_agent(modern_ua)
            .initialization_script(&auto_crawl_script)
            .on_navigation(move |url| {
                let is_bridge = url.scheme() == "unb-bridge"
                    || url.path().starts_with("/__aggregator_bridge__")
                    || url.host_str() == Some("__aggregator_bridge__");

                if is_bridge {
                    let mut action = String::new();
                    if url.scheme() == "unb-bridge" {
                        if let Some(host) = url.host_str() {
                            action = host.to_string();
                        }
                    }
                    let mut payload_str = String::new();
                    let mut chunk_str = String::new();
                    let mut seq: usize = 0;
                    let mut total: usize = 1;
                    let mut error_msg = String::new();

                    for (k, v) in url.query_pairs() {
                        if k == "action" {
                            action = v.to_string();
                        } else if k == "payload" {
                            payload_str = v.to_string();
                        } else if k == "chunk" {
                            chunk_str = v.to_string();
                        } else if k == "seq" {
                            seq = v.parse().unwrap_or(0);
                        } else if k == "total" {
                            total = v.parse().unwrap_or(1);
                        } else if k == "error" {
                            error_msg = v.to_string();
                        }
                    }

                    if action == "sync_error" || !error_msg.is_empty() {
                        if let Ok(mut lock) = tx_clone_nav.lock() {
                            if let Some(sender) = lock.take() {
                                let _ = sender.send(Err(if error_msg.is_empty() {
                                    "Erro durante sincronização do Teams".into()
                                } else {
                                    error_msg
                                }));
                            }
                        }
                    } else if action == "sync_chunk" {
                        let mut completed_payload: Option<String> = None;
                        if let Ok(mut chunks) = chunks_clone.lock() {
                            chunks.insert(seq, chunk_str);
                            if chunks.len() >= total && total > 0 {
                                let mut full_payload = String::new();
                                for i in 0..total {
                                    if let Some(piece) = chunks.get(&i) {
                                        full_payload.push_str(piece);
                                    }
                                }
                                completed_payload = Some(full_payload);
                            }
                        }
                        if let Some(full_payload) = completed_payload {
                            if let Ok(mut raw_lock) = raw_payload_clone.lock() {
                                *raw_lock = full_payload.clone();
                            }
                            let parsed = parse_teams_bridge_payload(&full_payload);
                            if let Ok(mut lock) = tx_clone_nav.lock() {
                                if let Some(sender) = lock.take() {
                                    let _ = sender.send(Ok(parsed));
                                }
                            }
                        }
                    } else {
                        if let Ok(mut raw_lock) = raw_payload_clone.lock() {
                            *raw_lock = payload_str.clone();
                        }
                        let parsed = parse_teams_bridge_payload(&payload_str);
                        if let Ok(mut lock) = tx_clone_nav.lock() {
                            if let Some(sender) = lock.take() {
                                let _ = sender.send(Ok(parsed));
                            }
                        }
                    }
                    return false;
                }
                true
            })
            .build();

            let window = match maybe_window {
                Ok(w) => w,
                Err(e) => {
                    log::error!("Falha ao instanciar WebviewWindow para Teams: {}", e);
                    return Err(format!(
                        "Falha ao inicializar sincronizador do Teams: {}",
                        e
                    ));
                }
            };

            let sync_result: Result<(Vec<FeedItem>, Vec<Course>), String> =
                match tokio::time::timeout(tokio::time::Duration::from_secs(45), rx).await {
                    Ok(Ok(inner_res)) => inner_res,
                    Ok(Err(_)) => Err(
                        "Comunicação com a janela do Teams em segundo plano interrompida.".into(),
                    ),
                    Err(_) => {
                        log::warn!("[Teams Sync] Timeout no rastreamento do Teams.");
                        Ok((Vec::new(), Vec::new()))
                    }
                };

            let _ = window
                .eval("try { window.stop(); window.location.replace('about:blank'); } catch(e) {}");
            let _ = window.hide();
            let _ = window.destroy();
            log::info!("Webview em segundo plano do Teams finalizada e destruída com sucesso.");

            let (items, courses) = sync_result?;
            let raw_payload = raw_payload_cell
                .lock()
                .map(|l| l.clone())
                .unwrap_or_default();
            let (enriched_items, enriched_courses) =
                enrich_teams_via_reqwest(&raw_payload, items, courses).await;
            Ok((enriched_items, enriched_courses))
        }
    }
}

pub const TEAMS_CRAWLER_SCRIPT: &str = r##"
(function() {
    if (window !== window.top) return;
    if (window.__aggregator_crawler_installed) return;
    window.__aggregator_crawler_installed = true;

    const debugLogs = [];
    function logDebug(msg) {
        try {
            const line = '[' + new Date().toISOString().slice(11, 19) + '] ' + msg;
            debugLogs.push(line);
            console.log('[Teams Crawler]', line);
        } catch (e) {}
    }

    const host = (window.location.hostname || '').toLowerCase();
    if (host.includes('microsoftonline.com') || host.includes('live.com') || host.includes('msauth.net')) {
        return;
    }

    window.focus = function() {};
    document.focus = function() {};

    // =========================================================================
    // 1. CAPTURA DE TOKENS MSAL (STORAGE + INDEXEDDB + FETCH + WORKER)
    // =========================================================================
    const netState = {
        tokens: {
            ic3: '',
            chatsvcagg: '',
            spaces: '',
            graph: '',
            assignments: '',
            skypeToken: '',
            anyBearer: ''
        },
        refreshTokens: [],
        allJwts: [],
        region: 'amer',
        origin: window.location.origin || 'https://teams.microsoft.com',
        userEmail: '',
        capturedTeamsPayloads: [],
        capturedMessagesArrays: []
    };
    window.__unb_net_state = netState;

    function decodeJwtPayload(jwt) {
        try {
            if (!jwt || typeof jwt !== 'string') return null;
            const clean = jwt.replace(/^Bearer\s+/i, '').trim();
            const parts = clean.split('.');
            if (parts.length !== 3) return null;
            let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4 !== 0) b64 += '=';
            const jsonStr = decodeURIComponent(
                Array.prototype.map.call(atob(b64), function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join('')
            );
            return JSON.parse(jsonStr);
        } catch (e) {
            return null;
        }
    }

    function registerBearerToken(rawToken, sourceHint) {
        if (!rawToken || typeof rawToken !== 'string') return;
        const clean = rawToken.replace(/^Bearer\s+/i, '').trim();
        if (!clean.startsWith('eyJ') || clean.length < 60) return;

        const claims = decodeJwtPayload(clean);
        if (claims) {
            const nowSec = Math.floor(Date.now() / 1000);
            if (claims.exp && claims.exp < nowSec - 60) {
                return;
            }
            const possibleEmails = [claims.upn, claims.preferred_username, claims.unique_name, claims.email];
            for (const em of possibleEmails) {
                if (typeof em === 'string' && em.includes('@') && !netState.userEmail) {
                    netState.userEmail = em.trim();
                }
            }
        }

        const aud = ((claims && (claims.aud || claims.resource)) || '').toString().toLowerCase();
        const scp = ((claims && claims.scp) || '').toString().toLowerCase();
        const hint = (sourceHint || '').toLowerCase();
        const combined = aud + ' ' + scp + ' ' + hint;

        if (!netState.allJwts.some(function(j) { return j.token === clean; }) && netState.allJwts.length < 25) {
            netState.allJwts.push({ aud: aud || hint.slice(0, 60), token: clean });
        }

        if (!netState.tokens.anyBearer) {
            netState.tokens.anyBearer = clean;
        }
        if (aud.includes('ic3.teams.office.com') || hint.includes('ng.msg.teams.microsoft.com')) {
            netState.tokens.ic3 = clean;
        }
        if (aud.includes('chatsvcagg.teams.microsoft.com') || hint.includes('chatsvcagg')) {
            netState.tokens.chatsvcagg = clean;
        }
        if (
            aud.includes('api.spaces.skype.com') ||
            aud.includes('cc15fd57-2c6c-4117-a88c-83b1d56b4bbe') ||
            hint.includes('/api/csa/') ||
            hint.includes('/api/mt/')
        ) {
            netState.tokens.spaces = clean;
        }
        if (
            combined.includes('assignments.onenote.com') ||
            combined.includes('onenote.com') ||
            combined.includes('eduassignments')
        ) {
            netState.tokens.assignments = clean;
        }
        if (
            aud.includes('graph.microsoft.com') ||
            aud.includes('00000003-0000-0000-c000-000000000000')
        ) {
            netState.tokens.graph = clean;
        }
    }

    function registerRefreshToken(secret, clientId, realm) {
        if (!secret || typeof secret !== 'string' || secret.length < 30) return;
        if (secret.startsWith('eyJ')) return;
        if (!netState.refreshTokens.some(function(r) { return r.secret === secret; }) && netState.refreshTokens.length < 8) {
            netState.refreshTokens.push({
                secret: secret,
                clientId: clientId || '5e3ce6c0-2b1f-4285-8d4b-75ee78787346',
                realm: realm || 'common'
            });
        }
    }

    function inspectAnyValueForTokens(val, keyHint) {
        if (!val) return;
        if (typeof val === 'string') {
            if (!netState.userEmail && (val.includes('@aluno.unb.br') || val.includes('@unb.br'))) {
                const m = val.match(/[a-zA-Z0-9._%+-]+@(aluno\.)?unb\.br/i);
                if (m) netState.userEmail = m[0];
            }
            if (val.includes('eyJ')) {
                const jwtRegex = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g;
                const matches = val.match(jwtRegex);
                if (matches) {
                    for (const jwt of matches) {
                        registerBearerToken(jwt, keyHint || '');
                    }
                }
            }
            if (val.startsWith('{') && (val.includes('"secret"') || val.toLowerCase().includes('refreshtoken') || (keyHint || '').toLowerCase().includes('refreshtoken'))) {
                try {
                    const parsed = JSON.parse(val);
                    if (parsed && typeof parsed.secret === 'string' && !parsed.secret.startsWith('eyJ')) {
                        registerRefreshToken(parsed.secret, parsed.clientId || parsed.client_id, parsed.realm || parsed.tenantId);
                    }
                } catch (e) {}
            }
        } else if (typeof val === 'object') {
            try {
                const s = JSON.stringify(val);
                inspectAnyValueForTokens(s, keyHint);
            } catch (e) {}
        }
    }

    // Hook Response.prototype.json
    try {
        const origJson = Response.prototype.json;
        Response.prototype.json = async function() {
            const data = await origJson.apply(this, arguments);
            try {
                const u = (this.url || '').toLowerCase();
                if (u.includes('/teams/users/me') || (data && Array.isArray(data.teams))) {
                    netState.capturedTeamsPayloads.push(data);
                }
                if (data && Array.isArray(data.messages) && data.messages.length > 0) {
                    netState.capturedMessagesArrays.push({ url: this.url || '', messages: data.messages });
                }
            } catch (e) {}
            return data;
        };
    } catch (e) {}

    // Hook window.fetch
    try {
        const origFetch = window.fetch;
        if (typeof origFetch === 'function') {
            window.fetch = async function(input, init) {
                try {
                    const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
                    const extractHeaders = function(h) {
                        if (!h) return;
                        if (typeof h.forEach === 'function') {
                            h.forEach(function(val, key) {
                                const k = (key || '').toLowerCase();
                                if (k === 'authorization' && val) registerBearerToken(val, urlStr);
                                else if ((k === 'authentication' || k === 'x-skypetoken') && val) {
                                    const m = val.match(/skypetoken=([^\s;]+)/i);
                                    netState.tokens.skypeToken = m ? m[1] : val;
                                }
                            });
                        } else if (typeof h === 'object') {
                            for (const key of Object.keys(h)) {
                                const k = key.toLowerCase();
                                const val = h[key];
                                if (k === 'authorization' && typeof val === 'string') registerBearerToken(val, urlStr);
                                else if ((k === 'authentication' || k === 'x-skypetoken') && typeof val === 'string') {
                                    const m = val.match(/skypetoken=([^\s;]+)/i);
                                    netState.tokens.skypeToken = m ? m[1] : val;
                                }
                            }
                        }
                    };
                    if (init && init.headers) extractHeaders(init.headers);
                    if (input && typeof input === 'object' && input.headers) extractHeaders(input.headers);
                } catch (e) {}
                return origFetch.apply(this, arguments);
            };
        }
    } catch (e) {}

    // Hook XMLHttpRequest
    try {
        const origOpen = XMLHttpRequest.prototype.open;
        const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.open = function(method, url) {
            this.__unb_url = typeof url === 'string' ? url : '';
            return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            try {
                const k = (name || '').toLowerCase();
                if (k === 'authorization' && value) registerBearerToken(value, this.__unb_url || '');
                else if ((k === 'authentication' || k === 'x-skypetoken') && value) {
                    const m = value.match(/skypetoken=([^\s;]+)/i);
                    netState.tokens.skypeToken = m ? m[1] : value;
                }
            } catch (e) {}
            return origSetHeader.apply(this, arguments);
        };
    } catch (e) {}

    // Hook Worker.prototype.postMessage e MessagePort para capturar tokens trafegados para o CDL Worker do Teams v2
    try {
        const origWorkerPost = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function(msg) {
            try { inspectAnyValueForTokens(msg, 'worker-post'); } catch (e) {}
            return origWorkerPost.apply(this, arguments);
        };
    } catch (e) {}

    try {
        if (typeof MessagePort !== 'undefined' && MessagePort.prototype && MessagePort.prototype.postMessage) {
            const origPortPost = MessagePort.prototype.postMessage;
            MessagePort.prototype.postMessage = function(msg) {
                try { inspectAnyValueForTokens(msg, 'port-post'); } catch (e) {}
                return origPortPost.apply(this, arguments);
            };
        }
        window.addEventListener('message', function(ev) {
            try { if (ev && ev.data) inspectAnyValueForTokens(ev.data, 'win-message'); } catch (e) {}
        }, true);
    } catch (e) {}

    function scanStorageForTokens() {
        const storages = [];
        try { if (window.localStorage) storages.push({ name: 'localStorage', s: window.localStorage }); } catch (e) {}
        try { if (window.sessionStorage) storages.push({ name: 'sessionStorage', s: window.sessionStorage }); } catch (e) {}

        for (const entry of storages) {
            try {
                const store = entry.s;
                for (let i = 0; i < store.length; i++) {
                    const key = store.key(i) || '';
                    const val = store.getItem(key) || '';
                    if (!val) continue;
                    inspectAnyValueForTokens(val, key);
                }
            } catch (e) {}
        }

        try {
            const cookieMatch = (document.cookie || '').match(/skypetoken(?:_asm)?=([^;]+)/i);
            if (cookieMatch && cookieMatch[1]) {
                netState.tokens.skypeToken = decodeURIComponent(cookieMatch[1]);
            }
        } catch (e) {}
    }

    async function scanIndexedDbForTokens() {
        if (!window.indexedDB || typeof window.indexedDB.databases !== 'function') return;
        try {
            const dbs = await Promise.race([
                window.indexedDB.databases(),
                new Promise(function(r) { setTimeout(function() { r([]); }, 1800); })
            ]);
            if (!Array.isArray(dbs)) return;
            dbs.sort(function(a, b) {
                const nA = (a && a.name) || '';
                const nB = (b && b.name) || '';
                const pA = /auth|token|msal|skypexspaces|replychain|conversation|teams-grid/i.test(nA) ? 0 : 1;
                const pB = /auth|token|msal|skypexspaces|replychain|conversation|teams-grid/i.test(nB) ? 0 : 1;
                return pA - pB;
            });
            logDebug('IndexedDB dbs=' + dbs.slice(0, 6).map(function(d) { return d && d.name; }).filter(Boolean).join(','));

            for (const dbInfo of dbs.slice(0, 6)) {
                if (!dbInfo || !dbInfo.name) continue;
                await new Promise(function(resolve) {
                    const timer = setTimeout(resolve, 1000);
                    try {
                        const req = window.indexedDB.open(dbInfo.name);
                        req.onerror = function() { clearTimeout(timer); resolve(); };
                        req.onsuccess = function() {
                            const db = req.result;
                            try {
                                const allStores = Array.from(db.objectStoreNames || []);
                                // Prioriza stores de autenticação/tokens/mensagens sem descartar os demais
                                allStores.sort(function(a, b) {
                                    const pA = /token|auth|msal|cred|key|account|user|cache|team|conv|message|reply/i.test(a) ? 0 : 1;
                                    const pB = /token|auth|msal|cred|key|account|user|cache|team|conv|message|reply/i.test(b) ? 0 : 1;
                                    return pA - pB;
                                });
                                const storeNames = allStores.slice(0, 30);
                                if (storeNames.length === 0) {
                                    db.close();
                                    clearTimeout(timer);
                                    resolve();
                                    return;
                                }
                                let pending = storeNames.length;
                                for (const sName of storeNames) {
                                    try {
                                        const tx = db.transaction(sName, 'readonly');
                                        const st = tx.objectStore(sName);
                                        const getAllReq = st.getAll(null, 250);
                                        getAllReq.onsuccess = function() {
                                            try {
                                                const rows = getAllReq.result || [];
                                                for (const row of rows) {
                                                    inspectAnyValueForTokens(row, dbInfo.name + ':' + sName);
                                                }
                                            } catch (e) {}
                                            pending--;
                                            if (pending <= 0) {
                                                try { db.close(); } catch (e) {}
                                                clearTimeout(timer);
                                                resolve();
                                            }
                                        };
                                        getAllReq.onerror = function() {
                                            pending--;
                                            if (pending <= 0) {
                                                try { db.close(); } catch (e) {}
                                                clearTimeout(timer);
                                                resolve();
                                            }
                                        };
                                    } catch (e) {
                                        pending--;
                                        if (pending <= 0) {
                                            try { db.close(); } catch (err) {}
                                            clearTimeout(timer);
                                            resolve();
                                        }
                                    }
                                }
                            } catch (e) {
                                try { db.close(); } catch (err) {}
                                clearTimeout(timer);
                                resolve();
                            }
                        };
                    } catch (e) {
                        clearTimeout(timer);
                        resolve();
                    }
                });
            }
        } catch (e) {}
    }

    function sleep(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function isVisible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return Boolean(r && r.width > 5 && r.height > 5);
    }

    function triggerClick(element) {
        if (!element) return;
        try {
            element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            element.click();
        } catch(e) {
            try { element.click(); } catch(err) {}
        }
    }

    function purgeSystemBanners() {
        const banners = document.querySelectorAll(
            '.fui-MessageBar, [data-tid*="banner"], [role="alert"], [role="status"], [class*="NotificationBar"], [class*="notification-banner"]'
        );
        banners.forEach(function(b) {
            try { b.remove(); } catch(e) {}
        });
    }

    const SYSTEM_WORDS = [
        'language', 'idioma', 'restart', 'reiniciar', 'apply and restart', 'change language',
        'notification', 'notificação', 'notificações', 'stay in the know', 'turn on', 'desktop notifications',
        'join or create', 'join or create team', 'criar ou ingressar', 'ingressar ou criar', 'criar e entrar', 'entrar ou criar',
        'announcement', 'announcements', 'anúncio', 'anúncios', 'anuncio', 'anuncios',
        'classes', 'turmas', 'disciplinas', 'oculto', 'hidden', 'equipes', 'teams', 'microsoft',
        'unb aggregator', 'sarue unb', 'atribuições', 'assignments', 'calendário', 'calendar', 'chamadas', 'calls', 'onedrive',
        'copilot', 'repositório', 'atividade', 'activity', 'chat', 'postagens', 'posts', 'geral', 'general',
        'compartilhado', 'canais', 'canal', 'responder', 'reply', 'postar', 'class notebook',
        'atividades de aula', 'trabalhos', 'notas', 'grades', 'reflect', 'home page',
        'todas as equipes', 'all teams', 'canais principais', 'postar no canal', 'concluir login', 'cancelar'
    ];

    function isSystemText(str) {
        if (!str) return true;
        const s = str.toLowerCase();
        return SYSTEM_WORDS.some(function(term) { return s.includes(term); });
    }

    function isPotentialTeamName(text) {
        if (!text) return false;
        const trimmed = text.trim();
        if (trimmed.length < 3 || trimmed.length > 70) return false;
        if (trimmed.includes('\n')) return false;
        if (isSystemText(trimmed)) return false;
        if (/^[0-9\s.,:;!?\-_/()]+$/.test(trimmed)) return false;
        if (trimmed === '...' || trimmed === '…') return false;
        if (/^[A-Z0-9]{1,3}$/.test(trimmed)) return false;
        return true;
    }

    function extractUserEmail() {
        scanStorageForTokens();
        if (netState.userEmail) return netState.userEmail;
        try {
            const profileEls = document.querySelectorAll('[data-tid*="avatar"], [data-tid*="me-control"], button[id*="person"], button[aria-label*="@"]');
            for (const el of profileEls) {
                const text = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '');
                const m = text.match(/[a-zA-Z0-9._%+-]+@(aluno\.)?unb\.br/i);
                if (m) return m[0];
            }
        } catch(e) {}
        return '';
    }

    function findBackButton() {
        const interactives = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        for (const el of interactives) {
            if (el.id === '__unb_aggregator_banner__' || el.closest('#__unb_aggregator_banner__')) continue;
            if (!isVisible(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.top < 40 || r.left < 50) continue;

            const t = (el.textContent || '').trim().toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
            const tid = (el.getAttribute('data-tid') || '').trim().toLowerCase();

            if (tid === 'back-to-all-teams' || tid === 'team-back-button' || tid.includes('back-to-teams')) {
                return el;
            }
            if (aria === 'todas as equipes' || aria === 'all teams' || aria.includes('todas as equipes') || aria.includes('all teams')) {
                return el;
            }
            if (t.length > 0 && t.length <= 28 && (t === 'todas as equipes' || t === 'all teams' || t.endsWith('todas as equipes') || t.endsWith('all teams'))) {
                return el;
            }
        }

        const allNodes = Array.from(document.querySelectorAll('span, div, p'));
        for (const node of allNodes) {
            if (node.children.length > 0) continue;
            if (node.closest('#__unb_aggregator_banner__')) continue;
            if (!isVisible(node)) continue;
            const t = (node.textContent || '').trim().toLowerCase();
            if (t === 'todas as equipes' || t === 'all teams') {
                const interactive = node.closest('button, a, [role="button"]');
                if (interactive && isVisible(interactive)) return interactive;
                return node;
            }
        }

        return null;
    }

    function isInsideTeamView() {
        if (findBackButton() !== null) return true;
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (const b of buttons) {
            if (b.closest('#__unb_aggregator_banner__')) continue;
            if (!isVisible(b)) continue;
            const t = (b.textContent || '').trim().toLowerCase();
            if (t === 'postar no canal' || t === 'nova conversa' || t === 'nova postagem' || t === 'start a post' || t === 'new post') {
                return true;
            }
        }
        return false;
    }

    function returnToGrid() {
        const backBtn = findBackButton();
        if (backBtn) {
            triggerClick(backBtn);
            return true;
        }
        const navButtons = Array.from(document.querySelectorAll('button, [role="button"], a'));
        for (const btn of navButtons) {
            if (btn.closest('#__unb_aggregator_banner__')) continue;
            if (!isVisible(btn)) continue;
            const t = (btn.textContent || '').trim().toLowerCase();
            const a = (btn.getAttribute('aria-label') || '').trim().toLowerCase();
            if (t === 'equipes' || t === 'teams' || a === 'equipes' || a === 'teams') {
                triggerClick(btn);
                return true;
            }
        }
        return false;
    }

    function findTeamsFromGrid() {
        purgeSystemBanners();

        if (isInsideTeamView()) {
            return [];
        }

        const teams = [];

        let ocultoElement = null;
        let ocultoTop = Infinity;
        const allHeadings = Array.from(document.querySelectorAll('button, div, span, h2, h3, h4'));
        for (const el of allHeadings) {
            if (el.children.length > 3 || el.tagName === 'BODY') continue;
            const t = (el.textContent || '').trim().toLowerCase();
            if (t === 'oculto' || t.startsWith('oculto ') || t === 'hidden' || t.includes('equipes ocultas') || t.includes('hidden teams')) {
                ocultoElement = el;
                const r = el.getBoundingClientRect();
                if (r && r.top > 80) {
                    ocultoTop = r.top;
                }
                break;
            }
        }

        function isAfterOculto(el) {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            if (r && r.top >= ocultoTop) return true;
            if (ocultoElement) {
                try {
                    if (ocultoElement.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return true;
                    if (ocultoElement.contains(el)) return true;
                } catch(e) {}
            }
            return false;
        }

        const candidateCards = Array.from(document.querySelectorAll(
            '[data-tid*="team-card"], [data-tid*="team-tile"], [role="gridcell"], [role="listitem"], div[class*="teamCard"], div[class*="TeamCard"], div[class*="card-"], div[class*="Card"], div[class*="fui-Card"]'
        ));

        for (const card of candidateCards) {
            if (teams.length >= 12) break;
            if (card.id === '__unb_aggregator_banner__' || card.closest('#__unb_aggregator_banner__')) continue;
            if (card.closest('nav') || card.closest('[role="navigation"]') || card.closest('[data-tid*="app-bar"]')) continue;
            if (isAfterOculto(card)) continue;

            const rect = card.getBoundingClientRect();
            if (!rect || rect.width < 120 || rect.height < 50 || rect.left < 50) continue;

            const rawText = (card.innerText || card.textContent || '').trim();
            const lines = rawText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);

            for (const line of lines) {
                if (isPotentialTeamName(line)) {
                    if (!teams.some(function(t) { return t.name === line; })) {
                        teams.push({
                            name: line,
                            cardElement: card,
                            titleElement: card,
                        });
                    }
                    break;
                }
            }
        }

        if (teams.length < 2) {
            const leafNodes = Array.from(document.querySelectorAll('h2, h3, h4, span, div, p, a')).filter(function(el) {
                if (el.children.length > 0) return false;
                if (el.id === '__unb_aggregator_banner__' || el.closest('#__unb_aggregator_banner__')) return false;
                if (el.closest('nav') || el.closest('[role="navigation"]') || el.closest('[data-tid*="app-bar"]')) return false;
                if (isAfterOculto(el)) return false;

                const text = (el.textContent || '').trim();
                if (!isPotentialTeamName(text)) return false;

                const rect = el.getBoundingClientRect();
                return Boolean(rect && rect.width >= 15 && rect.height >= 10 && rect.left >= 65 && rect.top >= 45);
            });

            for (const leaf of leafNodes) {
                if (teams.length >= 12) break;
                const name = (leaf.textContent || '').trim();
                if (teams.some(function(t) { return t.name === name; })) continue;

                let curr = leaf.parentElement;
                let cardContainer = null;
                while (curr && curr.tagName !== 'MAIN' && curr.tagName !== 'BODY') {
                    const r = curr.getBoundingClientRect();
                    if (r && r.width >= 140 && r.width <= 550 && r.height >= 60 && r.height <= 300) {
                        cardContainer = curr;
                        break;
                    }
                    if (r && (r.width > 650 || r.height > 400)) break;
                    curr = curr.parentElement;
                }

                if (cardContainer) {
                    teams.push({
                        name: name,
                        cardElement: cardContainer,
                        titleElement: leaf,
                    });
                }
            }
        }

        return teams;
    }

    function fastConnect() {
        purgeSystemBanners();
        const email = extractUserEmail();
        const visibleTeams = findTeamsFromGrid();
        const courses = [];

        for (let i = 0; i < visibleTeams.length; i++) {
            const t = visibleTeams[i];
            const cleanCode = t.name.split(/[-–—\s(]/)[0].trim().replace(/\s+/g, '');
            courses.push({
                id: 'teams-course-' + i,
                code: cleanCode.length <= 10 ? cleanCode : t.name.slice(0, 7),
                name: t.name,
                url: window.location.href,
            });
        }

        return { email: email, courses: courses };
    }
    window.__unb_fast_connect = fastConnect;

    const DATE_REGEX = /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s*[,às\-]?\s*\d{1,2}:\d{2})?|\d{1,2}\s+de\s+[a-zç]+\.?(?:\s+de\s+\d{4})?(?:\s*[,às\-]?\s*\d{1,2}:\d{2})?|(?:hoje|ontem|today|yesterday|segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|domingo)(?:\s*[,às\-]?\s*\d{1,2}:\d{2})?|\d{1,2}:\d{2})\b/i;

    function findPostContainer(leaf) {
        let curr = leaf.parentElement;
        let best = null;
        for (let depth = 0; depth < 12; depth++) {
            if (!curr || curr.tagName === 'MAIN' || curr.tagName === 'BODY') break;
            if (curr.id === '__unb_aggregator_banner__' || curr.closest('#__unb_aggregator_banner__')) return null;

            const tid = (curr.getAttribute('data-tid') || '').toLowerCase();
            const role = (curr.getAttribute('role') || '').toLowerCase();
            if (tid.includes('channel-pane-message') || tid.includes('post-message') || role === 'article') {
                return curr;
            }

            const rect = curr.getBoundingClientRect();
            const text = (curr.innerText || curr.textContent || '').trim();
            if (rect && rect.width >= 240 && rect.height >= 45 && rect.height <= 900 && text.length >= 15) {
                best = curr;
            }
            curr = curr.parentElement;
        }
        return best || leaf.closest('[role="article"], [role="group"]');
    }

    function parsePostFromContainer(container, course) {
        if (!container) return null;
        if (container.id === '__unb_aggregator_banner__' || container.closest('#__unb_aggregator_banner__')) return null;
        if (container.closest('nav') || container.closest('[role="navigation"]')) return null;

        const rawText = (container.innerText || container.textContent || '').trim();
        if (rawText.length < 10) return null;

        const lower = rawText.toLowerCase();
        if (lower.includes('turn on desktop notifications')
            || lower.includes('stay in the know')
            || lower.includes('apply and restart')
            || lower.includes('change language')
            || lower.includes('reiniciar para alterar o idioma')) {
            return null;
        }

        const timeEl = container.querySelector('time[datetime], [data-tid*="timestamp"], [data-tid*="time"]');
        const dateMatch = rawText.match(DATE_REGEX);
        const timeStr = (timeEl && (timeEl.getAttribute('datetime') || timeEl.textContent || '').trim())
            || (dateMatch ? dateMatch[0] : '');

        const rawLines = rawText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
        const cleanLines = [];

        for (const line of rawLines) {
            if (/^(responder|reply|postar|cancelar|editar|edit|reagir|reagiu|👍|❤️|😂|😮|😢|😡|mais opções|more options|postar no canal|respostas?|replies|salvar|save|ver mais|see more|abrir|open)$/i.test(line)) continue;
            if (/^\d+\s+(respostas?|replies|reações|reactions)$/i.test(line)) continue;
            if (/^(ver|view|ocultar|hide)\s+\d*\s*(respostas?|replies)/i.test(line)) continue;
            if (/^[A-Z]{1,2}$/.test(line)) continue;
            cleanLines.push(line);
        }

        if (cleanLines.length === 0) return null;

        let author = 'Professor / Turma';
        const authorEl = container.querySelector('[data-tid*="message-author"], [data-tid*="author-name"], [class*="author"]');
        if (authorEl && (authorEl.textContent || '').trim().length >= 3) {
            author = (authorEl.textContent || '').trim();
        }

        let authorLineIdx = -1;
        for (let i = 0; i < Math.min(cleanLines.length, 6); i++) {
            const line = cleanLines[i];
            if (timeStr && line.includes(timeStr)) {
                const beforeDate = line.replace(timeStr, '').trim();
                if (author === 'Professor / Turma') {
                    if (beforeDate.length >= 3 && !isSystemText(beforeDate)) {
                        author = beforeDate;
                    } else if (i > 0 && cleanLines[i - 1].length >= 3 && !isSystemText(cleanLines[i - 1])) {
                        author = cleanLines[i - 1];
                    }
                }
                authorLineIdx = i;
                break;
            }
        }

        const contentLines = (authorLineIdx >= 0 ? cleanLines.slice(authorLineIdx + 1) : cleanLines).filter(function(l) {
            return l !== author && l !== timeStr;
        });
        if (contentLines.length === 0) return null;

        let explicitTitle = '';
        const titleEl = container.querySelector(
            '[data-tid*="subject"], [data-tid*="post-message-sub-title"], [data-tid*="title"], [data-tid*="heading"], h3, h4, [class*="subject"], [class*="Subject"], div[role="heading"]'
        );
        if (titleEl) {
            const tText = (titleEl.textContent || '').trim();
            if (tText.length >= 2 && tText.length <= 120 && !isSystemText(tText) && tText !== author) {
                explicitTitle = tText;
            }
        }

        let subject = explicitTitle;
        let bodyLines = [];
        if (explicitTitle) {
            bodyLines = contentLines[0] === explicitTitle ? contentLines.slice(1) : contentLines;
        } else if (contentLines.length >= 2) {
            subject = contentLines[0];
            bodyLines = contentLines.slice(1);
        } else {
            const single = contentLines[0];
            subject = single.length <= 60 ? single : (single.slice(0, 55).trim() + '...');
            bodyLines = [single];
        }

        let bodyText = bodyLines.join('\n').trim() || subject;
        if (bodyText.length < 4) return null;

        const attachmentNodes = Array.from(container.querySelectorAll(
            '[data-tid*="attachment"], [data-tid*="file"], div[class*="attachment"], a[href*="sharepoint"], a[download]'
        ));
        const attachmentNames = [];
        attachmentNodes.forEach(function(att) {
            const attText = (att.textContent || '').trim();
            const fileMatch = attText.match(/[\w\-_\.]+\.(pdf|docx?|xlsx?|pptx?|zip|rar|txt|py|c|cpp|java)/i);
            if (fileMatch) attachmentNames.push(fileMatch[0]);
        });
        contentLines.forEach(function(l) {
            const fm = l.match(/[\w\-_\.]+\.(pdf|docx?|xlsx?|pptx?|zip|rar|txt|py|c|cpp|java)/i);
            if (fm) attachmentNames.push(fm[0]);
        });
        if (attachmentNames.length > 0) {
            const uniqueAtts = Array.from(new Set(attachmentNames));
            bodyText += '\n\n📎 Anexos: ' + uniqueAtts.join(', ');
        }

        let isoDate = new Date().toISOString();
        if (timeEl && timeEl.getAttribute('datetime')) {
            const d = new Date(timeEl.getAttribute('datetime'));
            if (!isNaN(d.getTime())) isoDate = d.toISOString();
        } else if (timeStr) {
            const parts = timeStr.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?/);
            if (parts) {
                const day = parseInt(parts[1], 10);
                const month = parseInt(parts[2], 10) - 1;
                const year = parts[3] ? parseInt(parts[3], 10) : new Date().getFullYear();
                const hour = parts[4] ? parseInt(parts[4], 10) : 12;
                const min = parts[5] ? parseInt(parts[5], 10) : 0;
                const d = new Date(year, month, day, hour, min);
                if (!isNaN(d.getTime())) isoDate = d.toISOString();
            }
        }

        const isAssignmentCard =
            author.toLowerCase().includes('assignment')
            || author.toLowerCase().includes('atribui')
            || author.toLowerCase().includes('tarefa')
            || lower.includes('view assignment')
            || lower.includes('exibir tarefa')
            || lower.includes('ver tarefa')
            || lower.includes('vence em')
            || lower.includes('due ');

        const finalTitle = subject ? subject.trim() : bodyText.slice(0, 50).trim();
        const slug = finalTitle.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14);

        return {
            id: 'teams-dom-' + course.code + '-' + slug,
            title: finalTitle,
            content: bodyText.slice(0, 2000),
            courseName: course.name,
            courseCode: course.code,
            author: author,
            itemType: isAssignmentCard ? 'assignment' : 'post',
            createdAt: isoDate,
            isCompleted: false,
            externalUrl: window.location.href,
        };
    }

    function scrapeChannelPosts(course) {
        purgeSystemBanners();
        const posts = [];
        const allCandidateContainers = [];

        const directContainers = Array.from(document.querySelectorAll(
            '[data-tid="channel-pane-message"], [data-tid*="channel-pane-message"], [data-tid*="post-message"], [role="article"], .fui-ChatMessage'
        ));
        for (const c of directContainers) {
            if (!c.closest('[data-tid*="replies"]') && !allCandidateContainers.includes(c)) {
                allCandidateContainers.push(c);
            }
        }

        const dateNodes = Array.from(document.querySelectorAll('time, [data-tid*="timestamp"], span, div')).filter(function(el) {
            if (el.tagName !== 'TIME' && el.children.length > 0) return false;
            if (el.id === '__unb_aggregator_banner__' || el.closest('#__unb_aggregator_banner__')) return false;
            if (el.closest('nav') || el.closest('[role="navigation"]')) return false;
            const t = (el.textContent || '').trim();
            return el.tagName === 'TIME' || (t.length >= 4 && t.length <= 38 && DATE_REGEX.test(t));
        });

        dateNodes.forEach(function(leaf) {
            const container = findPostContainer(leaf);
            if (container && !allCandidateContainers.includes(container)) {
                allCandidateContainers.push(container);
            }
        });

        allCandidateContainers.forEach(function(container) {
            const post = parsePostFromContainer(container, course);
            if (post && !posts.some(function(p) { return p.id === post.id || (p.title === post.title && p.content === post.content); })) {
                posts.push(post);
            }
        });

        return posts;
    }

    async function finishAndSend(courses, items, email) {
        scanStorageForTokens();
        await scanIndexedDbForTokens();

        logDebug(
            'Finalizando JS: cursos=' + (courses || []).length +
            ', itemsJS=' + (items || []).length +
            ', jwts=' + netState.allJwts.length +
            ', refreshTokens=' + netState.refreshTokens.length +
            ', skypeToken=' + Boolean(netState.tokens.skypeToken)
        );

        const payloadStr = JSON.stringify({
            courses: courses || [],
            items: items || [],
            tokens: netState.tokens,
            refreshTokens: netState.refreshTokens,
            allJwts: netState.allJwts,
            origin: netState.origin,
            region: netState.region,
            debug: debugLogs
        });

        const CHUNK_SIZE = 8000;
        const totalChunks = Math.ceil(payloadStr.length / CHUNK_SIZE) || 1;

        if (payloadStr.length <= CHUNK_SIZE) {
            const qs = 'action=sync_done&payload=' + encodeURIComponent(payloadStr) + '&email=' + encodeURIComponent(email || '');
            window.location.href = window.location.origin + '/__aggregator_bridge__?' + qs;
        } else {
            for (let seq = 0; seq < totalChunks; seq++) {
                const chunk = payloadStr.slice(seq * CHUNK_SIZE, (seq + 1) * CHUNK_SIZE);
                const qs = 'action=sync_chunk&seq=' + seq + '&total=' + totalChunks + '&chunk=' + encodeURIComponent(chunk) + '&email=' + encodeURIComponent(email || '');
                window.location.href = window.location.origin + '/__aggregator_bridge__?' + qs;
                await sleep(120);
            }
        }
    }

    async function crawl() {
        if (window.__unb_crawler_in_progress) return;
        window.__unb_crawler_in_progress = true;

        let sent = false;
        let detectedEmail = '';
        const courses = [];
        const items = [];

        function setStatus(msg) {
            if (typeof window.__unb_set_status === 'function') {
                window.__unb_set_status(msg);
            }
        }

        const safetyTimer = setTimeout(async function() {
            if (!sent) {
                sent = true;
                logDebug('Safety timer atingido.');
                await finishAndSend(courses, items, detectedEmail || extractUserEmail() || '');
            }
        }, 38000);

        try {
            purgeSystemBanners();
            detectedEmail = extractUserEmail();

            setStatus('Identificando suas turmas...');

            if (isInsideTeamView()) {
                returnToGrid();
                await sleep(1000);
            }

            let visibleTeams = [];
            for (let i = 0; i < 20; i++) {
                if (isInsideTeamView()) {
                    returnToGrid();
                    await sleep(600);
                }
                visibleTeams = findTeamsFromGrid();
                if (visibleTeams.length >= 2) break;
                if (visibleTeams.length >= 1 && i >= 6) break;
                await sleep(500);
            }

            logDebug('Equipes visíveis na grade: ' + visibleTeams.map(function(t) { return t.name; }).join(' | '));

            for (let i = 0; i < visibleTeams.length; i++) {
                const t = visibleTeams[i];
                const cleanCode = t.name.split(/[-–—\s(]/)[0].trim().replace(/\s+/g, '');
                const courseObj = {
                    id: 'teams-course-' + (courses.length + i),
                    code: cleanCode.length <= 10 ? cleanCode : t.name.slice(0, 7),
                    name: t.name,
                    url: window.location.href,
                };
                if (!courses.some(function(c) { return c.name === courseObj.name; })) {
                    courses.push(courseObj);
                }
            }

            scanStorageForTokens();
            await scanIndexedDbForTokens();
            const hasApiTokens = Boolean(
                (netState.tokens.ic3 || netState.tokens.chatsvcagg) && netState.tokens.spaces
            );

            // Só visita cada equipe no DOM (fallback) se não tivermos os tokens da API prontos no storage
            if (!hasApiTokens) {
                for (let i = 0; i < visibleTeams.length; i++) {
                    const currentTeam = visibleTeams[i];
                    const course = courses.find(function(c) { return c.name === currentTeam.name; }) || {
                        id: 'teams-course-' + i,
                        code: currentTeam.name.slice(0, 6),
                        name: currentTeam.name,
                        url: window.location.href,
                    };

                    setStatus('Sincronizando ' + course.name + '...');

                    const freshTeams = findTeamsFromGrid();
                    const target = freshTeams.find(function(ft) { return ft.name === currentTeam.name; }) || currentTeam;

                    const cardEl = target.cardElement;
                    let clickable = null;
                    if (cardEl) {
                        const interactives = Array.from(cardEl.querySelectorAll('a, button, [role="button"], [tabindex="0"]'));
                        for (const el of interactives) {
                            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                            const txt = (el.textContent || '').trim().toLowerCase();
                            if (aria.includes('opções') || aria.includes('options') || aria.includes('more') || txt === '...' || txt === '…') continue;
                            if (txt.includes(currentTeam.name.toLowerCase()) || aria.includes(currentTeam.name.toLowerCase())) {
                                clickable = el;
                                break;
                            }
                        }
                    }

                    triggerClick(clickable || target.titleElement || cardEl);

                    for (let wait = 0; wait < 10; wait++) {
                        await sleep(380);
                        purgeSystemBanners();
                        if (isInsideTeamView()) {
                            const hasPosts = document.querySelectorAll('[data-tid*="channel-pane-message"], [role="article"], time').length > 0;
                            if (hasPosts && wait >= 2) break;
                        } else if (wait === 3 && cardEl) {
                            triggerClick(cardEl);
                        }
                    }
                    await sleep(350);

                    const teamPosts = scrapeChannelPosts(course);
                    logDebug('DOM posts em ' + course.name + ': ' + teamPosts.length);
                    items.push.apply(items, teamPosts);

                    if (i + 1 < visibleTeams.length) {
                        returnToGrid();
                        for (let w = 0; w < 9; w++) {
                            await sleep(320);
                            if (!isInsideTeamView() && findTeamsFromGrid().length > 0) break;
                        }
                    }
                }
            } else {
                logDebug('Tokens de API já disponíveis no storage; pulando navegação DOM por equipe.');
            }

            setStatus('Concluindo sincronização...');
            clearTimeout(safetyTimer);
            if (!sent) {
                sent = true;
                await finishAndSend(courses, items, detectedEmail || extractUserEmail() || '');
            }
        } catch(err) {
            logDebug('Erro no crawl JS: ' + (err && err.message ? err.message : String(err)));
            clearTimeout(safetyTimer);
            if (!sent) {
                sent = true;
                await finishAndSend(courses, items, detectedEmail || extractUserEmail() || '');
            }
        }
    }

    window.__unb_start_crawl = crawl;
    if (window.__unb_auto_crawl) {
        if (document.readyState === 'complete') {
            setTimeout(crawl, 2000);
        } else {
            window.addEventListener('load', function() {
                setTimeout(crawl, 2000);
            });
        }
    }
})();
"##;

#[derive(serde::Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtractedTokens {
    ic3: Option<String>,
    chatsvcagg: Option<String>,
    spaces: Option<String>,
    graph: Option<String>,
    assignments: Option<String>,
    skype_token: Option<String>,
    any_bearer: Option<String>,
}

#[derive(serde::Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtractedRefreshToken {
    secret: String,
    client_id: Option<String>,
    realm: Option<String>,
}

#[derive(serde::Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtractedJwtEntry {
    aud: Option<String>,
    token: String,
}

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RawBridgePayload {
    courses: Option<Vec<RawCourse>>,
    items: Option<Vec<RawItem>>,
    tokens: Option<ExtractedTokens>,
    refresh_tokens: Option<Vec<ExtractedRefreshToken>>,
    all_jwts: Option<Vec<ExtractedJwtEntry>>,
    origin: Option<String>,
    region: Option<String>,
    debug: Option<Vec<String>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCourse {
    id: Option<String>,
    code: Option<String>,
    name: String,
    url: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawItem {
    id: Option<String>,
    title: Option<String>,
    content: String,
    course_name: Option<String>,
    course_code: Option<String>,
    author: Option<String>,
    item_type: Option<String>,
    created_at: Option<String>,
    due_date: Option<String>,
    is_completed: Option<bool>,
    external_url: Option<String>,
}

pub fn parse_teams_bridge_payload(payload_str: &str) -> (Vec<FeedItem>, Vec<Course>) {
    let parsed: RawBridgePayload = serde_json::from_str(payload_str).unwrap_or_default();

    if let Some(debug_lines) = &parsed.debug {
        for line in debug_lines {
            log::info!("[Teams JS] {}", line);
        }
    }

    let is_system_course_name = |s: &str| -> bool {
        let lower = s.to_lowercase();
        lower.contains("language")
            || lower.contains("restart")
            || lower.contains("notification")
            || lower.contains("notificação")
            || lower.contains("stay in the know")
            || lower.contains("turn on")
            || lower.contains("apply and restart")
            || lower.contains("announcement")
            || lower.contains("join or create")
            || lower.contains("classes")
            || lower.contains("equipes microsoft")
            || lower.contains("microsoft teams")
            || lower == "teams"
            || lower == "equipes"
    };

    let is_system_item = |title: &str, content: &str| -> bool {
        let t = title.to_lowercase();
        let c = content.to_lowercase();
        t.contains("stay in the know")
            || t.contains("turn on desktop notifications")
            || t.contains("restart for change language")
            || t.contains("apply and restart")
            || t.contains("alterar o idioma")
            || c.contains("stay in the know")
            || c.contains("turn on desktop notifications")
            || c.contains("reiniciar para alterar o idioma")
    };

    let mut items = Vec::new();
    if let Some(raw_items) = parsed.items {
        for (i, it) in raw_items.into_iter().enumerate() {
            let title = it.title.unwrap_or_else(|| "Comunicado do Teams".into());
            if is_system_item(&title, &it.content) {
                continue;
            }
            let item_type = match it.item_type.as_deref() {
                Some("assignment") => crate::models::FeedItemType::Assignment,
                _ => crate::models::FeedItemType::Post,
            };
            items.push(FeedItem {
                id: it.id.unwrap_or_else(|| format!("teams-item-{}", i)),
                platform: crate::models::PlatformType::Teams,
                title,
                content: it.content,
                course_name: it.course_name.unwrap_or_else(|| "Microsoft Teams".into()),
                course_code: it.course_code,
                author: it.author,
                item_type,
                created_at: it
                    .created_at
                    .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                due_date: it.due_date,
                is_completed: Some(it.is_completed.unwrap_or(false)),
                external_url: it
                    .external_url
                    .or_else(|| Some("https://teams.microsoft.com".into())),
            });
        }
    }

    let mut courses = Vec::new();
    if let Some(raw_courses) = parsed.courses {
        for (i, c) in raw_courses.into_iter().enumerate() {
            if is_system_course_name(&c.name) {
                continue;
            }
            let semester = if c.name.contains("2026/2") || c.name.contains("2026.2") {
                "2026.2".into()
            } else if c.name.contains("2026/1") || c.name.contains("2026.1") {
                "2026.1".into()
            } else {
                "2026.2".into()
            };

            let course_code = c.code.unwrap_or_else(|| "TEAMS".into());
            let pending_assignments_count = items
                .iter()
                .filter(|it| {
                    matches!(it.item_type, crate::models::FeedItemType::Assignment)
                        && it.is_completed != Some(true)
                        && (it.course_name.eq_ignore_ascii_case(&c.name)
                            || it.course_code.as_deref() == Some(course_code.as_str()))
                })
                .count() as u32;

            courses.push(Course {
                id: c.id.unwrap_or_else(|| format!("teams-c-{}", i)),
                code: course_code,
                name: c.name,
                semester,
                platform: crate::models::PlatformType::Teams,
                professor: None,
                classroom: Some("Teams Online".into()),
                schedule: None,
                class_group: None,
                unread_count: Some(0),
                pending_assignments_count: Some(pending_assignments_count),
                url: c.url.or_else(|| Some("https://teams.microsoft.com".into())),
                absences: None,
                max_absences: None,
            });
        }
    }

    (items, courses)
}

fn clean_html_to_text(raw_html: &str) -> String {
    if raw_html.trim().is_empty() {
        return String::new();
    }
    let with_breaks = regex::Regex::new(r"(?i)<(br\s*/?|/p|/div|/li|/h[1-6]|/tr|/blockquote)>")
        .map(|re| re.replace_all(raw_html, "\n").into_owned())
        .unwrap_or_else(|_| raw_html.to_string());
    let no_tags = regex::Regex::new(r"<[^>]+>")
        .map(|re| re.replace_all(&with_breaks, "").into_owned())
        .unwrap_or(with_breaks);
    let decoded = no_tags
        .replace("&nbsp;", " ")
        .replace("&#160;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#8203;", "");

    let mut clean_lines = Vec::new();
    for line in decoded.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            clean_lines.push(trimmed);
        }
    }
    clean_lines.join("\n")
}

async fn exchange_spa_refresh_token(
    client: &reqwest::Client,
    rt: &ExtractedRefreshToken,
    origin: &str,
    scope: &str,
) -> Option<String> {
    let realm = rt.realm.as_deref().unwrap_or("common");
    let client_id = rt
        .client_id
        .as_deref()
        .unwrap_or("5e3ce6c0-2b1f-4285-8d4b-75ee78787346");
    let url = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
        realm
    );

    let params = [
        ("client_id", client_id),
        ("grant_type", "refresh_token"),
        ("refresh_token", rt.secret.as_str()),
        ("scope", scope),
    ];

    let res = client
        .post(&url)
        .header("Origin", origin)
        .header("Referer", origin)
        .form(&params)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        return None;
    }

    let json: Value = res.json().await.ok()?;
    json.get("access_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Usa reqwest nativo do Rust (sem bloqueio de CORS/CSP) para buscar todas as postagens
/// do canal Geral e todas as Atividades (Assignments) das disciplinas ativas do Teams.
pub async fn enrich_teams_via_reqwest(
    payload_str: &str,
    mut items: Vec<FeedItem>,
    mut courses: Vec<Course>,
) -> (Vec<FeedItem>, Vec<Course>) {
    let parsed: RawBridgePayload = serde_json::from_str(payload_str).unwrap_or_default();
    let mut trace = Vec::<String>::new();

    if let Some(js_debug) = &parsed.debug {
        for l in js_debug {
            trace.push(format!("JS: {}", l));
        }
    }

    let mut tokens = parsed.tokens.unwrap_or_default();
    let refresh_tokens = parsed.refresh_tokens.unwrap_or_default();
    let all_jwts = parsed.all_jwts.unwrap_or_default();
    let origin = parsed
        .origin
        .unwrap_or_else(|| "https://teams.microsoft.com".to_string());
    let region = parsed.region.unwrap_or_else(|| "amer".to_string());

    trace.push(format!(
        "Rust recebeu: courses={}, items={}, all_jwts={}, refresh_tokens={}, origin={}",
        courses.len(),
        items.len(),
        all_jwts.len(),
        refresh_tokens.len(),
        origin
    ));
    for j in &all_jwts {
        trace.push(format!(
            "JWT aud='{}' len={}",
            j.aud.as_deref().unwrap_or(""),
            j.token.len()
        ));
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
        .build()
    {
        Ok(c) => c,
        Err(_) => return (items, courses),
    };

    // 1. Se tivermos Refresh Token do MSAL, renova/obtém tokens para escopos faltantes
    if let Some(rt) = refresh_tokens.first() {
        if tokens.ic3.as_deref().unwrap_or("").is_empty() {
            if let Some(tok) = exchange_spa_refresh_token(
                &client,
                rt,
                &origin,
                "https://ic3.teams.office.com/.default openid profile offline_access",
            )
            .await
            {
                trace.push("Token ic3 obtido via refresh_token com sucesso!".into());
                tokens.ic3 = Some(tok);
            }
        }
        if tokens.spaces.as_deref().unwrap_or("").is_empty() {
            if let Some(tok) = exchange_spa_refresh_token(
                &client,
                rt,
                &origin,
                "https://api.spaces.skype.com/.default openid profile offline_access",
            )
            .await
            {
                trace.push("Token spaces obtido via refresh_token com sucesso!".into());
                tokens.spaces = Some(tok);
            }
        }
        if tokens.chatsvcagg.as_deref().unwrap_or("").is_empty() {
            if let Some(tok) = exchange_spa_refresh_token(
                &client,
                rt,
                &origin,
                "https://chatsvcagg.teams.microsoft.com/.default openid profile offline_access",
            )
            .await
            {
                trace.push("Token chatsvcagg obtido via refresh_token com sucesso!".into());
                tokens.chatsvcagg = Some(tok);
            }
        }
        if tokens.assignments.as_deref().unwrap_or("").is_empty() {
            if let Some(tok) = exchange_spa_refresh_token(
                &client,
                rt,
                &origin,
                "https://assignments.onenote.com/.default openid profile offline_access",
            )
            .await
            {
                trace.push("Token assignments.onenote.com obtido via refresh_token!".into());
                tokens.assignments = Some(tok);
            } else if let Some(tok) = exchange_spa_refresh_token(
                &client,
                rt,
                &origin,
                "https://onenote.com/.default openid profile offline_access",
            )
            .await
            {
                trace.push("Token onenote.com obtido via refresh_token!".into());
                tokens.assignments = Some(tok);
            }
        }
        if tokens.graph.as_deref().unwrap_or("").is_empty() {
            if let Some(tok) = exchange_spa_refresh_token(
                &client,
                rt,
                &origin,
                "https://graph.microsoft.com/.default openid profile offline_access",
            )
            .await
            {
                trace.push("Token graph.microsoft.com obtido via refresh_token!".into());
                tokens.graph = Some(tok);
            }
        }
    }

    // 2. Busca metadados das equipes e canais via CSA API ou Graph
    #[derive(Clone, Debug)]
    struct TeamApiMeta {
        display_name: String,
        general_channel_id: String,
        group_id: String,
        is_active: bool,
    }

    let mut api_teams = Vec::<TeamApiMeta>::new();

    let mut csa_candidate_tokens = Vec::<String>::new();
    for t in [
        tokens.spaces.clone(),
        tokens.chatsvcagg.clone(),
        tokens.ic3.clone(),
        tokens.any_bearer.clone(),
    ]
    .into_iter()
    .flatten()
    {
        if !t.is_empty() && !csa_candidate_tokens.contains(&t) {
            csa_candidate_tokens.push(t);
        }
    }
    for j in &all_jwts {
        if !csa_candidate_tokens.contains(&j.token) {
            csa_candidate_tokens.push(j.token.clone());
        }
    }

    let csa_urls = [
        format!(
            "https://teams.microsoft.com/api/csa/{}/api/v1/teams/users/me?isPrefetch=false&enableMembershipSummary=true",
            region
        ),
        format!(
            "https://teams.cloud.microsoft/api/csa/{}/api/v1/teams/users/me?isPrefetch=false&enableMembershipSummary=true",
            region
        ),
        "https://teams.microsoft.com/api/csa/amer/api/v1/teams/users/me?isPrefetch=false&enableMembershipSummary=true".to_string(),
        "https://teams.microsoft.com/api/csa/brazil/api/v1/teams/users/me?isPrefetch=false&enableMembershipSummary=true".to_string(),
    ];

    'csa_outer: for tok in &csa_candidate_tokens {
        for url in &csa_urls {
            let mut req = client
                .get(url)
                .header("Authorization", format!("Bearer {}", tok))
                .header("Accept", "application/json");
            if let Some(st) = &tokens.skype_token {
                if !st.is_empty() {
                    req = req
                        .header("Authentication", format!("skypetoken={}", st))
                        .header("x-skypetoken", st);
                }
            }
            if let Ok(res) = req.send().await {
                let status = res.status();
                if status.is_success() {
                    if let Ok(json) = res.json::<Value>().await {
                        let arr = json
                            .get("teams")
                            .and_then(|v| v.as_array())
                            .or_else(|| json.get("value").and_then(|v| v.as_array()));
                        if let Some(list) = arr {
                            for t in list {
                                let name = t
                                    .get("displayName")
                                    .or_else(|| t.get("name"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .trim()
                                    .to_string();
                                if name.is_empty() {
                                    continue;
                                }
                                let is_archived = t
                                    .get("isArchived")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
                                let is_deleted = t
                                    .get("isDeleted")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
                                let is_fav = t
                                    .get("isFavorite")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(true);
                                let is_hidden = t
                                    .get("userTeamMembershipSummary")
                                    .and_then(|u| u.get("isHidden"))
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);

                                let thread_id = t
                                    .get("id")
                                    .or_else(|| t.get("threadId"))
                                    .or_else(|| t.get("generalChannelId"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let group_id = t
                                    .get("groupId")
                                    .or_else(|| t.get("aadGroupId"))
                                    .or_else(|| {
                                        t.get("teamSiteInformation").and_then(|s| s.get("groupId"))
                                    })
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();

                                let mut gen_chan_id = thread_id.clone();
                                if let Some(chans) = t.get("channels").and_then(|v| v.as_array()) {
                                    for ch in chans {
                                        let ch_id =
                                            ch.get("id").and_then(|v| v.as_str()).unwrap_or("");
                                        let dn = ch
                                            .get("displayName")
                                            .or_else(|| ch.get("name"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_lowercase();
                                        let is_gen = ch
                                            .get("isGeneral")
                                            .and_then(|v| v.as_bool())
                                            .unwrap_or(false);
                                        if (is_gen
                                            || ch_id == thread_id
                                            || dn == "general"
                                            || dn == "geral")
                                            && !ch_id.is_empty()
                                        {
                                            gen_chan_id = ch_id.to_string();
                                            break;
                                        }
                                    }
                                }

                                api_teams.push(TeamApiMeta {
                                    display_name: name,
                                    general_channel_id: gen_chan_id,
                                    group_id,
                                    is_active: !is_archived && !is_deleted && is_fav && !is_hidden,
                                });
                            }
                            trace.push(format!("CSA API retornou {} equipes!", api_teams.len()));
                            break 'csa_outer;
                        }
                    }
                }
            }
        }
    }

    // 2.2 Fallback: Descobre canais Gerais via Chatsvc /v1/users/ME/conversations se CSA não respondeu
    if api_teams.is_empty() {
        let mut chat_tokens = Vec::<String>::new();
        for t in [
            tokens.ic3.clone(),
            tokens.chatsvcagg.clone(),
            tokens.spaces.clone(),
        ]
        .into_iter()
        .flatten()
        {
            if !t.is_empty() && !chat_tokens.contains(&t) {
                chat_tokens.push(t);
            }
        }
        for j in &all_jwts {
            if !chat_tokens.contains(&j.token) {
                chat_tokens.push(j.token.clone());
            }
        }

        let conv_urls = [
            format!(
                "https://{}.ng.msg.teams.microsoft.com/v1/users/ME/conversations?view=msnp24Equivalent&pageSize=200",
                region
            ),
            "https://amer.ng.msg.teams.microsoft.com/v1/users/ME/conversations?view=msnp24Equivalent&pageSize=200".to_string(),
            "https://brazil.ng.msg.teams.microsoft.com/v1/users/ME/conversations?view=msnp24Equivalent&pageSize=200".to_string(),
        ];

        'conv_outer: for tok in &chat_tokens {
            for url in &conv_urls {
                if let Ok(res) = client
                    .get(url)
                    .header("Authorization", format!("Bearer {}", tok))
                    .header("behavioroverride", "redirectAs404")
                    .send()
                    .await
                {
                    if res.status().is_success() {
                        if let Ok(json) = res.json::<Value>().await {
                            if let Some(convs) =
                                json.get("conversations").and_then(|v| v.as_array())
                            {
                                for conv in convs {
                                    let id = conv
                                        .get("id")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    if !id.ends_with("@thread.tacv2") {
                                        continue;
                                    }
                                    let props = conv.get("threadProperties");
                                    let space_name = props
                                        .and_then(|p| {
                                            p.get("spaceThreadTopic").or_else(|| p.get("topic"))
                                        })
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .trim()
                                        .to_string();
                                    let group_id = props
                                        .and_then(|p| p.get("groupId"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    if !space_name.is_empty() {
                                        api_teams.push(TeamApiMeta {
                                            display_name: space_name,
                                            general_channel_id: id,
                                            group_id,
                                            is_active: true,
                                        });
                                    }
                                }
                                trace.push(format!(
                                    "Chatsvc conversations retornou {} canais!",
                                    api_teams.len()
                                ));
                                break 'conv_outer;
                            }
                        }
                    }
                }
            }
        }
    }

    // 2.3 Enriquecimento de groupId via Edu Classes (assignments.onenote.com) ou Graph joinedTeams
    if let Some(assign_tok) = &tokens.assignments {
        if !assign_tok.is_empty() {
            if let Ok(res) = client
                .get("https://assignments.onenote.com/api/v1.0/edu/me/classes")
                .header("Authorization", format!("Bearer {}", assign_tok))
                .send()
                .await
            {
                if res.status().is_success() {
                    if let Ok(json) = res.json::<Value>().await {
                        if let Some(arr) = json
                            .get("value")
                            .and_then(|v| v.as_array())
                            .or_else(|| json.as_array())
                        {
                            for cls in arr {
                                let c_name = cls
                                    .get("displayName")
                                    .or_else(|| cls.get("name"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .trim();
                                let c_id =
                                    cls.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
                                if c_name.is_empty() || c_id.is_empty() {
                                    continue;
                                }
                                if let Some(existing) = api_teams
                                    .iter_mut()
                                    .find(|t| t.display_name.eq_ignore_ascii_case(c_name))
                                {
                                    if existing.group_id.is_empty() {
                                        existing.group_id = c_id.to_string();
                                    }
                                } else {
                                    api_teams.push(TeamApiMeta {
                                        display_name: c_name.to_string(),
                                        general_channel_id: String::new(),
                                        group_id: c_id.to_string(),
                                        is_active: true,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Se courses veio vazio do DOM, popula APENAS com equipes marcadas como is_active (isFavorite && !isArchived)
    if courses.is_empty() {
        for (i, meta) in api_teams.iter().filter(|m| m.is_active).enumerate() {
            let clean_code = meta
                .display_name
                .split(['-', '–', '—', ' ', '('])
                .next()
                .unwrap_or("TEAMS")
                .trim();
            courses.push(Course {
                id: format!("teams-course-{}", i),
                code: if clean_code.len() <= 10 && !clean_code.is_empty() {
                    clean_code.to_string()
                } else {
                    meta.display_name.chars().take(7).collect()
                },
                name: meta.display_name.clone(),
                semester: "2026.2".into(),
                platform: PlatformType::Teams,
                professor: None,
                classroom: Some("Teams Online".into()),
                schedule: None,
                class_group: None,
                unread_count: Some(0),
                pending_assignments_count: Some(0),
                url: Some("https://teams.microsoft.com".into()),
                absences: None,
                max_absences: None,
            });
        }
    }

    // 3. Para cada curso ativo, busca TODAS as postagens principais do canal Geral e TODAS as Atividades
    let mut chat_tokens = Vec::<String>::new();
    for t in [
        tokens.ic3.clone(),
        tokens.chatsvcagg.clone(),
        tokens.spaces.clone(),
    ]
    .into_iter()
    .flatten()
    {
        if !t.is_empty() && !chat_tokens.contains(&t) {
            chat_tokens.push(t);
        }
    }
    for j in &all_jwts {
        if !chat_tokens.contains(&j.token) {
            chat_tokens.push(j.token.clone());
        }
    }

    let mut seen_item_ids: HashSet<String> = items.iter().map(|i| i.id.clone()).collect();

    for course in &courses {
        let matched_meta = api_teams.iter().find(|m| {
            m.display_name.eq_ignore_ascii_case(&course.name)
                || m.display_name
                    .to_lowercase()
                    .contains(&course.name.to_lowercase())
                || course
                    .name
                    .to_lowercase()
                    .contains(&m.display_name.to_lowercase())
        });

        let Some(meta) = matched_meta else {
            trace.push(format!(
                "Sem metadados de API para a equipe '{}'",
                course.name
            ));
            continue;
        };

        // 3.1 Postagens do Canal Geral via Chatsvc
        if !meta.general_channel_id.is_empty() {
            let chan_enc = meta
                .general_channel_id
                .replace(':', "%3A")
                .replace('@', "%40")
                .replace('/', "%2F")
                .replace(' ', "%20");
            let msg_urls = [
                format!(
                    "https://{}.ng.msg.teams.microsoft.com/v1/users/ME/conversations/{}/messages?view=msnp24Equivalent%7CsupportsMessageProperties&pageSize=50&startTime=1",
                    region, chan_enc
                ),
                format!(
                    "https://amer.ng.msg.teams.microsoft.com/v1/users/ME/conversations/{}/messages?view=msnp24Equivalent%7CsupportsMessageProperties&pageSize=50&startTime=1",
                    chan_enc
                ),
                format!(
                    "https://brazil.ng.msg.teams.microsoft.com/v1/users/ME/conversations/{}/messages?view=msnp24Equivalent%7CsupportsMessageProperties&pageSize=50&startTime=1",
                    chan_enc
                ),
            ];

            'msg_outer: for tok in &chat_tokens {
                for url in &msg_urls {
                    let mut req = client
                        .get(url)
                        .header("Authorization", format!("Bearer {}", tok))
                        .header("behavioroverride", "redirectAs404");
                    if let Some(st) = &tokens.skype_token {
                        if !st.is_empty() {
                            req = req
                                .header("Authentication", format!("skypetoken={}", st))
                                .header("x-skypetoken", st);
                        }
                    }
                    if let Ok(res) = req.send().await {
                        if res.status().is_success() {
                            if let Ok(json) = res.json::<Value>().await {
                                if let Some(msgs) = json.get("messages").and_then(|v| v.as_array())
                                {
                                    let mut count_for_course = 0;
                                    let mut course_api_items = Vec::<FeedItem>::new();
                                    for msg in msgs {
                                        let m_type = msg
                                            .get("messagetype")
                                            .or_else(|| msg.get("messageType"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_lowercase();
                                        if !m_type.contains("richtext") && m_type != "text" {
                                            continue;
                                        }

                                        let props_val = msg.get("properties");
                                        if props_val
                                            .and_then(|p| {
                                                p.get("deletetime")
                                                    .or_else(|| p.get("systemdelete"))
                                            })
                                            .is_some()
                                        {
                                            continue;
                                        }

                                        let msg_id = msg
                                            .get("id")
                                            .or_else(|| msg.get("sequenceId"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        let conv_link = msg
                                            .get("conversationLink")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");

                                        // Filtra apenas postagens principais do canal Geral
                                        if let Some(idx) = conv_link.find(";messageid=") {
                                            let root_id = &conv_link[idx + 11..];
                                            let root_clean =
                                                root_id.split(['/', '?', ';']).next().unwrap_or("");
                                            if !root_clean.is_empty()
                                                && !msg_id.is_empty()
                                                && root_clean != msg_id
                                            {
                                                continue;
                                            }
                                        }

                                        let raw_html = msg
                                            .get("content")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        let mut body_text = clean_html_to_text(raw_html);

                                        let mut explicit_title = props_val
                                            .and_then(|p| {
                                                p.get("subject").or_else(|| p.get("title"))
                                            })
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .trim()
                                            .to_string();

                                        let mut is_card_assignment = false;
                                        // Extrai conteúdo de AdaptiveCards / HeroCards (ex: cards de Atividades no canal Geral)
                                        if let Some(cards_val) =
                                            props_val.and_then(|p| p.get("cards"))
                                        {
                                            let cards_arr: Option<Vec<Value>> =
                                                if let Some(s) = cards_val.as_str() {
                                                    serde_json::from_str(s).ok()
                                                } else {
                                                    cards_val.as_array().cloned()
                                                };
                                            if let Some(c_list) = cards_arr {
                                                for card in c_list {
                                                    let card_str = card.to_string().to_lowercase();
                                                    if card_str.contains("assignments.onenote.com")
                                                        || card_str.contains("eduassignments")
                                                        || card_str.contains("view assignment")
                                                        || card_str.contains("exibir tarefa")
                                                        || card_str.contains("ver tarefa")
                                                    {
                                                        is_card_assignment = true;
                                                    }
                                                    let content_obj =
                                                        card.get("content").unwrap_or(&card);
                                                    if let Some(t) = content_obj
                                                        .get("title")
                                                        .or_else(|| content_obj.get("subTitle"))
                                                        .and_then(|v| v.as_str())
                                                    {
                                                        let clean_t = clean_html_to_text(t);
                                                        if !clean_t.is_empty()
                                                            && explicit_title.is_empty()
                                                        {
                                                            explicit_title = clean_t;
                                                        }
                                                    }
                                                    if let Some(txt) = content_obj
                                                        .get("text")
                                                        .and_then(|v| v.as_str())
                                                    {
                                                        let clean_txt = clean_html_to_text(txt);
                                                        if !clean_txt.is_empty() {
                                                            if !body_text.is_empty() {
                                                                body_text.push('\n');
                                                            }
                                                            body_text.push_str(&clean_txt);
                                                        }
                                                    }
                                                    if let Some(body_arr) = content_obj
                                                        .get("body")
                                                        .and_then(|v| v.as_array())
                                                    {
                                                        for b_item in body_arr {
                                                            if let Some(bt) = b_item
                                                                .get("text")
                                                                .and_then(|v| v.as_str())
                                                            {
                                                                let clean_bt =
                                                                    clean_html_to_text(bt);
                                                                if !clean_bt.is_empty() {
                                                                    if explicit_title.is_empty() {
                                                                        explicit_title =
                                                                            clean_bt.clone();
                                                                    } else {
                                                                        if !body_text.is_empty() {
                                                                            body_text.push('\n');
                                                                        }
                                                                        body_text
                                                                            .push_str(&clean_bt);
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        if body_text.is_empty() && explicit_title.is_empty() {
                                            continue;
                                        }
                                        if body_text.is_empty() {
                                            body_text = explicit_title.clone();
                                        }

                                        // Extrai anexos de properties.files
                                        if let Some(files_val) =
                                            props_val.and_then(|p| p.get("files"))
                                        {
                                            let files_arr: Option<Vec<Value>> =
                                                if let Some(s) = files_val.as_str() {
                                                    serde_json::from_str(s).ok()
                                                } else {
                                                    files_val.as_array().cloned()
                                                };
                                            if let Some(f_list) = files_arr {
                                                let mut att_names = Vec::new();
                                                for f in f_list {
                                                    if let Some(fn_str) = f
                                                        .get("fileName")
                                                        .or_else(|| f.get("title"))
                                                        .and_then(|v| v.as_str())
                                                    {
                                                        if !fn_str.trim().is_empty() {
                                                            att_names
                                                                .push(fn_str.trim().to_string());
                                                        }
                                                    }
                                                }
                                                if !att_names.is_empty() {
                                                    if !body_text.is_empty() {
                                                        body_text.push_str("\n\n");
                                                    }
                                                    body_text.push_str(&format!(
                                                        "📎 Anexos: {}",
                                                        att_names.join(", ")
                                                    ));
                                                }
                                            }
                                        }

                                        let final_title = if !explicit_title.is_empty() {
                                            explicit_title
                                        } else {
                                            let first_line =
                                                body_text.lines().next().unwrap_or("").trim();
                                            if first_line.chars().count() <= 65
                                                && !first_line.is_empty()
                                            {
                                                first_line.to_string()
                                            } else if !first_line.is_empty() {
                                                format!(
                                                    "{}...",
                                                    first_line.chars().take(60).collect::<String>()
                                                )
                                            } else {
                                                format!("Comunicado: {}", course.name)
                                            }
                                        };

                                        let author = msg
                                            .get("imdisplayname")
                                            .and_then(|v| v.as_str())
                                            .filter(|s| !s.trim().is_empty())
                                            .unwrap_or("Professor / Turma")
                                            .to_string();

                                        let author_lower = author.to_lowercase();
                                        if author_lower.contains("assignment")
                                            || author_lower.contains("atribui")
                                            || author_lower == "tarefas"
                                        {
                                            is_card_assignment = true;
                                        }

                                        let created_at = msg
                                            .get("composetime")
                                            .or_else(|| msg.get("originalarrivaltime"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();

                                        let item_id = format!(
                                            "teams-post-{}-{}",
                                            course.code,
                                            if !msg_id.is_empty() {
                                                msg_id.to_string()
                                            } else {
                                                created_at.clone()
                                            }
                                        );

                                        if seen_item_ids.contains(&item_id) {
                                            continue;
                                        }
                                        seen_item_ids.insert(item_id.clone());
                                        count_for_course += 1;

                                        course_api_items.push(FeedItem {
                                            id: item_id,
                                            platform: PlatformType::Teams,
                                            title: final_title,
                                            content: body_text,
                                            course_name: course.name.clone(),
                                            course_code: Some(course.code.clone()),
                                            author: Some(author),
                                            item_type: if is_card_assignment {
                                                FeedItemType::Assignment
                                            } else {
                                                FeedItemType::Post
                                            },
                                            created_at: if created_at.is_empty() {
                                                chrono::Utc::now().to_rfc3339()
                                            } else {
                                                created_at
                                            },
                                            due_date: None,
                                            is_completed: Some(false),
                                            external_url: Some(
                                                "https://teams.microsoft.com".into(),
                                            ),
                                        });
                                    }
                                    if count_for_course > 0 {
                                        // Substitui itens parciais do fallback DOM pelos itens completos da API
                                        items.retain(|it| {
                                            !(it.id.starts_with("teams-dom-")
                                                && it
                                                    .course_name
                                                    .eq_ignore_ascii_case(&course.name))
                                        });
                                        items.extend(course_api_items);
                                    }
                                    trace.push(format!(
                                        "Curso '{}': {} postagens extraídas do canal Geral!",
                                        course.name, count_for_course
                                    ));
                                    break 'msg_outer;
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3.2 Atividades (Assignments) via Edu API ou Graph Education
        if !meta.group_id.is_empty() {
            let mut assign_urls = Vec::<(String, String)>::new();
            if let Some(at) = &tokens.assignments {
                if !at.is_empty() {
                    assign_urls.push((
                        format!(
                            "https://assignments.onenote.com/api/v1.0/edu/classes/{}/assignments?$expand=submissions&$top=100",
                            meta.group_id
                        ),
                        at.clone(),
                    ));
                    assign_urls.push((
                        format!(
                            "https://assignments.onenote.com/api/v1.0/edu/classes/{}/assignments?$top=100",
                            meta.group_id
                        ),
                        at.clone(),
                    ));
                }
            }
            if let Some(gt) = &tokens.graph {
                if !gt.is_empty() {
                    assign_urls.push((
                        format!(
                            "https://graph.microsoft.com/v1.0/education/classes/{}/assignments?$expand=submissions&$top=100",
                            meta.group_id
                        ),
                        gt.clone(),
                    ));
                }
            }

            for (url, tok) in assign_urls {
                if let Ok(res) = client
                    .get(&url)
                    .header("Authorization", format!("Bearer {}", tok))
                    .header("Accept", "application/json")
                    .send()
                    .await
                {
                    if res.status().is_success() {
                        if let Ok(json) = res.json::<Value>().await {
                            if let Some(arr) = json
                                .get("value")
                                .and_then(|v| v.as_array())
                                .or_else(|| json.as_array())
                            {
                                let mut assign_count = 0;
                                for raw in arr {
                                    let status_str = raw
                                        .get("status")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_lowercase();
                                    if status_str == "draft"
                                        || status_str == "deleted"
                                        || status_str == "canceled"
                                    {
                                        continue;
                                    }
                                    let title = raw
                                        .get("displayName")
                                        .or_else(|| raw.get("title"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .trim()
                                        .to_string();
                                    if title.is_empty() {
                                        continue;
                                    }

                                    let instr_html = raw
                                        .get("instructions")
                                        .and_then(|i| i.get("content"))
                                        .or_else(|| raw.get("description"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("");
                                    let mut content = clean_html_to_text(instr_html);
                                    if content.is_empty() {
                                        content = format!(
                                            "Atividade atribuída no Microsoft Teams ({}).",
                                            course.name
                                        );
                                    }

                                    let due_date = raw
                                        .get("dueDateTime")
                                        .or_else(|| raw.get("dueDate"))
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                    let created_at = raw
                                        .get("assignedDateTime")
                                        .or_else(|| raw.get("createdDateTime"))
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string())
                                        .or_else(|| due_date.clone())
                                        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

                                    let mut is_completed = status_str == "submitted"
                                        || status_str == "returned"
                                        || status_str == "turnedin"
                                        || status_str == "graded"
                                        || status_str == "completed";

                                    if let Some(subs) =
                                        raw.get("submissions").and_then(|v| v.as_array())
                                    {
                                        for sub in subs {
                                            let sub_st = sub
                                                .get("status")
                                                .or_else(|| sub.get("submissionStatus"))
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("")
                                                .to_lowercase();
                                            let has_sub_date = sub
                                                .get("submittedDateTime")
                                                .and_then(|v| v.as_str())
                                                .is_some();
                                            if sub_st == "submitted"
                                                || sub_st == "returned"
                                                || sub_st == "turnedin"
                                                || sub_st == "graded"
                                                || sub_st == "completed"
                                                || has_sub_date
                                            {
                                                is_completed = true;
                                                break;
                                            }
                                        }
                                    }

                                    let raw_id =
                                        raw.get("id").and_then(|v| v.as_str()).unwrap_or(&title);
                                    let item_id =
                                        format!("teams-assign-{}-{}", course.code, raw_id);
                                    if seen_item_ids.contains(&item_id) {
                                        continue;
                                    }
                                    seen_item_ids.insert(item_id.clone());
                                    assign_count += 1;

                                    items.push(FeedItem {
                                        id: item_id,
                                        platform: PlatformType::Teams,
                                        title,
                                        content,
                                        course_name: course.name.clone(),
                                        course_code: Some(course.code.clone()),
                                        author: Some("Atribuições (Teams)".into()),
                                        item_type: FeedItemType::Assignment,
                                        created_at,
                                        due_date,
                                        is_completed: Some(is_completed),
                                        external_url: raw
                                            .get("webUrl")
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_string())
                                            .or_else(|| Some("https://teams.microsoft.com".into())),
                                    });
                                }
                                trace.push(format!(
                                    "Curso '{}': {} atividades (Assignments) extraídas!",
                                    course.name, assign_count
                                ));
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    // Recalcula pending_assignments_count de cada curso
    for c in &mut courses {
        let pending = items
            .iter()
            .filter(|it| {
                matches!(it.item_type, FeedItemType::Assignment)
                    && it.is_completed != Some(true)
                    && (it.course_name.eq_ignore_ascii_case(&c.name)
                        || it.course_code.as_deref() == Some(c.code.as_str()))
            })
            .count() as u32;
        c.pending_assignments_count = Some(pending);
    }

    for line in &trace {
        log::info!("[Teams Sync Trace] {}", line);
    }
    let _ = std::fs::write("/tmp/sarue-teams-debug.log", trace.join("\n"));

    (items, courses)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_teams_payload_real_posts_and_assignments() {
        let payload = r#"{
            "courses": [
                {
                    "id": "teams-course-0",
                    "code": "SSTC",
                    "name": "SSTC - Sinais e Sistemas em Tempo Contínuo",
                    "url": "https://teams.microsoft.com"
                },
                {
                    "id": "teams-course-1",
                    "code": "OAC",
                    "name": "OAC Prof Ricardo Jacobi",
                    "url": "https://teams.microsoft.com"
                },
                {
                    "id": "teams-junk",
                    "code": "EQUIPES",
                    "name": "Equipes Microsoft Teams",
                    "url": "https://teams.microsoft.com"
                }
            ],
            "items": [
                {
                    "id": "teams-msg-oac-1",
                    "title": "Teste 5",
                    "content": "Enfim o teste 5 está pronto. Abre hoje às 20 hs e fica aberto até domingo",
                    "courseName": "OAC Prof Ricardo Jacobi",
                    "courseCode": "OAC",
                    "author": "Ricardo Pezzuol Jacobi",
                    "itemType": "post",
                    "createdAt": "2026-10-09T17:11:00Z"
                },
                {
                    "id": "teams-msg-oac-2",
                    "title": "PROVA",
                    "content": "Pipol, as provas são hoje, no PJC. 13 hs e 18 hs, respectivamente. Celulares proibidos. Podem trazer uma calculadora simples, se quiserem.",
                    "courseName": "OAC Prof Ricardo Jacobi",
                    "courseCode": "OAC",
                    "author": "Ricardo Pezzuol Jacobi",
                    "itemType": "post",
                    "createdAt": "2026-09-29T09:15:00Z"
                },
                {
                    "id": "teams-assign-oac-1",
                    "title": "Trabalho Prático RISC-V",
                    "content": "Implementar simulador unicycle em Assembly RISC-V.",
                    "courseName": "OAC Prof Ricardo Jacobi",
                    "courseCode": "OAC",
                    "author": "Atribuições (Teams)",
                    "itemType": "assignment",
                    "createdAt": "2026-10-01T12:00:00Z",
                    "dueDate": "2026-10-20T23:59:00Z",
                    "isCompleted": false
                },
                {
                    "id": "teams-assign-oac-2",
                    "title": "Lab 1 - Introdução",
                    "content": "Entregar relatório em PDF.",
                    "courseName": "OAC Prof Ricardo Jacobi",
                    "courseCode": "OAC",
                    "author": "Atribuições (Teams)",
                    "itemType": "assignment",
                    "createdAt": "2026-09-10T12:00:00Z",
                    "dueDate": "2026-09-18T23:59:00Z",
                    "isCompleted": true
                },
                {
                    "id": "teams-banner-junk",
                    "title": "Turn on desktop notifications",
                    "content": "Stay in the know about new messages and mentions.",
                    "courseName": "OAC",
                    "itemType": "post"
                }
            ]
        }"#;

        let (items, courses) = parse_teams_bridge_payload(payload);

        assert_eq!(courses.len(), 2);
        assert_eq!(
            courses[0].name,
            "SSTC - Sinais e Sistemas em Tempo Contínuo"
        );
        assert_eq!(courses[0].pending_assignments_count, Some(0));
        assert_eq!(courses[1].name, "OAC Prof Ricardo Jacobi");
        assert_eq!(courses[1].pending_assignments_count, Some(1));

        assert_eq!(items.len(), 4);
        assert_eq!(items[0].title, "Teste 5");
        assert_eq!(items[2].title, "Trabalho Prático RISC-V");
        assert!(matches!(
            items[2].item_type,
            crate::models::FeedItemType::Assignment
        ));
        assert_eq!(items[2].due_date.as_deref(), Some("2026-10-20T23:59:00Z"));
        assert_eq!(items[2].is_completed, Some(false));
        assert_eq!(items[3].is_completed, Some(true));
    }
}
