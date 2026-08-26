<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Requirements

## General

- All UI text is in German.
- All UI must be responsive, supporting desktop, tablet, and mobile screen sizes.

## Design Guidelines

- The UI follows a clean, modern, minimal design that is not overloaded with color.
- The base palette consists only of black, white, and shades of gray, used for text, backgrounds, borders, and disabled/inactive states.
- A single accent (highlight) color is used consistently to draw attention to active and interactive elements, such as the primary/default button, selected tags, active navigation items, and focus states.
- No other colors are introduced outside of this palette (e.g. no additional colors to encode status, category, or meaning) unless explicitly required by a specific feature.
- Cards use decent, subtle shadows to convey elevation.
- Buttons use decent hover and pressed effects to provide visual feedback on interaction.
- Warning dialogs (e.g. irreversible delete confirmations) and error messages are exceptions to the palette rule above and may use red in a suitable way to signal danger or a problem.
- Icons throughout the UI use a single, consistent, minimalistic icon set (Lucide, the default icon set for shadcn/ui) that fits the clean visual design while still looking polished and refined.

## Drag and Drop

One drag-and-drop mechanism is used everywhere in the application: for ordering lists (US-4 through US-10) and for the assignment dialog's transfer lists (US-12). It is specified once here rather than per story, so the gesture a user learns in one place works in every other.

- Dragging is initiated from a dedicated grip handle on the item, not from the item's body, so a drag can never be started by accident and the rest of the row stays free for its own controls.
- The grip handle is always visible, on every device — it is not revealed on hover. A control that only appears on hover is unreachable on touch (see General), and a handle the user cannot see is a feature they will not find.
- The handle uses the shared icon set (see Design Guidelines) and is the leftmost element of the item.
- Dragging works with mouse, touch, and pen alike, because it is driven by pointer input rather than by the browser's native HTML drag-and-drop, which touch devices do not support.
- Dragging is keyboard-accessible: the handle can be focused, and the item moved with the arrow keys, so ordering is not a mouse-only capability.
- While an item is dragged, the position it would take is shown, and the item follows the pointer.
- A drag that is cancelled (Escape, or released outside a valid target) leaves the list exactly as it was.

## Ordering

Every list the teacher maintains is shown in an order the teacher decides, not in alphabetical order. Sorting by name would be a guess at intent: teachers group classes by year, put the most common program first, and order pickup points along the bus route. None of that is alphabetical.

- The teacher can reorder the items of a list by dragging them (see Drag and Drop).
- The order is persisted and is the order in which the list is shown to everyone, including the order in which students see the options they choose from (US-11).
- A newly added item goes to the end of the list.
- Removing an item closes the gap; the remaining items keep their relative order.
- Reordering is never restricted by the in-use rule that governs editing and removing (see Sports Week Master Data): moving an item changes no stored value, so master data records cannot be affected by it.
- The lists that are ordered this way are: seasons and, within a season, events (US-4); every teacher-maintained category (US-5 through US-10); and the required equipment of a program (US-5).

## Authentication & User Management

### US-1: Login with Microsoft Entra ID

As a user, I log in with my Microsoft Entra ID credentials so that I can access the system.

**Acceptance criteria:**

- The system uses federated login with Microsoft Entra ID.
- First name, last name, and email address are obtained from Entra ID and stored in the user record.
- A user record is created on the user's first login if none exists yet.
- There is a 1:1 relationship between the Entra ID user and the user record stored in the database.
- The user record's ID is the Entra ID user principal name (UPN).
- Production always signs users in this way; only the test environment substitutes a fake login for the identity provider (see US-16).

### US-2: Role model

As the system, I recognize the teacher and student roles so that access rights can be managed according to the role assigned in the user's record.

**Acceptance criteria:**

- User records can be stored in the database.
- There is a 1:1 relationship between a logged-in user and a user record.
- Each user record stores exactly one role.
- A user's role is either teacher or student.
- Roles are hierarchical: teacher has all the rights of student.

### US-3: Role assigned by Entra ID domain

As a user, my role is automatically determined by the domain of my Entra ID UPN when my user record is first created, so that access rights are granted without manual assignment.

**Acceptance criteria:**

