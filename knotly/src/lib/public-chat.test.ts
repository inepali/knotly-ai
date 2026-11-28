import { describe, expect, it } from "vitest";
import {
  AgentName,
  LeadInput,
  agentLabel,
  chatCookieName,
  greeting,
  needFromChat,
  parseChatCookie,
  safeReturnPath,
  talkLabel,
  toE164,
} from "./public-chat";

describe("AgentName", () => {
  it("accepts ordinary names and tidies spaces", () => {
    expect(AgentName.parse("  Maya  ")).toBe("Maya");
    expect(AgentName.parse("Mary  Jo")).toBe("Mary Jo");
    expect(AgentName.parse("O'Neil-Smith")).toBe("O'Neil-Smith");
  });
  it("lets an empty box clear the name", () => {
    expect(AgentName.parse("   ")).toBe("");
  });
  it("rejects bad lengths, characters and reserved words", () => {
    for (const bad of ["M", "x".repeat(31), "Maya1", "<b>", "Knotly", "Knotly Support", "admin"])
      expect(AgentName.safeParse(bad).success, bad).toBe(false);
  });
});

describe("labels", () => {
  it("uses the agent name when set, the business otherwise", () => {
    expect(talkLabel("Maya", "Big Day Story")).toBe("Talk to Maya");
    expect(talkLabel(null, "Big Day Story")).toBe("Chat with Big Day Story");
    expect(agentLabel("Maya", "Big Day Story")).toBe("Maya · AI assistant for Big Day Story");
    expect(agentLabel("", "Big Day Story")).toBe("AI assistant for Big Day Story");
    expect(greeting("Maya", "Big Day Story")).toContain("I'm Maya, Big Day Story's assistant");
  });
});

describe("chat cookie", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  it("round-trips a session id and token", () => {
    expect(parseChatCookie(`${id}.${"a".repeat(43)}`)).toEqual({ sessionId: id, token: "a".repeat(43) });
  });
  it("rejects anything malformed", () => {
    for (const bad of [undefined, "", id, `${id}.short`, `nope.${"a".repeat(43)}`]) expect(parseChatCookie(bad)).toBeNull();
  });
  it("names the cookie per vendor without dashes", () => {
    expect(chatCookieName(id)).toBe("knotly_chat_123e4567e89b42d3a456426614174000");
  });
});

describe("toE164", () => {
  it("normalizes US numbers", () => {
    expect(toE164("(704) 555-0134")).toBe("+17045550134");
    expect(toE164("1-704-555-0134")).toBe("+17045550134");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("rejects junk", () => {
    for (const bad of ["123", "555-0134", "+1 704 555", "abc"]) expect(toE164(bad)).toBeNull();
  });
});

describe("LeadInput", () => {
  const good = { name: "Priya", email: "priya@example.com", need: "Photos for a 120-guest wedding" };
  it("accepts a minimal lead and normalizes the phone", () => {
    const r = LeadInput.parse({ ...good, phone: "704 555 0134", weddingDate: "" });
    expect(r.phone).toBe("+17045550134");
    expect(r.weddingDate).toBeUndefined();
    expect(r.wantsMoreEstimates).toBe(false);
  });
  it("rejects bad email, throwaway inboxes, short needs and bad phones", () => {
    expect(LeadInput.safeParse({ ...good, email: "nope" }).success).toBe(false);
    expect(LeadInput.safeParse({ ...good, email: "x@mailinator.com" }).success).toBe(false);
    expect(LeadInput.safeParse({ ...good, need: "hi" }).success).toBe(false);
    expect(LeadInput.safeParse({ ...good, phone: "12" }).success).toBe(false);
  });
});

describe("needFromChat", () => {
  it("joins the visitor's words and skips quick replies", () => {
    expect(needFromChat(["See packages", "We're getting married in May", " 150 guests "])).toBe(
      "We're getting married in May 150 guests"
    );
  });
  it("clips long chats", () => {
    expect(needFromChat(["x".repeat(700)]).length).toBe(600);
  });
});

describe("safeReturnPath", () => {
  it("only allows vendor pages", () => {
    expect(safeReturnPath("/wedding-vendors/charlotte-nc/photographer/big-day-story-1a2b")).toBe(
      "/wedding-vendors/charlotte-nc/photographer/big-day-story-1a2b"
    );
    for (const bad of ["https://evil.com", "//evil.com", "/admin", "/wedding-vendors/../admin", null]) expect(safeReturnPath(bad)).toBeNull();
  });
});
