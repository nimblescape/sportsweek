/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_LABELS } from "@/lib/master-data/categories";
import type { Registration } from "@/lib/schemas/registration";

const apiRequest = vi.fn();

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

const { RegistrationForm } = await import("./registration-form");
const { ApiRequestError } = await import("@/lib/api/client");

const LISTS = {
  classes: ["3AHME", "4AHME"],
  programs: [
    { id: "p1", name: "Ski", position: 0, requiredEquipment: ["Ski", "Helm"] },
    { id: "p2", name: "Alternativ", position: 1, requiredEquipment: [] },
  ],
  skillLevels: ["Anfänger", "Profi"],
  busPickupPoints: ["HTL Dornbirn"],
  foodOptions: ["Alles", "Vegetarisch"],
  seasonPassOptions: ["Keine"],
};

const storedRecord: Registration = {
  id: "s1__jane",
  userId: "jane@student.htldornbirn.at",
  eventSeriesId: "s1",
  eventId: null,
  isIncomplete: false,
  isAttendingSportsWeek: true,
  class: "3AHME",
  program: "Ski",
  skillLevel: "Anfänger",
  busPickupPoint: "HTL Dornbirn",
  foodOption: "Vegetarisch",
  foodOtherText: null,
  seasonPassOption: "Keine",
  dateOfBirth: "2008-05-04",
  gender: "female",
  phoneNumber: "+436601234567",
  emergencyContact: {
    firstName: "Maria",
    lastName: "Doe",
    relationship: "mother",
    relationshipOtherText: null,
    phoneNumber: "+436501234567",
  },
  healthNotes: null,
  hasMedication: false,
  equipmentRentalNeeded: false,
  rentedEquipment: [],
  shoeSize: null,
  heightCm: null,
  weightKg: null,
};

function renderForm(record: Registration | null = storedRecord) {
  render(
    <RegistrationForm
      eventSeriesName="Winter 2026"
      studentName="Jane Doe"
      record={record}
      lists={LISTS}
    />,
  );
}

const save = () => screen.getByRole("button", { name: "Speichern" });

/** Three questions offer "Ja"/"Nein", so an answer is only unambiguous within its own group. */
const answer = (question: string, option: string) =>
  userEvent.click(
    within(screen.getByRole("group", { name: question })).getByRole("radio", { name: option }),
  );

const ATTENDING = "Nimmst du an der Sportwoche teil?";
const RENTING = "Musst du etwas ausleihen?";

async function pick(field: string, option: string) {
  await userEvent.click(screen.getByLabelText(field));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

function sentBody() {
  return apiRequest.mock.calls.at(-1)![1].body;
}

/** The button only wakes up once something has changed, so a save has to follow an answer. */
async function changeSomething() {
  await pick("Klasse", "4AHME");
}

const cardTitles = () =>
  Array.from(document.querySelectorAll('[data-slot="card-title"]')).map(
    (title) => title.textContent ?? "",
  );

const eventSeriesCard = () =>
  screen.getByText("Winter 2026").closest('[data-slot="card"]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue({ record: storedRecord });
});

