import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Clerk
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("test-token") }),
}));

// Mock useSSEStream
const mockStartStream = vi.fn();
const mockStopStream = vi.fn();
vi.mock("@/hooks/useSSEStream", () => ({
  useSSEStream: () => ({
    isStreaming: false,
    error: null,
    startStream: mockStartStream,
    stopStream: mockStopStream,
  }),
}));

import WorkflowStatus from "../WorkflowStatus";

describe("WorkflowStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders workflow name in header", () => {
    render(
      <WorkflowStatus
        workflowId="wf-1"
        workflowName="Daily Lead Check"
      />
    );
    expect(screen.getByText(/Daily Lead Check/)).toBeInTheDocument();
  });

  it("shows Running label for non-dry-run", () => {
    render(
      <WorkflowStatus
        workflowId="wf-1"
        workflowName="Lead Check"
      />
    );
    expect(screen.getByText(/Running/)).toBeInTheDocument();
  });

  it("shows Dry Run label for dry run", () => {
    render(
      <WorkflowStatus
        workflowId="wf-1"
        workflowName="Lead Check"
        isDryRun
      />
    );
    expect(screen.getByText(/Dry Run/)).toBeInTheDocument();
  });

  it("calls startStream on mount with correct URL", async () => {
    render(
      <WorkflowStatus
        workflowId="wf-123"
        workflowName="Test"
      />
    );
    await waitFor(() => {
      expect(mockStartStream).toHaveBeenCalledOnce();
    });
    expect(mockStartStream.mock.calls[0][1]).toBe("/api/workflows/wf-123/run");
  });

  it("uses dry-run URL when isDryRun is true", async () => {
    render(
      <WorkflowStatus
        workflowId="wf-123"
        workflowName="Test"
        isDryRun
      />
    );
    await waitFor(() => {
      expect(mockStartStream).toHaveBeenCalledOnce();
    });
    expect(mockStartStream.mock.calls[0][1]).toBe("/api/workflows/wf-123/dry-run");
  });

  it("shows Dismiss button when not streaming and onClose provided", () => {
    render(
      <WorkflowStatus
        workflowId="wf-1"
        workflowName="Test"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("calls stopStream on unmount", () => {
    const { unmount } = render(
      <WorkflowStatus
        workflowId="wf-1"
        workflowName="Test"
      />
    );
    unmount();
    expect(mockStopStream).toHaveBeenCalled();
  });
});
