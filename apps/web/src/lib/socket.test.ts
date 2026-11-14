import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOrderSocket, disconnectSocket } from "./socket";
import { useAuthStore } from "../stores/authStore";

const mockSocketOn = vi.fn();
const mockSocketOff = vi.fn();
const mockSocketEmit = vi.fn();
const mockIoOn = vi.fn();
const mockIoOff = vi.fn();

let mockConnected = false;

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: mockSocketOn,
    off: mockSocketOff,
    emit: mockSocketEmit,
    connect: vi.fn(),
    disconnect: vi.fn(),
    get connected() {
      return mockConnected;
    },
    io: {
      on: mockIoOn,
      off: mockIoOff,
    },
  })),
}));

describe("useOrderSocket & Socket Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnected = false;
    disconnectSocket();
    useAuthStore.setState({
      currentOrgId: "org-test-1",
      accessToken: "mock-token",
    });
  });

  it("10. Repeated reconnections do not create duplicate listeners", () => {
    const onReconnect = vi.fn();
    const onOrderSubmitted = vi.fn();

    // Render the hook
    const { rerender, unmount } = renderHook(
      ({ locId }) =>
        useOrderSocket(locId, {
          onReconnect,
          onOrderSubmitted,
        }),
      { initialProps: { locId: "loc-test-1" } },
    );

    // Initial mount attaches event listeners
    const initialSubmittedListenerCount = mockSocketOn.mock.calls.filter(
      (c) => c[0] === "order:submitted",
    ).length;
    expect(initialSubmittedListenerCount).toBe(1);

    const initialConnectListenerCount = mockSocketOn.mock.calls.filter(
      (c) => c[0] === "connect",
    ).length;
    // 1 from getSocket singleton room joiner + 1 from useOrderSocket
    expect(initialConnectListenerCount).toBe(2);

    // Re-render multiple times with new callback objects (simulating parent component renders)
    rerender({ locId: "loc-test-1" });
    rerender({ locId: "loc-test-1" });
    rerender({ locId: "loc-test-1" });

    // Verify listeners were NOT duplicated across re-renders
    const postRerenderSubmittedCount = mockSocketOn.mock.calls.filter(
      (c) => c[0] === "order:submitted",
    ).length;
    expect(postRerenderSubmittedCount).toBe(initialSubmittedListenerCount);

    const postRerenderConnectCount = mockSocketOn.mock.calls.filter(
      (c) => c[0] === "connect",
    ).length;
    expect(postRerenderConnectCount).toBe(initialConnectListenerCount);

    // Find the registered connect handler from useOrderSocket
    const connectHandlers = mockSocketOn.mock.calls
      .filter((c) => c[0] === "connect")
      .map((c) => c[1]);
    expect(connectHandlers.length).toBe(2);

    // The second handler is useOrderSocket's handleConnect
    const useOrderSocketConnectHandler = connectHandlers[1];

    // First connect
    useOrderSocketConnectHandler();

    // Simulate 3 reconnect cycles
    useOrderSocketConnectHandler();
    useOrderSocketConnectHandler();
    useOrderSocketConnectHandler();

    expect(onReconnect).toHaveBeenCalledTimes(3);

    // Unmount cleans up all listeners
    unmount();
    expect(mockSocketOff).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(mockSocketOff).toHaveBeenCalledWith(
      "order:submitted",
      expect.any(Function),
    );
  });
});
