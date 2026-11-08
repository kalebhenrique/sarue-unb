use crate::models::{Course, FeedItem};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

pub struct HiddenWebviewScraper;

impl HiddenWebviewScraper {
    /// Sincronização do Teams via Hidden Webview com injeção JS e ponte de dados
    pub async fn sync_teams(
        app: &AppHandle,
        _email: &str,
        _senha: &str,
    ) -> Result<(Vec<FeedItem>, Vec<Course>), String> {
        use std::sync::{Arc, Mutex};

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
        .inner_size(1024.0, 740.0)
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
                        let parsed = parse_teams_bridge_payload(&full_payload);
                        if let Ok(mut lock) = tx_clone_nav.lock() {
                            if let Some(sender) = lock.take() {
                                let _ = sender.send(Ok(parsed));
                            }
                        }
                    }
                } else {
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

        // Timeout de até 35 segundos para rastreamento de equipes e canais em segundo plano
        let sync_result: Result<(Vec<FeedItem>, Vec<Course>), String> =
            match tokio::time::timeout(tokio::time::Duration::from_secs(35), rx).await {
                Ok(Ok(inner_res)) => inner_res,
                Ok(Err(_)) => {
                    Err("Comunicação com a janela do Teams em segundo plano interrompida.".into())
                }
                Err(_) => {
                    log::warn!("[Teams Sync] Timeout no rastreamento do Teams.");
                    Ok((Vec::new(), Vec::new()))
                }
            };

        let _ = window.destroy();
        log::info!("Webview em segundo plano do Teams finalizada e destruída com sucesso.");

        let (items, courses) = sync_result?;
        Ok((items, courses))
    }
}

