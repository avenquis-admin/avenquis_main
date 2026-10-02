import { z } from "zod";

export interface PetProvider {
  /**
   * Generate a response for the given prompt and optional context.
   * Should return a plain string response.
   */
  generate(prompt: string, context?: Record<string, any>): Promise<string>;
}

export class MockProvider implements PetProvider {
  async generate(prompt: string, _context?: Record<string, any>): Promise<string> {
    // Simple echo of the prompt for testing purposes.
    return `[Mock response] ${prompt}`;
  }
}

// Future providers (e.g., Gemini, OpenAI) can be added here implementing the same interface.
