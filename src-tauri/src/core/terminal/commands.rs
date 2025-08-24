use super::manager::TerminalManager;
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
pub async fn terminal_spawn<R: Runtime>(
    app_handle: AppHandle<R>,
    state: State<'_, TerminalManager>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    state
        .spawn_terminal(app_handle, shell, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, TerminalManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state
        .write_to_terminal(&session_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, TerminalManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .resize_terminal(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn terminal_kill(
    state: State<'_, TerminalManager>,
    session_id: String,
) -> Result<(), String> {
    state
        .kill_terminal(&session_id)
        .map_err(|e| e.to_string())
}
