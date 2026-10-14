import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN, MEMBERS, multipart, RECEPTIONIST, useHarness } from "./helpers";

const h = useHarness();
beforeEach(() => h.reset());

const NEW_MEMBER = {
  firstName: "  Liya ",
  lastName: "Bekele",
  phone: "0912 000 111",
  email: "Liya.B@Example.com",
  gender: "FEMALE",
  emergencyName: "Bekele Alemu",
  emergencyPhone: "0911 000 222",
  emergencyRelationship: "Father",
  address: null,
  notes: null,
};

describe("members", () => {
  it("registers a member as Unpaid with a generated code and canonical phone", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const res = await client.post("/members", NEW_MEMBER);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      memberCode: "GYM-00357",
      fullName: "Liya Bekele",
      phone: "+251912000111",
      email: "liya.b@example.com",
      registrationDate: "2026-10-07",
      membership: { status: "UNPAID", hasPaidMembership: false },
      paymentCount: 0,
      permittedActions: {
        edit: true,
        recordPayment: true,
        archive: false,
        reactivate: false,
      },
    });
  });

  it("detects duplicates after phone normalization and links the existing record", async () => {
    const client = await h.signIn(RECEPTIONIST);
    // Abebe is +251911234567; the local form is the same number.
    const res = await client.post("/members", {
      ...NEW_MEMBER,
      phone: "0911-234-567",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "DUPLICATE_PHONE",
      details: {
        member: {
          id: MEMBERS.abebe,
          memberCode: "GYM-00124",
          fullName: "Abebe Kebede",
        },
      },
    });
    const lookup = await client.get(
      "/members?phone=%2B251%20911%20234%20567&archived=any&pageSize=2",
    );
    expect(lookup.body.items.map((m: { id: string }) => m.id)).toEqual([
      MEMBERS.abebe,
    ]);
  });

  it("validates fields with the form's wording", async () => {
    const client = await h.signIn(RECEPTIONIST, "am");
    const res = await client.post("/members", {
      ...NEW_MEMBER,
      firstName: " ",
      phone: "12345",
      emergencyPhone: null,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors).toEqual({
      firstName: "ስም ያስገቡ።",
      phone: "ትክክለኛ የኢትዮጵያ የሞባይል ቁጥር ያስገቡ፤ ለምሳሌ 0911 234 567።",
      emergencyPhone: "የተጠሪውን ስልክ ያስገቡ፤ ወይም ስሙን ያጥፉ።",
    });
  });

  it("finds members by code, phone digits and name words", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const ids = async (search: string) =>
      (
        await client.get(
          `/members?search=${encodeURIComponent(search)}&pageSize=100`,
        )
      ).body.items.map((m: { memberCode: string }) => m.memberCode);
    expect(await ids("GYM-00124")).toEqual(["GYM-00124"]);
    expect(await ids("0922 456")).toContain("GYM-00125");
    expect(await ids("kebede abebe")).toContain("GYM-00124");
  });

  it("filters by status (Active includes Expiring Soon) and sorts", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const active = await client.get("/members?status=ACTIVE&pageSize=1");
    expect(active.body.total).toBe(306);
    const expiring = await client.get(
      "/members?status=EXPIRING_SOON&sort=endDate&pageSize=100",
    );
    expect(expiring.body.total).toBe(20);
    const ends = expiring.body.items.map(
      (m: { membership: { coverageEnd: string } }) => m.membership.coverageEnd,
    );
    expect(ends).toEqual([...ends].sort());
  });

  it("archives and reactivates (administrators only), keeping history", async () => {
    const desk = await h.signIn(RECEPTIONIST);
    expect((await desk.post(`/members/${MEMBERS.abebe}/archive`)).status).toBe(
      403,
    );
    const admin = await h.signIn(ADMIN);
    const archived = await admin.post(`/members/${MEMBERS.abebe}/archive`);
    expect(archived.body).toMatchObject({
      isArchived: true,
      permittedActions: { recordPayment: false, reactivate: true },
    });
    expect((await admin.get("/members?search=GYM-00124")).body.total).toBe(0);
    expect(
      (await admin.get("/members?search=GYM-00124&archived=true")).body.total,
    ).toBe(1);
    expect(
      (await admin.get(`/members/${MEMBERS.abebe}/payments`)).body.total,
    ).toBeGreaterThan(0);
    expect(
      (await admin.post(`/members/${MEMBERS.abebe}/reactivate`)).body
        .isArchived,
    ).toBe(false);
  });

  it("lists period history with per-period status", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const res = await client.get(`/members/${MEMBERS.abebe}/memberships`);
    expect(res.body.items[0]).toMatchObject({
      startDate: "2026-10-01",
      endDate: "2026-10-30",
      periodStatus: "CURRENT",
    });
  });

  it("returns 404 for unknown or malformed ids", async () => {
    const client = await h.signIn(RECEPTIONIST);
    expect((await client.get("/members/not-a-uuid")).status).toBe(404);
    expect(
      (await client.get("/members/00000000-0000-4000-8200-999999999999"))
        .status,
    ).toBe(404);
  });
});

describe("member photos", () => {
  it("re-encodes uploads and serves them only to signed-in staff", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const png = await sharp({
      create: { width: 900, height: 1200, channels: 3, background: "#4338ca" },
    })
      .png()
      .toBuffer();
    const upload = multipart("photo", "me.png", "image/png", png);
    const res = await client.request(
      "POST",
      `/members/${MEMBERS.abebe}/photo`,
      upload,
    );
    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toMatch(
      new RegExp(`^/api/v1/members/${MEMBERS.abebe}/photo\\?v=\\d+$`),
    );

    const photo = await client.get(res.body.photoUrl.replace("/api/v1", ""));
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/jpeg");
    const meta = await sharp(photo.body as Buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(640);

    expect(
      (await h.client().get(res.body.photoUrl.replace("/api/v1", ""))).status,
    ).toBe(401);
    expect(
      (await client.delete(`/members/${MEMBERS.abebe}/photo`)).body.photoUrl,
    ).toBeNull();
  });

  it("rejects files that are not images, whatever they claim to be", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const fake = multipart(
      "photo",
      "virus.png",
      "image/png",
      Buffer.from("#!/bin/sh\necho pwned\n"),
    );
    const res = await client.request(
      "POST",
      `/members/${MEMBERS.abebe}/photo`,
      fake,
    );
    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors.photo).toBe(
      "This file isn't a valid image. Choose another photo.",
    );
    const pdf = multipart(
      "photo",
      "doc.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.4"),
    );
    expect(
      (await client.request("POST", `/members/${MEMBERS.abebe}/photo`, pdf))
        .body.error.fieldErrors.photo,
    ).toBe("Choose a JPEG, PNG or WebP image.");
  });
});