- If the UPN's domain (the part after @) is exactly "htldornbirn.at", the newly created user record is assigned the teacher role.
- If the UPN's domain is exactly "student.htldornbirn.at", the newly created user record is assigned the student role.
- If the UPN's domain matches neither pattern, the login is rejected and no user record is created.
- Once assigned, a role can only be changed by someone with direct database access (e.g. IT staff); there is no in-app role management.

## Seasons & Events

### US-4: Teacher maintains seasons and events

As a teacher, I can maintain seasons and, within each season, maintain events so that sports weeks can be organized over time.

**Acceptance criteria:**

- A view for maintaining the list of seasons exists.
- The list shows every season, along with its state: active, archived, or inactive (neither active nor archived).
- A teacher can add, edit, and remove seasons.
- A season that holds no student master data (see US-11) can be deleted whether or not it is archived, and whether or not it is active.
- A season that holds student master data can only be deleted once it is archived; while it is not archived it cannot be deleted.
- Each season row has a delete button, disabled only for a non-archived season that holds student master data, with a hint explaining that such a season must be archived first.
- Removing (deleting) a season also deletes all master data records (see US-11) and all events (see below) belonging to that season.
- The confirmation dialog described below is only required when the season holds student master data. A season with none is deleted directly, without confirmation, since there is nothing irreversible to lose beyond the season and its events.
- Before a season that holds student master data is deleted, a confirmation modal dialog (built with native HTML/CSS, not a separate browser popup window) asks the teacher whether they are sure they want to delete the season, showing the exact season name; it also states that all master data records for that season will be deleted along with it, and includes a hint that this cannot be undone.
- The confirmation dialog is a warning dialog (see Design Guidelines).
- The confirmation dialog has a Delete button and a Cancel button.
- The confirmation dialog requires the teacher to type the exact season name; the Delete button is only enabled once the entered text matches the season name being deleted.
- A teacher can archive a season; an archived season no longer appears in the teacher's list of seasons.
- A season that holds no student master data cannot be archived: archiving signs off on a season's student data, so there must be data to sign off on.
- Each season row has an archive button, disabled for the active season (which must be deactivated first) and for any season that holds no student master data, with a hint explaining whichever reason applies.
- A teacher can unarchive an archived season. Unarchiving is not subject to the student-data rule, so a season that somehow ended up archived without data can still be brought back.
- A season's active/archived state is stored directly on the season. A student master data record has no archived flag of its own; its archived status is computed from the archived state of the season it belongs to (see US-11).
- Whether a season holds student master data is mirrored onto the season itself, so the client can enable or disable the archive and delete actions without reading master data it is not permitted to read. The server re-checks the underlying records on every archive and delete and is the sole authority.
- Each season can contain multiple events.
- A view for maintaining the list of events within a selected season exists.
- A teacher can add, edit, and remove events within a season.
- Removing (deleting) an event unassigns any students that were assigned to it (see US-12); the students themselves and their master data are not removed.
- A teacher can activate a season, and can also deactivate the active season so that no season is active.
- At most one season is active at any point in time: activating a season automatically deactivates the season that was active before, as one atomic step, so there is never a moment in which two seasons are active.
- An archived season cannot be activated, and the active season cannot be archived: it must be deactivated first, either in a prior call or in the same one. Either way no season is left active.
- The assignment dialog (US-12) and the student report (US-13) only ever operate on the active season; when no season is active they show an explicit empty state instead of falling back to a previously active season.
- Season names are unique: two seasons cannot share the same name.
- The list of seasons, and the list of events within a season, are each shown in an order the teacher sets by dragging (see Ordering).
- Event names are unique within their season: two events of the same season cannot share the same name, while two different seasons may each have an event of the same name.
- Name comparison ignores surrounding whitespace and letter case, so "Montafon" and " montafon " count as the same name.
- A rejected name is reported on the name field itself, in German, and nothing is saved.

## Sports Week Master Data

Unless a story below says otherwise, every list in this section follows the same edit/remove restriction: an item can only be edited or removed if it is not currently selected by any master data record (US-11) belonging to a non-archived season (US-4); when blocked by this rule, a hint is shown: "This item is still in use in a non-archived season. Archive that season to edit or remove it."

