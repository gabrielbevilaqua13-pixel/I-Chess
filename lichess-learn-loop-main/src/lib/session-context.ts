import { createContext, useContext } from "react";
import type { AuthSession } from "./auth";

export const SessionContext = createContext<AuthSession | null>(null);
export const useSession = () => useContext(SessionContext);

export function playerStorageId(owner: string, username: string) {
  return JSON.stringify([owner, username.toLowerCase()]);
}
