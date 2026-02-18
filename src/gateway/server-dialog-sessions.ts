import { DialogManager } from "./dialog-manager.js";

export function createDialogSessionTracker() {
  const dialogManager = new DialogManager();
  return { dialogManager };
}