Every list in this section also enforces unique names: two items of the same category cannot share a name, compared ignoring surrounding whitespace and letter case. The same name may of course appear in two different categories (e.g. a class and a program). Required equipment items (US-5) are unique within their program — two different programs may each require a helmet. A rejected name is reported on the name field itself, in German, and nothing is saved.

All categories in this section (US-5 through US-10) share one unified, intuitive CRUD interface pattern for adding, editing, and deleting list items — consistent across every category, differing only in the fields each item has. Every one of them is also shown in an order the teacher sets by dragging (see Ordering).

### US-5: Teacher maintains programs

As a teacher, I can maintain the list of programs so that students can register for a current program.

**Acceptance criteria:**

- A view for maintaining the list of programs exists.
- A teacher can add, edit, and remove programs from the list.
- The list is pre-populated with the programs Ski, Snowboard, and Alternativ.
- The program a student selects in their master data (US-11) is chosen from this maintained list.
- Each program carries its required equipment as a list of names stored on the program itself, not as records of their own: an equipment item has no identity outside the program that requires it, and is never referenced from anywhere else. The default Ski program is pre-populated with ski, ski boots, poles, and helmet, and the default Snowboard program with board, boots, and helmet; the default Alternativ program has no pre-populated required equipment items.
- A teacher can add, edit, and remove the required equipment items for each program.
- The required equipment of a program is shown in an order the teacher sets by dragging (see Ordering); the list's order is the order the items are stored in.
- Because the list lives on the program, the whole list is saved in one step: adding, renaming, or removing an item rewrites the program's equipment list as a single change, and either all of it is stored or none of it is.
- Deleting a program deletes its required equipment list along with it, since the list has no existence apart from the program.
- A program is matched via its `.program` value on master data records; a required equipment item is matched via students' equipment rental selections instead — both follow the shared edit/remove restriction above.
- A program can only be deleted if none of its required equipment items is in use either, since deleting the program would take those items with it.

### US-6: Teacher maintains classes

As a teacher, I can maintain the list of classes so that students can select their current class.

**Acceptance criteria:**

- A view for maintaining the list of classes exists.
- A teacher can add, edit, and remove classes from the list.
- A student can only select a class from this maintained list; a student cannot create or edit a class.
- The class a student selects in their master data (US-11) is chosen from this maintained list.

### US-7: Teacher maintains skill levels

As a teacher, I can maintain the list of ski/snowboard skill levels so that students can select their current skill level.

**Acceptance criteria:**

- A view for maintaining the list of skill levels exists.
- A teacher can add, edit, and remove skill levels from the list.
- The list is pre-populated, in this order, with four skill levels shown as "Keine Vorkenntnisse" (no prior experience), "Anfänger" (beginner), "Fortgeschritten" (advanced), and "Profi" (expert).
- The skill level a student selects in their master data (US-11) is chosen from this maintained list.

### US-8: Teacher maintains bus pickup points

As a teacher, I can maintain the list of bus pickup points so that students can select their pickup point on arrival.

**Acceptance criteria:**

- A view for maintaining the list of bus pickup points exists.
- A teacher can add, edit, and remove bus pickup points from the list.
- The list is pre-populated with the pickup points "HTL Dornbirn", "Bahnhof Feldkirch", "Bahnhof Bregenz", and "Unterkunft" (boarding at the accommodation itself rather than travelling by bus).
- The bus pickup point a student selects in their master data (US-11) is chosen from this maintained list.

### US-9: Teacher maintains food/diet options

As a teacher, I can maintain the list of food/diet options so that students can select their dietary needs.

**Acceptance criteria:**

- A view for maintaining the list of food/diet options exists.
- A teacher can add, edit, and remove food/diet options from the list.
- The list is pre-populated with the options "Alles" (eats everything), "Vegetarisch", "Vegan", and "Kein Schweinefleisch" (no pork).
- In addition to the teacher-maintained list, the option "other" is always available and cannot be removed or edited by the teacher.
- Selecting the "other" option always requires the student to enter free text explaining the intolerance; the free text must not be empty.
- The food/diet option a student selects in their master data (US-11) is chosen from this maintained list.

### US-10: Teacher maintains season pass options

As a teacher, I can maintain the list of season pass options so that students can select their season pass status.

