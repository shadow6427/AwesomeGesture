use std::fmt;
use std::str::FromStr;

use thiserror::Error;

pub const LOG_FORMAT_ENV: &str = "TOT_LOG_FORMAT";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    Text,
    Json,
}

#[derive(Debug, Error, PartialEq, Eq)]
#[error("invalid {env_var} value {value:?}; expected one of: text, json")]
pub struct LogFormatParseError {
    pub env_var: &'static str,
    pub value: String,
}

impl Default for LogFormat {
    fn default() -> Self {
        Self::Text
    }
}

impl fmt::Display for LogFormat {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Text => formatter.write_str("text"),
            Self::Json => formatter.write_str("json"),
        }
    }
}

impl FromStr for LogFormat {
    type Err = LogFormatParseError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "" | "text" => Ok(Self::Text),
            "json" => Ok(Self::Json),
            _ => Err(LogFormatParseError {
                env_var: LOG_FORMAT_ENV,
                value: value.to_string(),
            }),
        }
    }
}

pub fn log_format_from_env() -> Result<LogFormat, LogFormatParseError> {
    match std::env::var(LOG_FORMAT_ENV) {
        Ok(value) => value.parse(),
        Err(std::env::VarError::NotPresent) => Ok(LogFormat::default()),
        Err(std::env::VarError::NotUnicode(value)) => Err(LogFormatParseError {
            env_var: LOG_FORMAT_ENV,
            value: value.to_string_lossy().into_owned(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::{LogFormat, LogFormatParseError, LOG_FORMAT_ENV};

    #[test]
    fn parses_supported_log_formats() {
        assert_eq!(LogFormat::Text, "text".parse().unwrap());
        assert_eq!(LogFormat::Text, " TEXT ".parse().unwrap());
        assert_eq!(LogFormat::Json, "json".parse().unwrap());
        assert_eq!(LogFormat::Json, "JSON".parse().unwrap());
    }

    #[test]
    fn defaults_blank_log_format_to_text() {
        assert_eq!(LogFormat::Text, "".parse().unwrap());
        assert_eq!(LogFormat::Text, "   ".parse().unwrap());
    }

    #[test]
    fn rejects_unknown_log_format_values() {
        let error: LogFormatParseError = "pretty".parse::<LogFormat>().unwrap_err();
        assert_eq!(LOG_FORMAT_ENV, error.env_var);
        assert_eq!("pretty", error.value);
        assert_eq!(
            "invalid TOT_LOG_FORMAT value \"pretty\"; expected one of: text, json",
            error.to_string()
        );
    }

    #[test]
    fn displays_log_formats() {
        assert_eq!("text", LogFormat::Text.to_string());
        assert_eq!("json", LogFormat::Json.to_string());
    }
}
