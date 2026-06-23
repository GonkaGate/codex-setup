export function validateApiKey(value: string): string {
  const apiKey = value.trim();

  if (apiKey.length === 0) {
    throw new Error("GonkaGate API key is required.");
  }

  if (!apiKey.startsWith("gp-")) {
    throw new Error('GonkaGate API keys must start with "gp-".');
  }

  if (apiKey.length < 10) {
    throw new Error("GonkaGate API key looks too short.");
  }

  return apiKey;
}
