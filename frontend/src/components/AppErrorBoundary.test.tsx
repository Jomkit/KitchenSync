import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppErrorBoundary } from "./AppErrorBoundary";

function ThrowOnRender(): JSX.Element {
  throw new Error("boom");
}

describe("AppErrorBoundary", () => {
  it("renders crashed fallback page when child throws", () => {
    render(
      <AppErrorBoundary>
        <ThrowOnRender />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
  });
});
