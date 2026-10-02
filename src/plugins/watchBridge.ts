import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

/** ממשק מול ios/App/App/WatchBridge.swift - קיים רק בבנייה הנייטיבית של iOS */
export interface WatchBridgePlugin {
  /** שולח לשעון את מצב האימון (JSON) */
  sendState(options: { state: string }): Promise<void>;
  /** מחזיר ומנקה את הפקודות שהגיעו מהשעון (כל אחת JSON) */
  takePendingCommands(): Promise<{ commands: string[] }>;
  addListener(eventName: 'commandsAvailable', listener: () => void): Promise<PluginListenerHandle>;
}

export const WatchBridge = registerPlugin<WatchBridgePlugin>('WatchBridge');
