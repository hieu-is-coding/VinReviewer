import { describe, it, expect } from "vitest";
import "@/test/mocks/supabase";
import { render, screen } from "@/test/test-utils";
import App from "@/App";

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(document.body).toBeTruthy();
  });
});