**Acceptance criteria:**

- A view for maintaining the list of season pass options exists.
- A teacher can add, edit, and remove season pass options from the list.
- The list is pre-populated, in this order, with the options "Keine" (no season pass), "Vielleicht" (maybe), "Golm-Bielerhöhe (Illwerke)", and "Silvretta-Montafon".
- The season pass option a student selects in their master data (US-11) is chosen from this maintained list.

### US-11: Student edits own master data

As a student, I can edit my master data so that I can provide the information needed for my sports week planning.

**Acceptance criteria:**

- A student can view and edit the master data for their own user record.
- If no season is active, the student sees a German notification saying that no sports event has been released yet ("Es ist noch keine Sportveranstaltung freigeschalten.") and the master data dialog is not shown.
- The master data a student edits is bound to the currently active season (see US-4).
- Last name and first name are taken from the user record (see US-1) and are shown but not editable as part of this master data.
- The following master data fields are available:
  - Season: the active season the student is registering for (read-only)
  - Are you attending the sports week?: yes / no
  - Class: one of the classes maintained by a teacher (see US-6); always shown and required, regardless of the answer above
  - Date of birth
  - Gender: male / female
  - Phone number (must be in international format, e.g. +43...)
  - Emergency contact: first name, last name, relationship (mother, father, other with free text that must not be empty), phone number (must be in international format, e.g. +43...)
  - Which program are you registering for?: one of the programs maintained by a teacher (see US-5)
  - Equipment rental — shown only if the selected program has at least one required equipment item (see US-5): do you need to borrow any of the required equipment?: yes / no
    - If yes: shoe size, height [cm], weight [kg]
    - If yes, which equipment: one or more of the required equipment items for the selected program (see US-5), selected via checkboxes, plus an "all" checkbox that is UI-only (not a distinct equipment item); selecting "all" checks every equipment item, deselecting any single item automatically unchecks "all", and manually checking every item automatically checks "all" as well
  - Skill level: one of the skill levels maintained by a teacher (see US-7)
  - Season pass: one of the season pass options maintained by a teacher (see US-10)
  - Bus pickup point on arrival: one of the pickup points maintained by a teacher (see US-8)
  - Food: one of the food/diet options maintained by a teacher (see US-9), with free text if "other" is selected
  - Health: free text about illnesses/allergies the teachers should know about (e.g. diabetes, epilepsy, asthma)
  - Do you carry medication for that?: yes / no
- All master data fields other than "Are you attending the sports week?" and "Class" are shown only if the student answers "yes"; a master data record is always created and saved regardless of the answer, and switching from "yes" to "no" only hides those fields — their values are kept and reappear if the student switches back to "yes".
- If a student who is already assigned to an event (see US-12) switches their answer to "no", the event assignment is removed and the student becomes unassigned.
- The required equipment items for the selected program are shown directly below the program field, in read-only form, only if the selected program has at least one required equipment item.
- When a value is selected from a teacher-maintained list (class, program, skill level, bus pickup point, food/diet option, or season pass option), the master data record stores that value redundantly as plain text (like an enum value), not as a foreign key/reference to the list item; later changes to the maintained list do not alter already-stored master data records.
- Unlike those teacher-maintained lists, the season (see US-4) the master data record belongs to is a genuine foreign key relationship, not a redundant plain-text copy — this is what allows a season's archived state to be computed for its master data records.

## Event Assignment

### US-12: Teacher assigns students to events

As a teacher, I can assign students to the events of the active season using an assignment dialog so that each student is allocated to a specific event.

**Acceptance criteria:**