pub const TEAMS_CRAWLER_SCRIPT: &str = r##"
(function() {
    if (window !== window.top) return;
    window.focus = function() {};
    document.focus = function() {};
    if (window.__aggregator_crawler_installed) return;
    window.__aggregator_crawler_installed = true;

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
        'unb aggregator', 'atribuições', 'assignments', 'calendário', 'calendar', 'chamadas', 'calls', 'onedrive',
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
        let email = '';
        try {
            const storages = [localStorage, sessionStorage];
            for (const store of storages) {
                if (!store) continue;
                for (let i = 0; i < store.length; i++) {
                    const k = store.key(i) || '';
                    const v = store.getItem(k) || '';
                    if (v.includes('@aluno.unb.br')) {
                        const m = v.match(/[a-zA-Z0-9._%+-]+@aluno\.unb\.br/i);
                        if (m) return m[0];
                    } else if (v.includes('@unb.br')) {
                        const m = v.match(/[a-zA-Z0-9._%+-]+@unb\.br/i);
                        if (m) return m[0];
                    }
                }
            }
            const profileEls = document.querySelectorAll('[data-tid*="avatar"], [data-tid*="me-control"], button[id*="person"], button[aria-label*="@"]');
            for (const el of profileEls) {
                const text = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '');
                const m = text.match(/[a-zA-Z0-9._%+-]+@(aluno\.)?unb\.br/i);
                if (m) return m[0];
            }
        } catch(e) {}
        return email;
    }

    function findBackButton() {
        // 1. Procura por elementos interativos visíveis cujo texto ou aria-label seja "Todas as equipes" / "All teams"
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

        // 2. Fallback: nó folha visível cujo texto exato seja "Todas as equipes" / "All teams"
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
            if (t === 'postar no canal' || t === 'nova conversa' || t === 'start a post' || t === 'new post') {
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
        // Fallback: clica no ícone lateral de Equipes / Teams na barra esquerda
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

        // Nunca busca cards de equipes se estivermos visivelmente dentro do canal de uma equipe
        if (isInsideTeamView()) {
            return [];
        }

        const teams = [];

        // 1. Identifica a seção de 'Oculto' / 'Hidden' para ignorar turmas antigas/ocultas abaixo dela
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

        // 2. Estratégia primária: busca cards da grade principal do Teams
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

        // 3. Fallback geométrico: caso o Teams use classes ofuscadas sem role="gridcell" ou "Card"
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

    function findPostContainer(leaf) {
        if (!leaf) return null;

        // 1. Procura por fronteiras conhecidas de post/artigo no Teams (role=article, thread-item, chat-item)
        const boundaryCandidates = [
            leaf.closest('[role="article"]'),
            leaf.closest('[data-tid*="thread-item"]'),
            leaf.closest('[data-tid*="chat-item"]'),
            leaf.closest('[data-tid*="channel-message"]'),
            leaf.closest('[data-tid*="post-item"]'),
            leaf.closest('div[class*="ThreadItem"]'),
            leaf.closest('div[class*="thread-item"]'),
            leaf.closest('div[class*="fui-ChatMessage"]')
        ].filter(Boolean);

        for (const candidate of boundaryCandidates) {
            if (candidate.id === '__unb_aggregator_banner__' || candidate.closest('#__unb_aggregator_banner__')) continue;
            if (candidate.closest('nav') || candidate.closest('[role="navigation"]')) continue;
            const text = (candidate.innerText || candidate.textContent || '').trim();
            const lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
            // Deve englobar autor, data e conteúdo (ao menos 3 linhas)
            if (lines.length >= 3) {
                return candidate;
            }
        }

        // 2. Sobe na hierarquia DOM a partir do nó de data até encontrar um container com linhas de conteúdo
        let curr = leaf.parentElement;
        let best = null;

        while (curr && curr.tagName !== 'MAIN' && curr.tagName !== 'BODY') {
            if (curr.id === '__unb_aggregator_banner__' || curr.closest('#__unb_aggregator_banner__')) break;
            if (curr.closest('nav') || curr.closest('[role="navigation"]')) break;

            const text = (curr.innerText || curr.textContent || '').trim();
            const lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);

            if (lines.length >= 3) {
                best = curr;
                const role = curr.getAttribute('role');
                const tid = curr.getAttribute('data-tid') || '';
                if (role === 'article' || tid.includes('thread') || tid.includes('message')) {
                    return curr;
                }
            }

            // Se o container subir tanto a ponto de conter múltiplas datas distintas (englobou vários posts do feed), para!
            const dateMatches = text.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s*[,às\-]?\s*\d{1,2}:\d{2})?\b/g) || [];
            if (dateMatches.length > 1 && best) {
                return best;
            }

            curr = curr.parentElement;
        }

        return best || leaf.closest('[role="article"]') || leaf.parentElement?.parentElement;
    }

    function parsePostFromContainer(container, course) {
        if (!container) return null;
        const rawText = (container.innerText || container.textContent || '').trim();
        if (rawText.length < 8) return null;

        const lower = rawText.toLowerCase();
        if (lower.includes('turn on desktop notifications')
            || lower.includes('stay in the know')
            || lower.includes('apply and restart')
            || lower.includes('change language')
            || lower.includes('reiniciar para alterar o idioma')
            || lower.includes('restart for change language')) {
            return null;
        }

        const dateMatch = rawText.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:\s*[,às\-]?\s*(\d{1,2}:\d{2}))?\b/)
            || rawText.match(/\b(\d{1,2}\s+de\s+[a-zç]+\.?\s*(?:de\s+\d{4})?)(?:\s*[,às\-]?\s*(\d{1,2}:\d{2}))?\b/i)
            || rawText.match(/\b(hoje|ontem|today|yesterday)(?:\s*[,às\-]?\s*(\d{1,2}:\d{2}))?\b/i);

        if (!dateMatch) return null;

        const timeStr = dateMatch[0];
        const rawLines = rawText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
        const cleanLines = [];

        for (const line of rawLines) {
            // Ignora ações e botões da interface do Teams
            if (/^(responder|reply|postar|cancelar|editar|edit|reagir|reagiu|👍|❤️|😂|😮|😢|😡|mais opções|more options|postar no canal|respostas?|replies|salvar|save)$/i.test(line)) continue;
            if (/^\d+\s+(respostas?|replies)$/i.test(line)) continue;
            if (/^(ver|view|ocultar|hide)\s+/i.test(line)) continue;
            // Ignora avatar initials de 1 a 2 letras maiúsculas isoladas (ex: RP, RJ)
            if (/^[A-Z]{1,2}$/.test(line)) continue;
            cleanLines.push(line);
        }

        if (cleanLines.length === 0) return null;

        let author = 'Professor / Turma';
        let authorLineIdx = -1;

        for (let i = 0; i < cleanLines.length; i++) {
            const line = cleanLines[i];
            if (line.includes(timeStr)) {
                const beforeDate = line.replace(timeStr, '').trim();
                if (beforeDate.length >= 3 && !isSystemText(beforeDate)) {
                    author = beforeDate;
                } else if (i > 0 && cleanLines[i - 1].length >= 3 && !isSystemText(cleanLines[i - 1])) {
                    author = cleanLines[i - 1];
                }
                authorLineIdx = i;
                break;
            }
        }

        // Linhas de conteúdo após o autor e a data
        const contentLines = authorLineIdx >= 0 ? cleanLines.slice(authorLineIdx + 1) : cleanLines;
        if (contentLines.length === 0) return null;

        // Procura por título explícito no DOM (ex: [data-tid*="subject"], [data-tid*="title"], h3, h4, etc.)
        let explicitTitle = '';
        const titleEl = container.querySelector(
            '[data-tid*="subject"], [data-tid*="title"], [data-tid*="heading"], h3, h4, [class*="subject"], [class*="Subject"], [class*="header-title"], div[role="heading"]'
        );
        if (titleEl) {
            const tText = (titleEl.textContent || '').trim();
            if (tText.length >= 2 && tText.length <= 120 && !isSystemText(tText)) {
                explicitTitle = tText;
            }
        }

        let subject = explicitTitle;
        let bodyLines = [];

        if (explicitTitle) {
            if (contentLines.length > 0 && contentLines[0] === explicitTitle) {
                bodyLines = contentLines.slice(1);
            } else {
                bodyLines = contentLines;
            }
        } else {
            // No Teams, a primeira linha de texto após a data é o assunto/título do post (ex: "Teste 5", "PROVA", "Trabalho III")
            if (contentLines.length >= 2) {
                subject = contentLines[0];
                bodyLines = contentLines.slice(1);
            } else if (contentLines.length === 1) {
                const single = contentLines[0];
                if (single.length <= 60) {
                    subject = single;
                    bodyLines = [single];
                } else {
                    subject = single.slice(0, 50).trim() + '...';
                    bodyLines = [single];
                }
            }
        }

        let bodyText = bodyLines.join('\n').trim();
        if (!bodyText) {
            bodyText = subject;
        }

        // Extrai anexos do post
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

        // Parse da data para ISO
        let isoDate = new Date().toISOString();
        try {
            const parts = timeStr.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?/);
            if (parts) {
                const day = parseInt(parts[1], 10);
                const month = parseInt(parts[2], 10) - 1;
                const year = parts[3] ? parseInt(parts[3], 10) : new Date().getFullYear();
                const hour = parts[4] ? parseInt(parts[4], 10) : 12;
                const min = parts[5] ? parseInt(parts[5], 10) : 0;
                const d = new Date(year, month, day, hour, min);
                if (!isNaN(d.getTime())) {
                    isoDate = d.toISOString();
                }
            }
        } catch(e) {}

        if (bodyText.length > 2000) {
            bodyText = bodyText.slice(0, 2000) + '...';
        }

        // Garante que o título nunca caia para "Aviso: <Curso>" quando tivermos assunto ou texto
        const finalTitle = subject ? subject.trim() : (bodyText ? bodyText.slice(0, 50).trim() : ('Aviso: ' + course.name));

        return {
            id: 'teams-msg-' + course.code + '-' + timeStr.replace(/[^0-9]/g, '') + '-' + finalTitle.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8),
            title: finalTitle,
            content: bodyText,
            courseName: course.name,
            courseCode: course.code,
            author: author,
            itemType: 'post',
            createdAt: isoDate,
            externalUrl: window.location.href,
        };
    }

    function scrapeChannelPosts(course) {
        purgeSystemBanners();
        const posts = [];
        const allCandidateContainers = [];

        const dateNodes = Array.from(document.querySelectorAll('*')).filter(function(el) {
            if (el.children.length > 0) return false;
            if (el.id === '__unb_aggregator_banner__' || el.closest('#__unb_aggregator_banner__')) return false;
            if (el.closest('nav') || el.closest('[role="navigation"]')) return false;
            const t = (el.textContent || '').trim();
            return /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s*[,às\-]?\s*\d{1,2}:\d{2})?\b/.test(t) && t.length <= 35;
        });

        dateNodes.forEach(function(leaf) {
            const container = findPostContainer(leaf);
            if (container && !allCandidateContainers.includes(container) && !container.closest('nav') && container.id !== '__unb_aggregator_banner__') {
                allCandidateContainers.push(container);
            }
        });

        allCandidateContainers.forEach(function(container) {
            const post = parsePostFromContainer(container, course);
            if (post && !posts.some(function(p) { return p.title === post.title && p.author === post.author && p.createdAt === post.createdAt; })) {
                posts.push(post);
            }
        });

        return posts;
    }

    async function finishAndSend(courses, items, email) {
        const payloadStr = JSON.stringify({ courses: courses || [], items: items || [] });
        const CHUNK_SIZE = 32000;
        const totalChunks = Math.ceil(payloadStr.length / CHUNK_SIZE) || 1;

        if (payloadStr.length <= CHUNK_SIZE) {
            const qs = 'action=sync_done&payload=' + encodeURIComponent(payloadStr) + '&email=' + encodeURIComponent(email || '');
            window.location.href = window.location.origin + '/__aggregator_bridge__?' + qs;
        } else {
            for (let seq = 0; seq < totalChunks; seq++) {
                const chunk = payloadStr.slice(seq * CHUNK_SIZE, (seq + 1) * CHUNK_SIZE);
                const qs = 'action=sync_chunk&seq=' + seq + '&total=' + totalChunks + '&chunk=' + encodeURIComponent(chunk) + '&email=' + encodeURIComponent(email || '');
                window.location.href = window.location.origin + '/__aggregator_bridge__?' + qs;
                await sleep(100);
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
                console.warn('[Teams Crawler] Limite de segurança atingido. Enviando dados coletados.');
                await finishAndSend(courses, items, detectedEmail || extractUserEmail() || '');
            }
        }, 28000);

        try {
            purgeSystemBanners();
            detectedEmail = extractUserEmail();

            setStatus('Acessando grade de turmas...');

            // Se estiver dentro de uma equipe/canal, retorna primeiro para a grade principal de equipes
            if (isInsideTeamView()) {
                returnToGrid();
                await sleep(1000);
            }

            // Aguarda grade de turmas carregar (até 10s)
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

            // Registra as turmas encontradas
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

            // Visita cada equipe cirurgicamente para ler as postagens do canal Geral
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
                    if (!clickable) {
                        clickable = interactives.find(function(el) {
                            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                            const txt = (el.textContent || '').trim().toLowerCase();
                            return !aria.includes('opções') && !aria.includes('options') && !aria.includes('more') && txt !== '...' && txt !== '…';
                        });
                    }
                }

                triggerClick(clickable || target.titleElement || cardEl);

                // Aguarda entrar no canal da equipe e as postagens carregarem (até 5s)
                for (let wait = 0; wait < 12; wait++) {
                    await sleep(400);
                    purgeSystemBanners();
                    if (isInsideTeamView()) {
                        const hasTimestamps = Array.from(document.querySelectorAll('*')).some(function(el) {
                            if (el.children.length > 0) return false;
                            return /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s*[,às\-]?\s*\d{1,2}:\d{2})?\b/.test(el.textContent || '');
                        });
                        if (hasTimestamps) break;
                    } else if (wait === 3 && cardEl) {
                        triggerClick(cardEl);
                    }
                }
                await sleep(500);

                // Leitura pura do DOM das postagens (zero cliques no feed!)
                const teamPosts = scrapeChannelPosts(course);
                items.push.apply(items, teamPosts);

                // Se houver mais equipes para visitar, volta para a grade de equipes
                if (i + 1 < visibleTeams.length) {
                    returnToGrid();
                    for (let w = 0; w < 10; w++) {
                        await sleep(350);
                        if (!isInsideTeamView() && findTeamsFromGrid().length > 0) break;
                    }
                }
            }

            if (!detectedEmail) {
                detectedEmail = extractUserEmail();
            }

            setStatus('Concluído! Fechando janela...');
            clearTimeout(safetyTimer);
            if (!sent) {
                sent = true;
                await finishAndSend(courses, items, detectedEmail);
            }
        } catch(err) {
            console.error('[Teams Crawler Error]:', err);
            clearTimeout(safetyTimer);
            if (!sent) {
                sent = true;
                const fallbackEmail = detectedEmail || extractUserEmail() || '';
                await finishAndSend(courses, items, fallbackEmail);
            }
        }
    }

    window.__unb_start_crawl = crawl;
    if (window.__unb_auto_crawl) {
        if (document.readyState === 'complete') {
            setTimeout(crawl, 2500);
        } else {
            window.addEventListener('load', function() {
                setTimeout(crawl, 2500);
            });
        }
    }
})();
"##;

