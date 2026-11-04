// Port opened by the panel page while it is alive. The panel posts its
// visibility so the background knows whether a panel is really on screen.
export const PANEL_PORT = 'answeronce:panel';

export type PanelVisibility = { state: DocumentVisibilityState; width: number; height: number };