- An assignment dialog exists, scoped to all students registered for the active season (see US-4). Students who answered "no" to "Are you attending the sports week?" (see US-11) are counted only in the per-class overview table's total and attendance-percentage figures; they are excluded from the transfer lists and from every other statistic (male, female, skill level per program), since only attending students can be assigned to an event.
- A per-class overview table shows, for each class: the total number of registered students (attending and not attending), the number of those students who are attending, and the percentage of registered students in the class who are attending; the remaining columns (number of male students, number of female students, and skill-level statistics per program, see US-7 and US-5) describe attending students only.
- Below the per-class overview table, a second table shows the same attending-only statistics (male, female, skill levels per program — no total or attendance percentage, since every student in this table is by definition attending), broken down by event instead of by class; it only counts students assigned to that event.
- Below the two overview tables, a left/right (transfer) list shows students for the event selected by clicking its row in the per-event overview table: the left list shows students not yet assigned to any event; the right list shows the students assigned to the selected event.
- The teacher can select one or more students in either list (multi-select is supported) and move the selection to the other list either by dragging and dropping, or by pressing a move button between the two lists (e.g. arrow buttons). Dragging uses the application's one drag-and-drop mechanism (see Drag and Drop) and therefore works on touch devices as well; the move buttons remain because they are what moves a multi-student selection in one action, and because they keep the dialog usable by keyboard alone.
- To move a student from one event to a different event, the teacher first moves the student from the right list back to the left list (unassigning them), then selects the other event and moves the student from the left list into its right list; no direct move-between-events action exists.
- Both the left and right lists can be filtered by class (see US-6), by gender, by program (see US-5), by skill level (see US-7), and by a free-text filter that searches the first name and last name.
- Above each list, a free-text filter field for the name is shown, with a clear button (using a suitable icon) to reset it; below it, a single wrapping row of tags contains all the class, gender, program, and skill level filter options together, in that order.
- Multiple tags can be selected at once within the same category (e.g. two classes, or both genders); a selected tag is highlighted, and selecting or deselecting a tag never affects tags belonging to a different category.
- Within a category, selected tags combine with OR logic (a student matches that category if it matches at least one of its selected tags); a category with no tag selected does not restrict the results (equivalent to every option in that category being allowed, including having no tag selected in every category, which shows all students).
- Different categories combine with AND logic (a student must satisfy every category's OR condition above to be shown).
- The tag row includes an "all" tag as its very first tag, that deselects all other tags across every category; it is highlighted while no other tag is selected, and stops being highlighted as soon as any other tag is selected.
- Below each list, the number of currently shown (filtered) items is displayed.

## Reporting

### US-13: Teacher views student report

As a teacher, I can view a report listing all students so that I have their contact information at hand.

**Acceptance criteria:**

- A report page exists, listing all students registered for the active season (see US-4).
- The report is a master-detail list rather than a table: each student is one master line showing the first name and last name (see US-1), followed by that student's detail lines.
- Every data field activated in the fields tag list adds exactly one detail line, indented below the master line of the student it belongs to, showing the field's label and that student's value for it. With no field activated, each student is reduced to its master line.
- The report has two independent tag lists: a filter tag list that determines which students are shown, and a fields tag list that determines which detail lines are shown below each master line.
- The filter tag list works the same way as in the assignment dialog (see US-12): a free-text filter for the name with a clear button, and a wrapping tag row (with a first "all" tag) for class, gender, program, and skill level, each following the same within-category-OR / across-category-AND combination rules. In addition, since this report (unlike the assignment dialog) also lists students who answered "no", the tag row has an extra attendance category with the tags "attending" and "not attending" (see US-11), following the same selection rules as the other categories.
- The fields tag list lets the teacher activate the data fields shown as detail lines, beyond the first name and last name already on the master line: attending status (yes/no, see US-11), class (see US-6), gender (see US-11), date of birth (see US-11), contact data (email address, see US-1; phone number and emergency contact — name, relationship, and phone number — see US-11), program (see US-5), skill level (see US-7), body measurements (weight, height, shoe size, see US-11), needed rental equipment (see US-11), bus pickup point (see US-8), season pass (see US-10), food/diet option (including its free text if "other" is selected, see US-9), and health/medication (health notes and whether medication is carried, see US-11).
- A tag that stands for a group of fields — contact data, body measurements, health/medication — activates every field in that group at once, and each of those fields then gets its own detail line.
- A dropdown next to the filter tag list shows all saved filters by name, shared among all teachers (not private to the teacher who saved it); selecting one applies its saved filter tag list selection to the report. This is a custom dropdown/listbox component (e.g. a popover-based combobox), not a native HTML `<select>` element, since a native `<select>` cannot render the per-item rename/delete icons described below.
- Next to the dropdown, a Save button lets the teacher save the current filter tag list selection under a name, entered inline (e.g. in a small popover) without leaving the report page.
- In the dropdown, each saved filter has a rename and a delete icon, so the teacher can rename or delete it inline, directly in the dropdown, without a separate management page. On pointer-based devices (desktop) the icons appear on hover; on touch devices (tablet, mobile), where there is no hover state, the icons are always visible instead, so the feature stays usable on every supported screen size (see General).
- Renaming a saved filter edits its name in place; deleting one requires a lightweight inline confirmation before it is removed.
- A print button on the report page opens the report as HTML in a popup window, keeping the master-detail structure, which the teacher can then print (e.g. to PDF or any format supported by the installed printers).

## Navigation

### US-14: Teacher dashboard layout

As a teacher, I see a dashboard when I log in so that I can navigate to the different areas of the application.

**Acceptance criteria:**

- A header row is shown at the top of the dashboard: the application title "Sportsweek" on the left, and a logout button on the right.
- Below the header, the remaining area is split into a left-side navigation zone and a content area on the right.
- The left-side navigation contains, from top to bottom: Report (see US-13), Assignment (see US-12), and Master data.
- The Master data navigation item has a sub-item for each teacher-maintained category (see US-4 through US-10).
- Selecting the Master data navigation item expands its sub-items; deselecting it collapses them again.

### US-15: Student navigation

As a student, I only see my master data when I log in, so that I can go straight to registering for the sports week without unrelated navigation.

**Acceptance criteria:**

- When a student logs in, only the student master data (see US-11) is shown.
- The student's page has the same header row as the teacher dashboard (see US-14): the application title "Sportsweek" on the left, and a logout button on the right.
- A student's view has no left-side navigation zone (see US-14); the header is followed directly by the master data content.

## Test Environment

### US-16: Fake login in the test environment

As a teacher trying the application out, I can continue as any teacher or student after signing in, so that the application can be exercised with a whole class of people without an Entra ID account for each of them.

**Acceptance criteria:**

- The fake login replaces the identity provider and nothing else. The chosen identity is signed in through the same session endpoint as a real login, so provisioning (US-1), the role derived from the UPN domain (US-3), the session cookie, and every authorization check downstream stay on the code paths production uses.
- The fake login is opt-in per deployment, and the production project refuses it whatever the configuration says.
- A deployment that does not opt in has no fake login to disable: the modules and the endpoint behind it are not part of the build at all, so a configuration mistake cannot turn it on after the fact.
- The test environment is a separate Firebase project from production, because the fake login creates real authentication accounts and real user records, and neither belongs anywhere near real people's data.
- The test environment has its own sign-in screen, marked "Testumgebung" and stating that the data is invented, so that the two environments cannot be mistaken for one another.
- Signing in still begins with a real Entra ID sign-in (US-1). Only a teacher who has been through it is offered the choice of who to continue as, and the endpoint that mints the chosen identity refuses every other caller. While the fake login is off, that endpoint answers as if it did not exist rather than admitting that it does.
- Whether the caller came through Entra ID is decided by the sign-in provider that Firebase records during the token exchange, which a caller cannot assert for themselves. Without that distinction, one invented identity could authorize inventing the next.
- The proof of the real Entra ID sign-in is kept separately from the session cookie that continuing as someone else replaces, so switching identity does not give up the right to switch again.
- A student who signs in through Entra ID is refused with "Diese Umgebung steht nur Lehrpersonen offen.", while an impersonated student is admitted — that case is what the environment exists for.
- The choice is made in a dialog that asks for a first name, a last name, and a role, or lets one of the users already present be picked instead. Cancelling continues as the signed-in teacher.
- The UPN is derived from the name and the role rather than typed: `firstname.lastname` at the teacher or the student domain of US-3, with German umlauts spelled out ("Müller" becomes `mueller`, never `muller`) and remaining diacritics dropped. It is shown as it is derived and cannot be edited.
- A name from which no valid school address can be formed is refused, on the client and on the server alike, with "Aus diesem Namen lässt sich keine gültige Schul-Adresse bilden." — the fake tenant may only issue UPNs the real one could have issued.
- Choosing a role chooses the domain; the role itself still follows from that domain (US-3). A user record that already exists keeps the role it was created with, exactly as after a real login.