pub fn parse_teams_bridge_payload(payload_str: &str) -> (Vec<FeedItem>, Vec<Course>) {
    #[derive(serde::Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct RawBridgePayload {
        courses: Option<Vec<RawCourse>>,
        items: Option<Vec<RawItem>>,
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
        external_url: Option<String>,
    }

    let parsed: RawBridgePayload = serde_json::from_str(payload_str).unwrap_or_default();

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
            courses.push(Course {
                id: c.id.unwrap_or_else(|| format!("teams-c-{}", i)),
                code: c.code.unwrap_or_else(|| "TEAMS".into()),
                name: c.name,
                semester,
                platform: crate::models::PlatformType::Teams,
                professor: None,
                classroom: Some("Teams Online".into()),
                schedule: None,
                class_group: None,
                unread_count: Some(0),
                pending_assignments_count: Some(0),
                url: c.url.or_else(|| Some("https://teams.microsoft.com".into())),
                absences: None,
                max_absences: None,
            });
        }
    }

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
                is_completed: Some(false),
                external_url: it
                    .external_url
                    .or_else(|| Some("https://teams.microsoft.com".into())),
            });
        }
    }

    (items, courses)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_teams_payload_real_posts() {
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
                    "id": "teams-msg-oac-3",
                    "title": "Trabalho III",
                    "content": "Pessoal, tá no Moodle. São 3 questões de programação em assembly do RiscV, que vcs podem utilizar para estudo para a prova. \ntá aberto até quinta-feira.",
                    "courseName": "OAC Prof Ricardo Jacobi",
                    "courseCode": "OAC",
                    "author": "Ricardo Pezzuol Jacobi",
                    "itemType": "post",
                    "createdAt": "2026-09-26T17:31:00Z"
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

        // Junk "Equipes Microsoft Teams" deve ter sido descartado
        assert_eq!(courses.len(), 2);
        assert_eq!(
            courses[0].name,
            "SSTC - Sinais e Sistemas em Tempo Contínuo"
        );
        assert_eq!(courses[1].name, "OAC Prof Ricardo Jacobi");

        // Banner de notificações do Teams deve ter sido descartado, mantendo apenas os 3 posts reais
        assert_eq!(items.len(), 3);

        assert_eq!(items[0].title, "Teste 5");
        assert_eq!(items[0].author.as_deref(), Some("Ricardo Pezzuol Jacobi"));
        assert!(items[0].content.contains("Enfim o teste 5 está pronto"));

        assert_eq!(items[1].title, "PROVA");
        assert_eq!(items[1].author.as_deref(), Some("Ricardo Pezzuol Jacobi"));
        assert!(items[1].content.contains("no PJC"));

        assert_eq!(items[2].title, "Trabalho III");
        assert_eq!(items[2].author.as_deref(), Some("Ricardo Pezzuol Jacobi"));
        assert!(items[2].content.contains("assembly do RiscV"));
    }
}
