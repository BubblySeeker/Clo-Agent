import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Polyfill scrollIntoView for jsdom
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock Clerk
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("test-token") }),
}));

// Mock useSSEStream
const mockStartStream = vi.fn();
vi.mock("@/hooks/useSSEStream", () => ({
  useSSEStream: () => ({
    isStreaming: false,
    error: null,
    startStream: mockStartStream,
    stopStream: vi.fn(),
  }),
}));

// Mock API functions
vi.mock("@/lib/api/conversations", () => ({
  createConversation: vi.fn().mockResolvedValue({ id: "conv-1" }),
  getMessages: vi.fn().mockResolvedValue([]),
  confirmToolAction: vi.fn().mockResolvedValue({}),
}));

// Must import after mocks
import WorkflowChat from "../WorkflowChat";

describe("WorkflowChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header with creation mode text", () => {
    render(
      <WorkflowChat onClose={vi.fn()} />
    );
    expect(screen.getByText("Create Workflow with AI")).toBeInTheDocument();
  });

  it("renders header with edit mode text when workflowId is provided", () => {
    render(
      <WorkflowChat workflowId="wf-1" onClose={vi.fn()} />
    );
    expect(screen.getByText("Edit Workflow with AI")).toBeInTheDocument();
  });

  it("renders input placeholder for creation mode", () => {
    render(
      <WorkflowChat onClose={vi.fn()} />
    );
    expect(screen.getByPlaceholderText("Describe your workflow…")).toBeInTheDocument();
  });

  it("renders input placeholder for edit mode", () => {
    render(
      <WorkflowChat workflowId="wf-1" onClose={vi.fn()} />
    );
    expect(screen.getByPlaceholderText("Describe the changes…")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <WorkflowChat onClose={onClose} />
    );
    const buttons = screen.getAllByRole("button");
    // Close button is the first button (in header)
    const closeBtn = buttons[0];
    closeBtn.click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
