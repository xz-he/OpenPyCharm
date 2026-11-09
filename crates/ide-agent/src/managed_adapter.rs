use crate::provider::{Driver, ProviderSpec};
use ide_core::{IdeError, IdeResult};
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const PACKAGE: &str = "@agentclientprotocol/codex-acp";
const VERSION: &str = "2.3.0";
const INSTALL_TIMEOUT: Duration = Duration::from_secs(300);

fn executable(dir: &Path) -> PathBuf {
    dir.join("node_modules/.bin").join(if cfg!(windows) { "codex-acp.cmd" } else { "codex-acp" })
}

fn ready(dir: &Path) -> bool {
    let manifest = fs::read(dir.join("node_modules").join(PACKAGE).join("package.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    dir.join(".ready").is_file()
        && executable(dir).is_file()
        && manifest.is_some_and(|value| value["name"] == PACKAGE && value["version"] == VERSION)
}

pub(crate) fn applies(spec: &ProviderSpec) -> bool {
    spec.id == "codex-acp"
        && spec.driver == Driver::Acp
        && spec.command == "npx"
        && spec.args == ["-y", "@agentclientprotocol/codex-acp@2.3.0"]
}

pub(crate) fn prepare(mut spec: ProviderSpec, root: &Path) -> IdeResult<ProviderSpec> {
    if !applies(&spec) {
        return Ok(spec);
    }
    let dir = ensure(root, |dir| {
        let npm =
            which::which("npm").map_err(|_| IdeError::unavailable("Install Node.js and npm to set up Codex (ACP)."))?;
        which::which("node").map_err(|_| IdeError::unavailable("Install Node.js to set up Codex (ACP)."))?;
        let mut command = Command::new(npm);
        command
            .envs(spec.env.iter().cloned())
            .args(["install", "--prefix"])
            .arg(dir)
            .arg("--cache")
            .arg(root.join("npm-cache"))
            .args(["--no-audit", "--no-fund", "--package-lock=false", "--save-exact"])
            .arg(format!("{PACKAGE}@{VERSION}"))
            .current_dir(dir);
        ide_core::process::own_group(&mut command);
        match ide_tools::run_quiet(command, INSTALL_TIMEOUT) {
            Some((true, _)) => Ok(()),
            Some((false, output)) => {
                let tail =
                    output.lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
                Err(IdeError::unavailable(format!(
                    "Codex (ACP) installation failed. Check Node.js, npm and network access, then retry.\n{tail}"
                )))
            }
            None => Err(IdeError::unavailable(
                "Codex (ACP) installation could not finish within 5 minutes. Check Node.js and network access, then retry.",
            )),
        }
    })?;
    spec.command = executable(&dir).to_string_lossy().into_owned();
    spec.args.clear();
    Ok(spec)
}

fn ensure(root: &Path, install: impl FnOnce(&Path) -> IdeResult<()>) -> IdeResult<PathBuf> {
    fs::create_dir_all(root)?;
    let lock =
        OpenOptions::new().create(true).truncate(false).read(true).write(true).open(root.join("install.lock"))?;
    let started = Instant::now();
    loop {
        match lock.try_lock() {
            Ok(()) => break,
            Err(std::fs::TryLockError::WouldBlock) if started.elapsed() < INSTALL_TIMEOUT => {
                std::thread::sleep(Duration::from_millis(100))
            }
            Err(error) => {
                return Err(IdeError::unavailable(format!("Could not lock the Codex (ACP) installer: {error}")));
            }
        }
    }
    let dir = root.join(VERSION);
    if ready(&dir) {
        return Ok(dir);
    }
    let staging = root.join(format!("install-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&staging)?;
    let result = (|| {
        install(&staging)?;
        fs::write(staging.join(".ready"), VERSION)?;
        if !ready(&staging) {
            return Err(IdeError::unavailable("Codex (ACP) installation is incomplete. Retry to reinstall."));
        }
        if dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        fs::rename(&staging, &dir)?;
        Ok(dir)
    })();
    if staging.exists() {
        let _ = fs::remove_dir_all(staging);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn install_fixture(dir: &Path) -> IdeResult<()> {
        let manifest = dir.join("node_modules").join(PACKAGE).join("package.json");
        fs::create_dir_all(manifest.parent().unwrap())?;
        fs::write(manifest, serde_json::json!({"name": PACKAGE, "version": VERSION}).to_string())?;
        let bin = executable(dir);
        fs::create_dir_all(bin.parent().unwrap())?;
        fs::write(bin, "adapter")?;
        Ok(())
    }

    #[test]
    fn installs_reuses_and_repairs_missing_files() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("user tools");
        let dir = ensure(&root, install_fixture).unwrap();
        assert!(ready(&dir));
        assert_eq!(ensure(&root, |_| panic!("must reuse")).unwrap(), dir);
        fs::remove_file(executable(&dir)).unwrap();
        assert_eq!(ensure(&root, install_fixture).unwrap(), dir);
        assert!(ready(&dir));
    }

    #[test]
    fn failed_install_can_be_retried() {
        let temp = tempfile::tempdir().unwrap();
        assert!(ensure(temp.path(), |_| Err(IdeError::unavailable("offline"))).is_err());
        assert!(!temp.path().join(VERSION).exists());
        assert!(ensure(temp.path(), |_| Ok(())).is_err());
        assert!(ensure(temp.path(), install_fixture).is_ok());
    }

    #[test]
    fn preserves_custom_launch_commands() {
        let mut spec = crate::provider::builtin_spec("codex-acp").unwrap();
        assert!(applies(&spec));
        spec.command = "custom-adapter".into();
        assert!(!applies(&spec));
    }

    #[test]
    fn concurrent_requests_install_once() {
        let temp = tempfile::tempdir().unwrap();
        let count = std::sync::atomic::AtomicUsize::new(0);
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..4)
                .map(|_| {
                    scope.spawn(|| {
                        ensure(temp.path(), |dir| {
                            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                            install_fixture(dir)
                        })
                        .unwrap()
                    })
                })
                .collect();
            for handle in handles {
                assert!(ready(&handle.join().unwrap()));
            }
        });
        assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "downloads the pinned npm adapter"]
    async fn real_npm_install() {
        let temp = tempfile::tempdir().unwrap();
        let spec = crate::provider::builtin_spec("codex-acp").unwrap();
        let root = temp.path().join("managed adapter");
        let prepared = tokio::task::spawn_blocking(move || prepare(spec, &root)).await.unwrap().unwrap();
        assert!(Path::new(&prepared.command).is_file());
        assert!(prepared.args.is_empty());
        assert_eq!(
            prepare(crate::provider::builtin_spec("codex-acp").unwrap(), &temp.path().join("managed adapter"))
                .unwrap()
                .command,
            prepared.command
        );
        let peer = ide_jsonrpc::Peer::spawn_framed(
            &prepared.command,
            &prepared.args,
            temp.path(),
            &prepared.env,
            std::sync::Arc::new(ide_jsonrpc::NoopHandler),
            Box::new(|line| eprintln!("{line}")),
            ide_jsonrpc::Framing::Lines,
        )
        .unwrap();
        let result = tokio::time::timeout(
            Duration::from_secs(30),
            peer.request::<_, serde_json::Value>(
                "initialize",
                crate::acp::initialize_params(&crate::client_info()),
                None,
            ),
        )
        .await;
        peer.kill();
        assert!(result.unwrap().unwrap().get("protocolVersion").is_some());
    }
}
