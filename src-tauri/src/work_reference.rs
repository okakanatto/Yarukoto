use std::path::Path;

fn validate_reference(target: &str) -> Result<String, String> {
    if target.chars().any(char::is_control) {
        return Err("資料の場所が正しくありません。".into());
    }
    if target.starts_with("https://") || target.starts_with("http://") {
        let url = tauri::Url::parse(target).map_err(|_| "URLを確認してください。")?;
        if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
            return Err("URLを確認してください。".into());
        }
        return Ok(url.into());
    }
    let bytes = target.as_bytes();
    if bytes.len() < 4 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':'
        || !matches!(bytes[2], b'\\' | b'/') || target[2..].contains(':') {
        return Err("ローカルの資料ファイルを指定してください。".into());
    }
    let path = Path::new(target);
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_lowercase();
    if !matches!(extension.as_str(), "pdf" | "txt" | "md" | "csv" | "tsv" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "ods" | "odp" | "rtf" | "png" | "jpg" | "jpeg" | "gif" | "webp") {
        return Err("この種類のファイルは資料として開けません。".into());
    }
    if !path.is_file() { return Err("資料が見つかりません。保存場所を確認してください。".into()); }
    Ok(target.to_owned())
}

#[tauri::command]
pub fn open_work_reference(target: String) -> Result<(), String> {
    let target = validate_reference(&target)?;
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let wide: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
        let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
        // Open only the explicitly selected document/URL, never a shell command.
        let result = unsafe {
            let com = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            let result = ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), wide.as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) as isize;
            if com >= 0 { CoUninitialize(); }
            result
        };
        if result <= 32 { return Err("資料を開けませんでした。対応するアプリと保存場所を確認してください。".into()); }
        Ok(())
    }
    #[cfg(not(windows))]
    { let _ = target; Err("資料を開く操作はWindows版で利用できます。".into()) }
}

#[cfg(test)]
mod tests {
    use super::validate_reference;
    #[test]
    fn only_explicit_web_references_are_accepted() {
        assert!(validate_reference("https://example.com/notes").is_ok());
        for target in ["javascript:alert(1)", "https://u:p@example.com", "file://server/a.pdf", "C:\\run.exe", "C:\\a.pdf:run.exe", "https://example.com/\n"] {
            assert!(validate_reference(target).is_err(), "{target}");
        }
    }
}
