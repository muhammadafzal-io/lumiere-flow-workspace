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

  it("parses spoken local part with dots before at", () => {
    expect(
      parseEmailFromConfirmationText(
        "That's muhammad dot afzal dot 110190 at gmail dot com — is that right?",
      ),
    ).toBe("muhammad.afzal.110190@gmail.com");
  });

  it("parses spoken local part before at", () => {
    expect(
      parseEmailFromConfirmationText("That's techtycon72 at gmail dot com — is that right?"),
    ).toBe("techtycon72@gmail.com");
  });
});

describe("shouldPreferConfirmedEmail", () => {
  it("rejects truncated confirmed email when tool has full address", () => {
    expect(shouldPreferConfirmedEmail("muhammad.afzal.110190@gmail.com", "110190@gmail.com")).toBe(
      false,
    );
  });

  it("accepts full confirmed email over shorter tool arg", () => {
    expect(shouldPreferConfirmedEmail("110190@gmail.com", "muhammad.afzal.110190@gmail.com")).toBe(
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

  it("returns full dotted email from confirmation line", () => {
    const email = findVoiceConfirmedEmail([
      {
        role: "assistant",
        text: "Let me confirm — muhammad.afzal.110190@gmail.com. Is that correct?",
      },
      { role: "user", text: "yes" },
    ]);
    expect(email).toBe("muhammad.afzal.110190@gmail.com");
  });
});
