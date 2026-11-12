import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { LoginPage } from "./LoginPage";

describe("LoginPage Component", () => {
  it("renders login form with email and password fields", () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    expect(screen.getByText("Sign In to Terminal")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("manager@bistroalpha.com"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••••••")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /authenticate/i }),
    ).toBeInTheDocument();
  });

  it("shows validation error when submitted empty", async () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /authenticate/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Please enter a valid email address"),
      ).toBeInTheDocument();
    });
  });
});
