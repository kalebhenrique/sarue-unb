use reqwest::StatusCode;

/// Traduz um `reqwest::Error` em uma mensagem curta, amigável e em português
/// para exibição ao usuário, preservando o erro técnico completo nos logs.
pub fn describe_reqwest_error(service: &str, err: &reqwest::Error) -> String {
    log::warn!("[http_error] Falha de comunicação com {}: {}", service, err);

    if err.is_timeout() {
        return format!(
            "Tempo esgotado ao conectar ao {}. O servidor pode estar lento ou instável.",
            service
        );
    }

    if err.is_connect() {
        return format!(
            "Não foi possível conectar ao {}. Verifique sua conexão com a internet.",
            service
        );
    }

    if err.is_decode() || err.is_body() {
        return format!(
            "Resposta incompleta do {}. Tente novamente em alguns instantes.",
            service
        );
    }

    if let Some(status) = err.status() {
        if let Err(msg) = check_http_status(service, status) {
            return msg;
        }
    }

    format!(
        "Erro de comunicação com o {}. Tente novamente em alguns instantes.",
        service
    )
}

/// Traduz um status HTTP não-2xx em mensagem amigável ao usuário e registra o detalhe no log.
pub fn describe_http_status(service: &str, status: StatusCode) -> String {
    let code = status.as_u16();
    log::warn!(
        "[http_error] {} retornou status HTTP não esperado: {}",
        service,
        status
    );

    if status.is_server_error() {
        return format!(
            "O servidor do {} está temporariamente indisponível (HTTP {}). Tente novamente mais tarde.",
            service, code
        );
    }

    if status == StatusCode::TOO_MANY_REQUESTS {
        return format!(
            "Muitas tentativas no {}. Aguarde alguns instantes e tente novamente.",
            service
        );
    }

    format!("Não foi possível acessar o {} (HTTP {}).", service, code)
}

/// Valida o status HTTP de uma resposta antes do parsing, traduzindo códigos
/// de erro (3xx não seguido, 4xx, 429, 5xx) em mensagens amigáveis ao usuário.
pub fn check_http_status(service: &str, status: StatusCode) -> Result<(), String> {
    if status.is_success() {
        return Ok(());
    }
    Err(describe_http_status(service, status))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_http_status_allows_only_2xx() {
        assert!(check_http_status("SIGAA", StatusCode::OK).is_ok());
        assert!(check_http_status("SIGAA", StatusCode::FOUND).is_err());
    }

    #[test]
    fn check_http_status_maps_server_errors() {
        let err = check_http_status("SIGAA", StatusCode::SERVICE_UNAVAILABLE).unwrap_err();
        assert!(err.contains("temporariamente indisponível"));
        assert!(err.contains("503"));
        assert!(!err.contains("http://"));
        assert!(!err.contains("https://"));
    }

    #[test]
    fn check_http_status_maps_rate_limit() {
        let err = check_http_status("Aprender 3", StatusCode::TOO_MANY_REQUESTS).unwrap_err();
        assert!(err.contains("Muitas tentativas"));
        assert!(err.contains("Aprender 3"));
    }

    #[test]
    fn check_http_status_maps_client_errors() {
        let err = check_http_status("Catálogo UnB", StatusCode::NOT_FOUND).unwrap_err();
        assert!(err.contains("404"));
        assert!(err.contains("Catálogo UnB"));
    }
}
