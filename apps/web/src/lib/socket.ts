import { useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { env } from "./env";
import { useAuthStore } from "../stores/authStore";

let socketInstance: Socket | null = null;
let currentLocationId: string | null = null;
let currentOrgId: string | null = null;

/**
 * Initializes or returns the authenticated singleton Socket.IO connection.
 * Dynamic auth callback supplies the latest access token during handshakes and reconnections.
 */
export function getSocket(orgId?: string, locationId?: string): Socket {
  if (!socketInstance) {
    const socketUrl = env.VITE_API_URL || window.location.origin;

    socketInstance = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: (cb) => {
        const token = useAuthStore.getState().accessToken;
        cb({ token: token || undefined });
      },
    });

    socketInstance.on("connect", () => {
      if (currentOrgId && currentLocationId) {
        socketInstance?.emit("join-location", {
          orgId: currentOrgId,
          locationId: currentLocationId,
        });
      }
    });

    socketInstance.on("connect_error", (err) => {
      console.warn("[Socket.IO] Connection error:", err.message);
    });

    socketInstance.on("error", (err: { message?: string }) => {
      console.warn("[Socket.IO] Server error:", err?.message || err);
    });
  }

  // Ensure current auth token is up to date on every access
  const token = useAuthStore.getState().accessToken;
  socketInstance.auth = { token: token || undefined };

  if (!socketInstance.connected && token) {
    socketInstance.connect();
  }

  // Handle switching organization or location room
  if (orgId && locationId && (currentOrgId !== orgId || currentLocationId !== locationId)) {
    if (currentOrgId && currentLocationId && socketInstance.connected) {
      socketInstance.emit("leave-location", {
        orgId: currentOrgId,
        locationId: currentLocationId,
      });
    }
    currentOrgId = orgId;
    currentLocationId = locationId;

    if (socketInstance.connected) {
      socketInstance.emit("join-location", { orgId, locationId });
    }
  }

  return socketInstance;
}

/**
 * Disconnects and destroys the socket instance (e.g. on logout).
 */
export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    currentLocationId = null;
    currentOrgId = null;
  }
}

/**
 * React hook to subscribe to real-time order and KDS events.
 */
export function useOrderSocket(
  locationId?: string,
  callbacks?: {
    onOrderCreated?: (order: any) => void;
    onOrderUpdated?: (order: any) => void;
    onOrderSubmitted?: (order: any) => void;
    onOrderStatusChanged?: (order: any) => void;
    onOrderCancelled?: (order: any) => void;
  },
) {
  const currentOrgIdFromStore = useAuthStore((s) => s.currentOrgId);

  useEffect(() => {
    if (!currentOrgIdFromStore || !locationId) return;

    const socket = getSocket(currentOrgIdFromStore, locationId);

    const handleCreated = (order: any) => callbacks?.onOrderCreated?.(order);
    const handleUpdated = (order: any) => callbacks?.onOrderUpdated?.(order);
    const handleSubmitted = (order: any) => callbacks?.onOrderSubmitted?.(order);
    const handleStatusChanged = (order: any) => callbacks?.onOrderStatusChanged?.(order);
    const handleCancelled = (order: any) => callbacks?.onOrderCancelled?.(order);

    socket.on("order:created", handleCreated);
    socket.on("order:updated", handleUpdated);
    socket.on("order:submitted", handleSubmitted);
    socket.on("order:status_changed", handleStatusChanged);
    socket.on("order:cancelled", handleCancelled);

    return () => {
      socket.off("order:created", handleCreated);
      socket.off("order:updated", handleUpdated);
      socket.off("order:submitted", handleSubmitted);
      socket.off("order:status_changed", handleStatusChanged);
      socket.off("order:cancelled", handleCancelled);
    };
  }, [currentOrgIdFromStore, locationId, callbacks]);
}