describe("RegistrationForm", () => {
  it("shows the event series and the name from the user record as text, not as fields (US-11)", () => {
    renderForm();

    expect(cardTitles()).toContain("Winter 2026");
    expect(screen.getByLabelText("Name")).toHaveTextContent("Jane Doe");
    expect(screen.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
  });

  /** One card for the event series rather than three, so the answers about it are read together. */
  it("gathers the answers about the event series into one card, titled with its name", () => {
    renderForm();

    expect(cardTitles()).toEqual([
      "Anmeldung",
      "Persönliches",
      "Notfallkontakt",
      "Winter 2026",
      "Gesundheit",
    ]);
  });

  it("puts that card's answers in the order the master data menu lists them", () => {
    renderForm();

    const text = eventSeriesCard().textContent ?? "";
    const at = [
      "Programm",
      ANSWER_LABELS.skillLevel,
      ANSWER_LABELS.seasonPassOption,
      ANSWER_LABELS.busPickupPoint,
      ANSWER_LABELS.foodOption,
    ].map((label) => text.indexOf(label));

    expect(at).not.toContain(-1);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
  });

  it("starts a student who has not registered yet on an empty form", () => {
    renderForm(null);

    expect(screen.getByLabelText("Klasse")).toHaveTextContent("Klasse wählen");
  });

  it("saves the whole registration in one request", async () => {
    renderForm();

    await changeSomething();
    await userEvent.click(save());

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(apiRequest.mock.calls[0][0]).toBe("/api/my-registration");
    expect(apiRequest.mock.calls[0][1].method).toBe("PUT");
    expect(sentBody()).toMatchObject({ class: "4AHME", program: "Ski" });
  });

  it("confirms a save, and says the registration is complete when it is", async () => {
    renderForm();

    await changeSomething();
    await userEvent.click(save());

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("gespeichert");
    expect(status).toHaveTextContent("Deine Anmeldung ist vollständig.");
  });

  it("names what is still missing in the same breath as the confirmation", async () => {
    renderForm({
      ...storedRecord,
      emergencyContact: { ...storedRecord.emergencyContact, firstName: null },
    });

    await changeSomething();
    await userEvent.click(save());

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("gespeichert");
    expect(status).toHaveTextContent("Vorname des Notfallkontakts");
  });

  /** By then it is no longer true: what is on screen is not what was saved. */
  it("takes the confirmation away as soon as the student edits again", async () => {
    renderForm();

    await changeSomething();
    await userEvent.click(save());
    await screen.findByRole("status");
    await pick("Klasse", "3AHME");

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("shows what the server said when a save is refused", async () => {
    apiRequest.mockRejectedValue(
      new ApiRequestError("Es ist noch keine Sportveranstaltung freigeschalten."),
    );
    renderForm();

    await changeSomething();
    await userEvent.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("freigeschalten");
  });

  describe("the save button", () => {
    it("has nothing to do until an answer changes", () => {
      renderForm();

      expect(save()).toBeDisabled();
    });

    it("wakes up once one does", async () => {
      renderForm();

      await changeSomething();

      expect(save()).toBeEnabled();
    });

    it("goes back to sleep once the change is saved", async () => {
      renderForm();

      await changeSomething();
      await userEvent.click(save());

      await waitFor(() => expect(save()).toBeDisabled());
    });

    /** An incomplete registration is still worth keeping, so nothing about it locks the save. */
    it("stays within reach while an answer is still missing", async () => {
      renderForm({
        ...storedRecord,
        emergencyContact: { ...storedRecord.emergencyContact, firstName: null },
      });

      await changeSomething();

      expect(save()).toBeEnabled();
    });

    it("marks what is still missing once the student has saved", async () => {
      renderForm({
        ...storedRecord,
        emergencyContact: { ...storedRecord.emergencyContact, firstName: null },
      });

      await changeSomething();
      await userEvent.click(save());

      await waitFor(() => expect(apiRequest).toHaveBeenCalled());
      expect(await screen.findByText("Pflichtfeld.")).toBeInTheDocument();
    });

    it("says nothing about missing answers before the first save", () => {
      renderForm({
        ...storedRecord,
        emergencyContact: { ...storedRecord.emergencyContact, firstName: null },
      });

      expect(screen.queryByText("Pflichtfeld.")).not.toBeInTheDocument();
    });

    it("takes the mark away as soon as the answer is given", async () => {
      renderForm({
        ...storedRecord,
        emergencyContact: { ...storedRecord.emergencyContact, firstName: null },
      });

      await changeSomething();
      await userEvent.click(save());
      await screen.findByText("Pflichtfeld.");
      await userEvent.type(screen.getByLabelText("Vorname"), "Maria");

      await waitFor(() => expect(screen.queryByText("Pflichtfeld.")).not.toBeInTheDocument());
    });
  });

  describe("attendance", () => {
    it("keeps asking for the class of a student who is not attending", async () => {
      renderForm();

      await answer(ATTENDING, "Nein");

      expect(screen.getByLabelText("Klasse")).toBeInTheDocument();
    });

    it("hides every other field once the student answers 'no'", async () => {
      renderForm();

      await answer(ATTENDING, "Nein");

      expect(screen.queryByLabelText("Geburtsdatum")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Leistungsstufe")).not.toBeInTheDocument();
    });

    /** Hiding is not clearing: switching back has to find the answers where they were (US-11). */
    it("brings the values back when the student changes their mind", async () => {
      renderForm();

      await userEvent.clear(screen.getByLabelText("Geburtsdatum"));
      await userEvent.type(screen.getByLabelText("Geburtsdatum"), "2009-01-02");
      await answer(ATTENDING, "Nein");
      await answer(ATTENDING, "Ja");

      expect(screen.getByLabelText("Geburtsdatum")).toHaveValue("2009-01-02");
    });

    it("saves the hidden values along with the answer 'no'", async () => {
      renderForm();

      await answer(ATTENDING, "Nein");
      await userEvent.click(save());

      await waitFor(() => expect(apiRequest).toHaveBeenCalled());
      expect(sentBody()).toMatchObject({
        isAttendingSportsWeek: false,
        class: "3AHME",
        program: "Ski",
      });
    });
  });

  describe("equipment", () => {
    it("lists what the selected program requires, next to the question about borrowing it", () => {
      renderForm();

      expect(screen.getByText("Benötigte Ausrüstung")).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Ski" })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Helm" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: RENTING })).toBeInTheDocument();
    });

    it("has nothing to tick until the student says they need to borrow something", () => {
      renderForm();

      expect(screen.getByRole("checkbox", { name: "Ski" })).toBeDisabled();
      expect(screen.queryByRole("checkbox", { name: "Alles" })).not.toBeInTheDocument();
    });

    it("asks nothing about renting for a program that requires nothing", async () => {
      renderForm();

      await pick("Für welches Programm meldest du dich an?", "Alternativ");

      expect(screen.queryByRole("group", { name: RENTING })).not.toBeInTheDocument();
      expect(screen.queryByText("Benötigte Ausrüstung")).not.toBeInTheDocument();
    });

    it("turns the list into choices once renting is answered with 'yes'", async () => {
      renderForm();

      await answer(RENTING, "Ja");

      expect(await screen.findByLabelText("Schuhgröße")).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Helm" })).toBeEnabled();
      expect(screen.getByRole("checkbox", { name: "Alles" })).toBeInTheDocument();
    });

    it("stores nothing about renting for a program that requires nothing", async () => {
      renderForm({ ...storedRecord, equipmentRentalNeeded: true, rentedEquipment: ["Helm"] });

      await pick("Für welches Programm meldest du dich an?", "Alternativ");
      await userEvent.click(save());

      await waitFor(() => expect(apiRequest).toHaveBeenCalled());
      expect(sentBody()).toMatchObject({ equipmentRentalNeeded: null, rentedEquipment: [] });
    });
  });

  describe("food", () => {
    it("offers the fixed option no teacher maintains (US-9)", async () => {
      renderForm();

      await userEvent.click(screen.getByLabelText("Verpflegung"));

      expect(await screen.findByRole("option", { name: "Sonstiges" })).toBeInTheDocument();
    });

    it("asks what the intolerance is, and stores the sentinel rather than its label", async () => {
      renderForm();

      await pick("Verpflegung", "Sonstiges");
      await userEvent.type(screen.getByLabelText("Welche Unverträglichkeit?"), "Nussallergie");
      await userEvent.click(save());

      await waitFor(() => expect(apiRequest).toHaveBeenCalled());
      expect(sentBody()).toMatchObject({ foodOption: "other", foodOtherText: "Nussallergie" });
    });
  });

  describe("emergency contact", () => {
    it("asks which relationship it is once 'Sonstiges' is chosen", async () => {
      renderForm();

      await answer("Beziehung", "Sonstiges");

      expect(screen.getByLabelText("Welche Beziehung?")).toBeInTheDocument();
    });
  });
});
