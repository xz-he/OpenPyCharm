import { useState } from "react";
import { create } from "zustand";
import { call, commands } from "@/platform/ipc";
import { tx } from "@/platform/i18n";
import { useProject } from "@/platform/project";
import { Dialog, T } from "@/ui";
import { notifications } from "@/workbench/contributions";
import { planPyCharmSettings, type PyCharmSettingsPlan } from "./pycharmSettings";
import styles from "./app.module.css";

const useImport = create<{ plan: PyCharmSettingsPlan | null }>(() => ({ plan: null }));

export async function previewPyCharmImport(path: string) {
  const archive = await call(commands.settingsReadPycharm(path));
  useImport.setState({ plan: planPyCharmSettings(archive) });
}

export function PyCharmImportOverlay() {
  const plan = useImport((state) => state.plan);
  return plan ? <PyCharmImportDialog plan={plan} onClose={() => useImport.setState({ plan: null })} /> : null;
}

function PyCharmImportDialog({ plan, onClose }: { plan: PyCharmSettingsPlan; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<string | null>(null);
  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await call(commands.settingsImportPycharm(JSON.stringify(plan.patch)));
      useProject.setState({ settings: result.settings });
      setBackup(result.backup ?? "");
      notifications().notify({
        level: "info",
        title: "PyCharm settings imported",
        body: "Compatible settings have been merged. A backup of the previous settings is available in the import dialog.",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      title="Import PyCharm Settings"
      width={620}
      onClose={() => {
        if (!busy) onClose();
      }}
      buttons={
        backup !== null
          ? [{ label: "Close", role: "default", onClick: onClose }]
          : [
              {
                label: busy ? "Importing…" : "Import",
                role: "default",
                disabled: busy || !Object.keys(plan.patch).length,
                onClick: () => void apply(),
              },
              { label: "Cancel", role: "cancel", disabled: busy },
            ]
      }
    >
      <div className={styles.pycharmImport}>
        <p>
          <T>
            Only compatible settings are merged. Other OpenPyCharm settings stay as they are. A backup is saved before
            applying changes.
          </T>
        </p>
        <h3>
          <T>{backup !== null ? "Imported settings" : "Settings to import"}</T>
        </h3>
        {plan.groups.length ? (
          <ul>
            {plan.groups.map((group) => (
              <li key={group}>{tx(group)}</li>
            ))}
          </ul>
        ) : (
          <p>
            <T>No compatible settings found in this archive.</T>
          </p>
        )}
        <p>
          <T>
            PyCharm plugins, accounts, trusted paths, remote connections and interpreter registrations are not imported.
            Configure interpreters separately in Settings.
          </T>
        </p>
        {plan.skipped.length > 0 && (
          <details>
            <summary>
              <T>Unsupported or unmapped entries</T> ({plan.skipped.length})
            </summary>
            <ul className={styles.pycharmSkipped}>
              {plan.skipped.map((item, index) => (
                <li key={`${index}:${item}`}>{item}</li>
              ))}
            </ul>
          </details>
        )}
        {backup !== null && (
          <div role="status">
            <p>
              <T>PyCharm settings imported</T>
            </p>
            <p>
              <T>Previous settings backup:</T>
            </p>
            <code>{backup}</code>
            <p>
              <T>Project-specific settings may override imported global settings.</T>
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className={styles.newProjectError}>
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
