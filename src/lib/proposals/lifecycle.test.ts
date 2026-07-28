import { describe, expect, it } from "vitest";
import { assertProposalTransition, canTransitionProposal, InvalidProposalTransitionError } from "./lifecycle";

describe("canTransitionProposal", () => {
  it("permite o fluxo feliz completo: NEEDS_MORE_DATA -> PENDING -> APPROVED -> EXECUTED", () => {
    expect(canTransitionProposal("NEEDS_MORE_DATA", "PENDING")).toBe(true);
    expect(canTransitionProposal("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionProposal("APPROVED", "EXECUTED")).toBe(true);
  });

  it("permite ADJUST voltar para PENDING após reformulação", () => {
    expect(canTransitionProposal("PENDING", "ADJUST")).toBe(true);
    expect(canTransitionProposal("ADJUST", "PENDING")).toBe(true);
  });

  it("permite retry de EXECUTION_FAILED voltando para APPROVED", () => {
    expect(canTransitionProposal("EXECUTION_FAILED", "APPROVED")).toBe(true);
  });

  it("recusa pular direto de NEEDS_MORE_DATA para EXECUTED", () => {
    expect(canTransitionProposal("NEEDS_MORE_DATA", "EXECUTED")).toBe(false);
  });

  it("recusa executar sem aprovação (PENDING -> EXECUTED)", () => {
    expect(canTransitionProposal("PENDING", "EXECUTED")).toBe(false);
  });

  it("trata REJECTED e EXECUTED como estados terminais", () => {
    expect(canTransitionProposal("REJECTED", "PENDING")).toBe(false);
    expect(canTransitionProposal("EXECUTED", "APPROVED")).toBe(false);
  });

  it("assertProposalTransition lança erro em transição inválida", () => {
    expect(() => assertProposalTransition("PENDING", "EXECUTED")).toThrow(InvalidProposalTransitionError);
  });

  it("assertProposalTransition não lança erro em transição válida", () => {
    expect(() => assertProposalTransition("PENDING", "APPROVED")).not.toThrow();
  });
});
