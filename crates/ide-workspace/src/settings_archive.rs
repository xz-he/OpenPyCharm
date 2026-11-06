use ide_core::{IdeError, IdeResult};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::io::Read;
use std::path::Path;

const MAX_ARCHIVE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_ENTRIES: usize = 2048;

#[derive(Serialize, Deserialize, specta::Type)]
pub struct PyCharmArchive {
    pub files: BTreeMap<String, String>,
    pub skipped: Vec<String>,
}

fn supported(name: &str) -> bool {
    matches!(
        name,
        "options/editor-font.xml"
            | "options/editor.xml"
            | "options/ide.general.xml"
            | "options/ui.lnf.xml"
            | "options/laf.xml"
            | "options/colors.scheme.xml"
            | "options/terminal.xml"
            | "options/terminal-font.xml"
            | "options/keymap.xml"
            | "options/code.style.schemes.xml"
    ) || (name.starts_with("colors/") && name.ends_with(".icls"))
        || (name.starts_with("keymaps/") && name.ends_with(".xml"))
        || (name.starts_with("codestyles/") && name.ends_with(".xml"))
}

pub fn read_pycharm_archive(path: &Path) -> IdeResult<PyCharmArchive> {
    let file = std::fs::File::open(path)?;
    if file.metadata()?.len() > MAX_ARCHIVE_BYTES {
        return Err(IdeError::invalid("Settings archive is too large"));
    }
    let mut archive = zip::ZipArchive::new(file).map_err(|_| IdeError::invalid("Invalid settings ZIP archive"))?;
    if archive.len() > MAX_ENTRIES {
        return Err(IdeError::invalid("Too many files in settings archive"));
    }
    let mut result = PyCharmArchive { files: BTreeMap::new(), skipped: Vec::new() };
    let mut names = BTreeSet::new();
    let mut total = 0_u64;
    let mut marker = false;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|_| IdeError::invalid("Cannot read settings archive entry"))?;
        let name = entry.name().map_err(|_| IdeError::invalid("Invalid settings archive filename"))?.replace('\\', "/");
        if name.starts_with('/') || name.contains(':') || name.split('/').any(|part| part == "..") {
            return Err(IdeError::invalid("Unsafe path in settings archive"));
        }
        if entry.is_dir() {
            continue;
        }
        if !names.insert(name.clone()) {
            return Err(IdeError::invalid("Duplicate file in settings archive"));
        }
        if name == "IntelliJ IDEA Global Settings" {
            marker = true;
            continue;
        }
        total = total.checked_add(entry.size()).ok_or_else(|| IdeError::invalid("Expanded settings archive is too large"))?;
        if entry.size() > MAX_FILE_BYTES || total > MAX_ARCHIVE_BYTES {
            return Err(IdeError::invalid("Expanded settings archive is too large"));
        }
        if !supported(&name) {
            result.skipped.push(name);
            continue;
        }
        let mut content = String::new();
        entry
            .take(MAX_FILE_BYTES + 1)
            .read_to_string(&mut content)
            .map_err(|_| IdeError::invalid("Cannot decode settings file as UTF-8"))?;
        if content.len() as u64 > MAX_FILE_BYTES {
            return Err(IdeError::invalid("Settings file is too large"));
        }
        result.files.insert(name, content);
    }
    if !marker {
        return Err(IdeError::invalid("Not a PyCharm exported settings archive"));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn archive(entries: &[(&str, &str)]) -> tempfile::NamedTempFile {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        let mut writer = zip::ZipWriter::new(&mut file);
        for (name, value) in entries {
            writer.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            writer.write_all(value.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
        file
    }

    #[test]
    fn reads_supported_files_and_reports_others_without_extracting() {
        let file = archive(&[
            ("IntelliJ IDEA Global Settings", ""),
            ("options/editor.xml", "<application/>"),
            ("options/jdk.table.xml", "private interpreter data"),
        ]);
        let result = read_pycharm_archive(file.path()).unwrap();
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.skipped, ["options/jdk.table.xml"]);
    }

    #[test]
    fn rejects_traversal_non_exports_and_oversized_entries() {
        for entries in [
            vec![("IntelliJ IDEA Global Settings", ""), ("../settings.toml", "")],
            vec![("options/editor.xml", "<application/>")],
        ] {
            assert!(read_pycharm_archive(archive(&entries).path()).is_err());
        }
        let large = "x".repeat(MAX_FILE_BYTES as usize + 1);
        assert!(
            read_pycharm_archive(
                archive(&[("IntelliJ IDEA Global Settings", ""), ("options/editor.xml", &large)]).path()
            )
            .is_err()
        );
    }
}
