use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine as _};
use parking_lot::RwLock;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use tauri::{AppHandle, Emitter, Runtime};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalOutputEvent {
    pub session_id: String,
    pub data: String, // UTF-8 text
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalExitEvent {
    pub session_id: String,
    pub exit_status: Option<i32>,
}

pub struct TerminalSession {
    pub id: String,
    pub child: Box<dyn Child + Send + Sync>,
    pub reader_handle: Option<JoinHandle<()>>,
    pub writer: Arc<parking_lot::Mutex<Box<dyn Write + Send>>>,
    pub pty_master: Arc<parking_lot::Mutex<Box<dyn MasterPty + Send>>>,
}

impl TerminalSession {
    pub fn new<R: Runtime>(
        app_handle: AppHandle<R>,
        shell: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<Self> {
        let session_id = Uuid::new_v4().to_string();
        
        // Get PTY system
        let pty_system = native_pty_system();

        // Set initial PTY size
        let pty_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        // Create PTY pair
        let pty_pair = pty_system
            .openpty(pty_size)
            .map_err(|e| anyhow!("Failed to create PTY: {}", e))?;

        // Determine shell command
        let (shell_cmd, shell_args) = get_shell_command(shell)?;

        // Create command builder
        let mut cmd = CommandBuilder::new(&shell_cmd);
        cmd.args(&shell_args);
        
        // Set environment variables for proper terminal behavior
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        
        // Set locale and encoding to UTF-8
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("LC_ALL", "en_US.UTF-8");
        cmd.env("LC_CTYPE", "en_US.UTF-8");
        
        // Preserve PATH and other important env vars
        if let Ok(path) = env::var("PATH") {
            cmd.env("PATH", path);
        }
        if let Ok(home) = env::var("HOME") {
            cmd.env("HOME", home);
        }
        if let Ok(user) = env::var("USER") {
            cmd.env("USER", user);
        }

        // Spawn child process
        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| anyhow!("Failed to spawn shell: {}", e))?;

        // Get reader from PTY master
        let reader = pty_pair.master.try_clone_reader()
            .map_err(|e| anyhow!("Failed to clone PTY reader: {}", e))?;

        // Store the PTY master for resizing
        let pty_master = Arc::new(parking_lot::Mutex::new(pty_pair.master));
        
        // Get writer from PTY master clone and wrap in Arc<Mutex>
        let writer = {
            let master = pty_master.lock();
            let writer = master.take_writer()
                .map_err(|e| anyhow!("Failed to get PTY writer: {}", e))?;
            Arc::new(parking_lot::Mutex::new(writer))
        };

        // Spawn reader thread
        let reader_session_id = session_id.clone();
        let reader_app_handle = app_handle.clone();
        let reader_handle = thread::spawn(move || {
            let mut reader = reader; // Use the reader directly
            let mut buffer = [0u8; 4096]; // Fixed size buffer
            
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        // EOF reached, process has exited
                        log::info!("Terminal reader: EOF reached for session {}", reader_session_id);
                        break;
                    }
                    Ok(n) => {
                        // Only take the bytes that were actually read
                        let data = &buffer[..n];
                        
                        // Convert raw bytes to a proper UTF-8 string, replacing invalid sequences
                        let text_data = String::from_utf8_lossy(data);
                        
                        // Emit terminal output event with raw UTF-8 text
                        let event = TerminalOutputEvent {
                            session_id: reader_session_id.clone(),
                            data: text_data.to_string(),
                        };
                        
                        if let Err(e) = reader_app_handle.emit("terminal-output", &event) {
                            log::error!("Failed to emit terminal output: {}", e);
                        } else {
                            log::debug!("Emitted {} bytes for session {} as UTF-8 text", n, reader_session_id);
                        }
                    }
                    Err(e) => {
                        log::error!("Error reading from PTY: {}", e);
                        break;
                    }
                }
            }

            // Emit terminal exit event
            let exit_event = TerminalExitEvent {
                session_id: reader_session_id.clone(),
                exit_status: None, // We'll improve this later
            };
            
            if let Err(e) = reader_app_handle.emit("terminal-exit", &exit_event) {
                log::error!("Failed to emit terminal exit: {}", e);
            }
        });

        Ok(TerminalSession {
            id: session_id,
            child,
            reader_handle: Some(reader_handle),
            writer,
            pty_master,
        })
    }

    pub fn write_data(&mut self, data: &str) -> Result<()> {
        let mut writer = self.writer.lock();
        writer.write_all(data.as_bytes())
            .map_err(|e| anyhow!("Failed to write to PTY: {}", e))?;
        writer.flush()
            .map_err(|e| anyhow!("Failed to flush PTY writer: {}", e))?;
        Ok(())
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<()> {
        let mut master = self.pty_master.lock();
        let new_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        
        master.resize(new_size)
            .map_err(|e| anyhow!("Failed to resize PTY: {}", e))?;
        
        log::debug!("Resized terminal {} to {}x{}", self.id, cols, rows);
        Ok(())
    }

    pub fn kill(&mut self) -> Result<()> {
        // Kill the child process
        self.child.kill().map_err(|e| anyhow!("Failed to kill child process: {}", e))?;
        
        // Wait for reader thread to finish
        if let Some(handle) = self.reader_handle.take() {
            let _ = handle.join();
        }
        
        Ok(())
    }
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Arc<RwLock<HashMap<String, TerminalSession>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn spawn_terminal<R: Runtime>(
        &self,
        app_handle: AppHandle<R>,
        shell: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<String> {
        let session = TerminalSession::new(app_handle, shell, cols, rows)?;
        let session_id = session.id.clone();
        
        self.sessions.write().insert(session_id.clone(), session);
        
        Ok(session_id)
    }

    pub fn write_to_terminal(&self, session_id: &str, data: &str) -> Result<()> {
        let mut sessions = self.sessions.write();
        if let Some(session) = sessions.get_mut(session_id) {
            session.write_data(data)
        } else {
            Err(anyhow!("Terminal session not found: {}", session_id))
        }
    }

    pub fn resize_terminal(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let mut sessions = self.sessions.write();
        if let Some(session) = sessions.get_mut(session_id) {
            session.resize(cols, rows)
        } else {
            Err(anyhow!("Terminal session not found: {}", session_id))
        }
    }

    pub fn kill_terminal(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write();
        if let Some(mut session) = sessions.remove(session_id) {
            session.kill()
        } else {
            Err(anyhow!("Terminal session not found: {}", session_id))
        }
    }
}

fn get_shell_command(shell_override: Option<String>) -> Result<(String, Vec<String>)> {
    if let Some(shell) = shell_override {
        return Ok((shell, vec![]));
    }

    // Platform-specific shell detection
    #[cfg(target_os = "windows")]
    {
        // Default to PowerShell on Windows
        Ok(("powershell.exe".to_string(), vec!["-NoLogo".to_string(), "-NoExit".to_string()]))
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Unix-like systems (macOS, Linux)
        if let Ok(shell) = env::var("SHELL") {
            // Use login shell
            Ok((shell.clone(), vec!["-l".to_string()]))
        } else {
            // Fallback to bash
            Ok(("/bin/bash".to_string(), vec!["-l".to_string()]))
        }
    }
}
