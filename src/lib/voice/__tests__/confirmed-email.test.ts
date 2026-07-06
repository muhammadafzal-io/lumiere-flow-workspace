import { describe, expect, it } from "vitest";
import {
  findVoiceConfirmedEmail,
  parseEmailFromConfirmationText,
} from "@/lib/voice/confirmed-email";

describe("parseEmailFromConfirmationText", () => {
  it("parses a direct email address", () => {
    expect(parseEmailFromConfirmationText("Your email is techtycon72@gmail.com, correct?")).toBe(
      "techtycon72@gmail.com",
    );
  });

  it("parses hyphenated letter-by-letter spelling", () => {
    expect(
      parseEmailFromConfirmationText(
        "Let me confirm your email — that's T-E-C-H-T-Y-C-O-N-7-2 at gmail dot com. Is that correct?",
      ),
    ).toBe("techtycon72@gmail.com");
  });

  it("parses spoken local part before at", () => {
    expect(
      parseEmailFromConfirmationText("That's techtycon72 at gmail dot com — is that right?"),
    ).toBe("techtycon72@gmail.com");
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
});
