import { describe, expect, it } from "vitest";
import {
  findLongestEmailInText,
  findVoiceConfirmedEmail,
  parseEmailFromConfirmationText,
  shouldPreferConfirmedEmail,
} from "@/lib/voice/confirmed-email";

describe("findLongestEmailInText", () => {
  it("returns full dotted local part, not a suffix match", () => {
    expect(
      findLongestEmailInText("Let me confirm — muhammad.afzal.110190@gmail.com is that correct?"),
    ).toBe("muhammad.afzal.110190@gmail.com");
  });
});

describe("parseEmailFromConfirmationText", () => {
  it("parses a direct email address", () => {
    expect(parseEmailFromConfirmationText("Your email is techtycon72@gmail.com, correct?")).toBe(
      "techtycon72@gmail.com",
    );
  });

  it("parses dotted gmail addresses in full", () => {
    expect(
      parseEmailFromConfirmationText(
        "Your email is muhammad.afzal.110190@gmail.com — is that correct?",
      ),
    ).toBe("muhammad.afzal.110190@gmail.com");
  });

  it("parses hyphenated letter-by-letter spelling", () => {
    expect(
      parseEmailFromConfirmationText(
        "Let me confirm your email — that's T-E-C-H-T-Y-C-O-N-7-2 at gmail dot com. Is that correct?",
      ),
    ).toBe("techtycon72@gmail.com");
  });

  it("parses spoken digit words as numeric local segment", () => {
    expect(
      parseEmailFromConfirmationText(
        "That's muhammad dot afzal dot one one zero one nine zero at gmail dot com — correct?",
      ),
    ).toBe("muhammad.afzal.110190@gmail.com");
  });

  it("does not return zero@gmail.com from spoken digit tail", () => {
    expect(
      parseEmailFromConfirmationText(
        "That's muhammad dot afzal dot one one zero one nine zero at gmail dot com",
      ),
    ).not.toBe("zero@gmail.com");
  });

  it("parses hyphenated spelling with gmail.com domain", () => {
    expect(
      parseEmailFromConfirmationText(
        "Got it. Let me confirm your email — that's R-I-A-Z-3-6-8-7-2 at gmail.com. Is that correct?",
      ),
    ).toBe("riaz36872@gmail.com");
  });

  it("sanitizes that's glued to a direct email match", () => {
    expect(findLongestEmailInText("that'sriaz36872@gmail.com")).toBe("riaz36872@gmail.com");
  });
});

describe("shouldPreferConfirmedEmail", () => {
  it("rejects truncated confirmed email when tool has full address", () => {
    expect(shouldPreferConfirmedEmail("muhammad.afzal.110190@gmail.com", "110190@gmail.com")).toBe(
      false,
    );
  });

  it("rejects zero@gmail.com when tool has full address", () => {
    expect(shouldPreferConfirmedEmail("muhammad.afzal.110190@gmail.com", "zero@gmail.com")).toBe(
      false,
    );
  });

  it("prefers confirmed when tool email has that's prefix", () => {
    expect(shouldPreferConfirmedEmail("that'sriaz36872@gmail.com", "riaz36872@gmail.com")).toBe(
      true,
    );
  });
});

describe("findVoiceConfirmedEmail", () => {
  it("returns the most recent assistant confirmation", () => {
    const email = findVoiceConfirmedEmail([
      { role: "user", text: "dechtycon72 at gmail" },
      { role: "assistant", text: "That's D-E-C-H-T-Y-C-O-N-7-2 at gmail dot com." },
      { role: "user", text: "no, T E C H" },
      {
        role: "assistant",
        text: "Got it — T-E-C-H-T-Y-C-O-N-7-2 at gmail dot com. Is that correct?",
      },
      { role: "user", text: "yes" },
    ]);
    expect(email).toBe("techtycon72@gmail.com");
  });

  it("uses user spoken email when assistant partial would be zero@gmail.com", () => {
    const email = findVoiceConfirmedEmail([
      { role: "user", text: "muhammad dot afzal dot one one zero one nine zero at gmail" },
      { role: "assistant", text: "zero at gmail dot com — is that correct?" },
    ]);
    expect(email).toBe("muhammad.afzal.110190@gmail.com");
  });

  it("returns riaz36872 from hyphen spell-back with gmail.com", () => {
    const email = findVoiceConfirmedEmail([
      {
        role: "assistant",
        text: "Got it. Let me confirm your email — that's R-I-A-Z-3-6-8-7-2 at gmail.com. Is that correct?",
      },
      { role: "user", text: "yes" },
    ]);
    expect(email).toBe("riaz36872@gmail.com");
  });
});
