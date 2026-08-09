use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl CommandError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal", message)
    }

    pub fn usb(operation: &str, error: rusb::Error) -> Self {
        let code = match error {
            rusb::Error::NoDevice => "disconnected",
            rusb::Error::Access => "permission-denied",
            rusb::Error::Busy => "busy",
            rusb::Error::Timeout => "timeout",
            rusb::Error::InvalidParam => "invalid-input",
            _ => "io",
        };
        Self::new(code, format!("{operation}: {error}"))
    }

    pub fn serial(operation: &str, error: serialport::Error, unavailable_code: &str) -> Self {
        use serialport::ErrorKind;
        use std::io::ErrorKind as IoErrorKind;

        let code = match error.kind() {
            ErrorKind::InvalidInput => "invalid-input",
            ErrorKind::NoDevice => unavailable_code,
            ErrorKind::Io(IoErrorKind::PermissionDenied) => "permission-denied",
            ErrorKind::Io(IoErrorKind::TimedOut) => "timeout",
            ErrorKind::Io(IoErrorKind::NotFound)
            | ErrorKind::Io(IoErrorKind::BrokenPipe)
            | ErrorKind::Io(IoErrorKind::ConnectionReset)
            | ErrorKind::Io(IoErrorKind::UnexpectedEof) => "disconnected",
            _ => "io",
        };
        Self::new(code, format!("{operation}: {error}"))
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
