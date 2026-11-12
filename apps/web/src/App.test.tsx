import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App Root Component", () => {
  it("renders application header and title", () => {
    render(<App />);
    expect(screen.getByText("Apollo Restaurant OS")).toBeInTheDocument();
    expect(screen.getByText("v0.1.0-alpha")).toBeInTheDocument();
  });
});
