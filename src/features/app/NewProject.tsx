import { useEffect, useState } from "react";
import { create } from "zustand";
import { call, commands, isTauri } from "@/platform/ipc";
import { useProject } from "@/platform/project";
import { useTxTemplate } from "@/platform/i18n";
import { Button, Checkbox, Dialog, Input, Select, T } from "@/ui";
import { defaultProjectDirectory, openProjectInWindow } from "./windows";
import { createPythonEnvironment, scaffoldPythonProject } from "./pythonProject";
import styles from "./app.module.css";

const useNewProject = create<{ open: boolean }>(() => ({ open: false }));
export const showNewProject = () => useNewProject.setState({ open: true });

export function NewProjectOverlay() {
  const open = useNewProject((s) => s.open);
  return open ? <NewProjectDialog onClose={() => useNewProject.setState({ open: false })} /> : null;
}

/** Why `name` cannot be a project folder name, or null. */
export function projectNameError(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter a project name";
  if (/[/\\:*?"<>|]/.test(n) || n === "." || n === "..")
    return "The name contains characters a folder name cannot have";
  return null;
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name.trim()}` : `${dir}${sep}${name.trim()}`;
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Creates `path` (or reuses it when it is an empty folder) and runs `git init` when asked. */
export async function createProjectFolder(path: string, gitInit: boolean): Promise<void> {
  let entries: unknown[] | null;
  try {
    entries = await call(commands.fsReadDir(path));
  } catch {
    entries = null;
  }
  if (entries && entries.length) throw new Error(`${path} already exists and is not empty`);
  if (!entries) await call(commands.fsCreateDir(path));
  if (gitInit) await call(commands.vcsInit(path));
}

/** Default Project Directory, else the parent of the open project. */
function initialLocation(): string {
  const preset = defaultProjectDirectory();
  if (preset) return preset;
  const root = useProject.getState().project?.root;
  return root ? root.slice(0, Math.max(root.lastIndexOf("/"), 1)) : "";
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("untitled");
  const [location, setLocation] = useState(initialLocation);
  const [git, setGit] = useState(true);
  const [template, setTemplate] = useState("python");
  const [venv, setVenv] = useState(true);
  const [interpreter, setInterpreter] = useState("python");
  const [createdPath, setCreatedPath] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const txTemplate = useTxTemplate();

  useEffect(() => {
    if (initialLocation()) return;
    // Otherwise the user's home.
    void import("@tauri-apps/api/path")
      .then((p) => p.homeDir())
      .then(setLocation)
      .catch(() => {});
  }, []);

  const nameError = projectNameError(name);
  const invalid = !!nameError || !location.trim() || (template === "python" && venv && !interpreter.trim());
  const locked = busy || createdPath !== null;
  const path = location.trim() && !nameError ? joinPath(location.trim(), name) : "";

  const browse = async () => {
    if (!isTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Project Location",
      defaultPath: location || undefined,
    });
    const dir = Array.isArray(picked) ? picked[0] : picked;
    if (dir) setLocation(dir);
  };

  const create = async () => {
    if (invalid || locked || !isTauri()) return;
    setBusy(true);
    setError(null);
    try {
      await createProjectFolder(path, git);
      setCreatedPath(path);
      if (template === "python") {
        await scaffoldPythonProject(path, name);
        if (venv) {
          setProgress("Creating virtual environment…");
          await createPythonEnvironment(interpreter, path, setProgress);
        }
      }
    } catch (e) {
      setBusy(false);
      setError(errorText(e));
      return;
    }
    onClose();
    await openProjectInWindow(path, useProject.getState().project !== null);
  };

  return (
    <Dialog
      open
      title="New Project"
      onClose={() => {
        if (!busy) onClose();
      }}
      width={520}
      buttons={[
        { label: "Create", role: "default", disabled: invalid || locked || !isTauri(), onClick: () => void create() },
        ...(createdPath && !busy
          ? [
              {
                label: "Open project",
                role: "extra" as const,
                onClick: () => {
                  onClose();
                  void openProjectInWindow(createdPath, useProject.getState().project !== null);
                },
              },
            ]
          : []),
        { label: "Cancel", role: "cancel", disabled: busy },
      ]}
    >
      <form
        className={styles.newProject}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label className={styles.newProjectRow}>
          <span className={styles.newProjectLabel}>
            <T>Name:</T>
          </span>
          <Input
            data-autofocus
            disabled={locked}
            value={name}
            invalid={!!nameError}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
          />
        </label>
        <div className={styles.newProjectRow}>
          <span className={styles.newProjectLabel}>
            <T>Location:</T>
          </span>
          <Input
            disabled={locked}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            aria-label="Location"
          />
          <Button onClick={() => void browse()} disabled={locked || !isTauri()}>
            <T>Browse…</T>
          </Button>
        </div>
        <div className={styles.newProjectHint}>
          {nameError ? txTemplate(nameError) : path && txTemplate(`Project will be created in: ${path}`)}
        </div>
        <div className={styles.newProjectRow}>
          <span className={styles.newProjectLabel}>
            <T>Template:</T>
          </span>
          <Select
            value={template}
            onChange={setTemplate}
            disabled={locked}
            aria-label="Project template"
            options={[
              { value: "python", label: "Python application" },
              { value: "empty", label: "Empty project" },
            ]}
          />
        </div>
        {template === "python" && (
          <>
            <Checkbox
              checked={venv}
              onChange={setVenv}
              disabled={locked}
              label="Create a project virtual environment (.venv)"
            />
            {venv && (
              <div className={styles.newProjectRow}>
                <span className={styles.newProjectLabel}>
                  <T>Python:</T>
                </span>
                <Input
                  value={interpreter}
                  onChange={(event) => setInterpreter(event.target.value)}
                  disabled={locked}
                  aria-label="Base Python interpreter"
                />
              </div>
            )}
            <div className={styles.newProjectHint}>
              <T>Use Python 3.10 or newer. Development tool installation commands are included in README.md.</T>
            </div>
          </>
        )}
        <Checkbox checked={git} onChange={setGit} disabled={locked} label="Create Git repository" />
        {busy && (
          <div className={styles.newProjectHint} role="status">
            {txTemplate(progress)}
          </div>
        )}
        {createdPath && error && (
          <div className={styles.newProjectHint}>
            <T>The project folder was created. Open it to finish setup or inspect the files.</T>
          </div>
        )}
        {error && <div className={styles.newProjectError}>{txTemplate(error)}</div>}
      </form>
    </Dialog>
  );
}
