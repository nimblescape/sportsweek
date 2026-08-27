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
- Every page carries its title on a row of the same height, whether or not that page has controls beside the title, so the heading sits in the same place as the teacher moves from one page to the next.
- Buttons use decent hover and pressed effects to provide visual feedback on interaction.
- Warning dialogs (e.g. irreversible delete confirmations) and error messages are exceptions to the palette rule above and may use red in a suitable way to signal danger or a problem.
- Icons throughout the UI use a single, consistent, minimalistic icon set (Lucide, the default icon set for shadcn/ui) that fits the clean visual design while still looking polished and refined.

## Drag and Drop

One drag-and-drop mechanism is used everywhere in the application: for ordering lists (US-4 through US-10) and for the assignment dialog's transfer lists (US-12). It is specified once here rather than per story, so the gesture a user learns in one place works in every other.

- Dragging is initiated from a dedicated grip handle on the item, not from the item's body, so a drag can never be started by accident and the rest of the row stays free for its own controls.
- The grip handle is always visible, on every device — it is not revealed on hover. A control that only appears on hover is unreachable on touch (see General), and a handle the user cannot see is a feature they will not find.
- Where an item may not be dragged at all, its handle is left out but the space it would have taken is kept, so the rows of a list that cannot be reordered are shaped exactly like the rows of one that can and nothing shifts as the two are compared.
- The handle uses the shared icon set (see Design Guidelines) and is the leftmost element of the item.
- Dragging works with mouse, touch, and pen alike, because it is driven by pointer input rather than by the browser's native HTML drag-and-drop, which touch devices do not support.
- Dragging is keyboard-accessible: the handle can be focused, and the item moved with the arrow keys, so ordering is not a mouse-only capability.
- While an item is dragged, the position it would take is shown, and the item itself follows the pointer, drawn above everything else and not clipped by whatever box it started in, so what is being moved stays visible all the way to its target. A drag made with the keyboard has no pointer to follow, and the item stays where it is until it arrives.
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
- The two names are read from the directory itself, each asked for by name — the first name from `givenName`, the last from `surname` — so that neither can be mistaken for the other. Whichever of them the directory holds is used, even if it holds only one.
- The display name is never split into the two. Its word order is the tenant's own choice, and this school writes the surname first, so splitting it stores the name the wrong way round as often as the right way.
- When the directory can supply neither, the name is derived from the UPN, whose local part is `firstname.lastname` by the same convention the roles rely on (see US-3, US-16). Umlauts are spelled out there, so this is an approximation — but a correct one about which name is which.
- The names are refreshed on every login, so a record stored from a worse source corrects itself the next time the user signs in.
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
- An archived season is read-only: it can be unarchived or deleted, but not renamed, and it keeps its place in the list rather than being dragged around among the seasons still being planned. Its row therefore offers no edit control and no grip handle, and the server refuses a rename outright, so a bypassed client cannot make one either. Its events (see below) can be read but not added to, edited, removed or reordered.
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
- A program requires at most ten equipment items, which is also the most a student can rent (US-11) — the school hands out a handful of items per program, and one limit for both keeps the two from contradicting each other.
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
- The list is pre-populated, in this order, with four skill levels shown as "Keine Vorkenntnisse" (no prior experience), "Anfänger:in" (beginner), "Fortgeschritten" (advanced), and "Profi" (expert).
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
- A registration is filled in over time, so it can be saved at any point, however little of it has been answered. Saving is never refused for a question the student has not got to yet; only a malformed answer — a phone number that is not one, a date that is not one — is rejected, and then on the field itself.
- After a save, every answer that is still outstanding is marked on its own field with the German hint "Pflichtfeld.", which disappears as soon as that answer is given. Nothing is marked before the first save, so a form the student has only just opened does not greet them in red.
- The record carries a flag stating whether answers are still outstanding. It is worked out by the server on every save, never sent by the client, and is not shown to the student — it exists for the teacher's report (see US-13).
- If no season is active, or the teacher has not set up any class yet (see US-6), the student sees a German notification saying that no sports event has been released yet ("Es ist noch keine Sportveranstaltung freigeschalten.") and the master data dialog is not shown. Both are pieces of the same setup that only a teacher can provide, and neither leaves the student anything to do, so they read the same: a class is asked of every student whether they attend or not, so a list without one cannot be filled in.
- The master data a student edits is bound to the currently active season (see US-4).
- Last name and first name are taken from the user record (see US-1) and are shown but not editable as part of this master data.
- The following master data fields are available:
  - Season: the active season the student is registering for (read-only)
  - Are you attending the sports week?: yes / no
  - Class: one of the classes maintained by a teacher (see US-6); always shown, and the one answer still expected of a student who is not attending
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

- An assignment dialog exists, scoped to all students registered for the active season (see US-4). Students who answered "no" to "Are you attending the sports week?" (see US-11) are counted only in the per-class card's total and attendance-percentage figures; they appear on no assignment card and in no other statistic (male, female, skill level per program), since only attending students can be assigned to an event.
- Everything is shown as cards stacked one above the other, in the order of the list they belong to. Each card carries a collapsible triangle in front of its title, pointing right while the card is folded and down while it is open, and every card folds on its own. The title is followed by a colon and the number of students the card holds, which is what moves when a student is assigned, since the figures below it only count the answers a student has actually given.
- A per-class card exists for each class, titled with the class, showing the total number of registered students (attending and not attending), the number of those students who are attending, and the percentage of registered students in the class who are attending, followed by the number of male and the number of female students and a matrix of skill levels per program (see US-7 and US-5). Everything but the total and the percentage describes attending students only.
- Below the per-class cards come the assignment cards: first a card holding the students not assigned to any event, then one card per event of the season. They are all built alike, so that a student can be dragged from any of them to any other.
- Each assignment card is divided into three areas side by side, each on a surface of its own and under its own heading: the filter, the students it holds as narrowed by that filter, and the card's own figures — a table of male and female counts, and below it the matrix of skill levels per program. The figures describe everything the card holds, so narrowing the list does not by itself change what the card says about itself. The areas stack only where the card is too narrow to hold three columns.
- A "Gefiltert" toggle on the title line of the figures area recounts them over the students the card's filter leaves, so a teacher can ask what one class did rather than what the whole card did. It is a tag, pressed or not, rather than a checkbox — pressing tags is how everything else on the page is chosen. It is off to begin with, is answered per card, and its name says which card's it is, since every card carries one.
- The skill-level matrix lists the skill levels down its rows and the programs across its columns, both in the order the teacher maintains them in.
- The students an assignment card holds are shown as a single wrapping row of tags rather than one name per line, which is what lets a card show a whole class without becoming a column of scrolling. The tags are ordered by last name, then first name.
- The teacher can select one or more students in any card (multi-select is supported). A selected student is shown by their whole tag being in the accent colour; there is no checkbox. Selecting happens on the press rather than on the release, so a press that turns into a drag is already carrying what it picked; releasing a press that landed on an already selected student deselects them. The students area states how many of the students it is showing are selected.
- Each card's first tag is "Alle", which is not a student but selects every student the card's filter currently leaves, and deselects them again once they are all selected. It carries a drag handle like any other tag, and dragging it moves every student the filter leaves. It is shown only while the filter leaves more than one student: with none it would have nothing to select, and with one it would do exactly what that student's own tag already does.
- While an assignment is being saved, the whole dialog is out of reach and the application's shared spinner says so, because every card is drawn from the records that write is changing.
- Changing a filter never changes the selection: a student selected before a filter hides them stays selected, and is moved along with the rest of the selection.
- A student changes card by being dragged and dropped, which is the only way they change card. A student's whole tag is what a pointer drags, and the grip handle at its left is what a keyboard drags. Dragging uses the application's one drag-and-drop mechanism (see Drag and Drop), so it works with mouse, touch and pen alike, and the keyboard gesture described there moves a student between the cards without a pointer at all. Dragging a student who is part of the selection takes that card's whole selection along; dragging one who is not moves them alone, and a selection made in another card is left where it is.
- A student is moved from one event to a different one by dragging them straight from the first card to the second; dropping them on the card of unassigned students takes their event away again.
- Every card can be filtered by class (see US-6), by gender, by program (see US-5), by skill level (see US-7), and by a free-text filter that searches the first name and last name.
- The filter area holds a free-text filter field for the name, with a clear button (using a suitable icon) to reset it; below it, a single wrapping row of tags contains all the class, gender, program, and skill level filter options together, in that order.
- Multiple tags can be selected at once within the same category (e.g. two classes, or both genders); a selected tag is highlighted, and selecting or deselecting a tag never affects tags belonging to a different category.
- Within a category, selected tags combine with OR logic (a student matches that category if it matches at least one of its selected tags); a category with no tag selected does not restrict the results (equivalent to every option in that category being allowed, including having no tag selected in every category, which shows all students).
- Different categories combine with AND logic (a student must satisfy every category's OR condition above to be shown).
- The tag row includes an "all" tag as its very first tag, that deselects all other tags across every category; it is highlighted while no other tag is selected, and stops being highlighted as soon as any other tag is selected.

## Reporting

### US-13: Teacher views student report

As a teacher, I can view a report listing all students so that I have their contact information at hand.

**Acceptance criteria:**

- A report page exists, listing all students registered for the active season (see US-4).
- A student whose registration is still missing answers (see US-11) is marked as such on their master line, so a teacher can see at a glance whom they still have to chase. The mark reads the flag stored on the record rather than re-deriving it per row.
- The report is a master-detail list rather than a table: each student is one master line showing the first name and last name followed by the email address in parentheses (see US-1), followed by that student's detail lines.
- Every data field activated in the fields tag list adds exactly one detail line, indented below the master line of the student it belongs to, showing the field's label and that student's value for it. With no field activated, each student is reduced to its master line.
- The report has two independent tag lists: a filter tag list that determines which students are shown, and a fields tag list that determines which detail lines are shown below each master line. Above them is a third tag list, of the saved reports the two can be restored from. Each of the three sits in a card of its own, in that order from the top: saved reports, filter, fields.
- The filter tag list works the same way as in the assignment dialog (see US-12): a free-text filter for the name with a clear button, and a wrapping tag row (with a first "all" tag) for class, gender, program, and skill level, each following the same within-category-OR / across-category-AND combination rules. In addition, since this report (unlike the assignment dialog) also lists students who answered "no", the tag row has an extra attendance category with the tags "attending" and "not attending" (see US-11), following the same selection rules as the other categories.
- The fields tag list lets the teacher activate the data fields shown as detail lines, beyond the first name, last name and email address already on the master line: attending status (yes/no, see US-11), class (see US-6), gender (see US-11), date of birth (see US-11), contact data (phone number and emergency contact — name, relationship, and phone number — see US-11), program (see US-5), skill level (see US-7), body measurements (weight, height, shoe size, see US-11), needed rental equipment (see US-11), bus pickup point (see US-8), season pass (see US-10), food/diet option (including its free text if "other" is selected, see US-9), and health/medication (health notes and whether medication is carried, see US-11).
- A tag that stands for a group of fields — contact data, body measurements, health/medication — activates every field in that group at once, and each of those fields then gets its own detail line.
- What a teacher saves under a name is the whole report as it stands: both tag list selections together, which students are shown and which detail lines they show. Keeping the filter alone would restore half of what was set up and leave the teacher to remember the other half.
- The saved reports are a tag list like the two they save, one tag per saved report, showing its name; they are shared among all teachers rather than private to the teacher who saved one. Pressing a tag puts that report back on screen, both tag list selections at once.
- The teacher decides the order of the tags by dragging them (see Drag and Drop and Ordering), and that order is what every teacher sees. Each tag carries a grip handle, and dragging starts there and nowhere else: the tag's own press opens the report, so a drag that started on the body would open a report on its way past. Moving a tag therefore neither opens nor marks the report it holds.
- A newly saved report's tag goes to the end of the row, where the button that made it stands, and stays there.
- Beside the tags, a Save button lets the teacher save the report as it currently stands under a name. Pressing it releases whichever tag was marked — naming a new report is a move away from the one that was open, not a change to it — and turns the button itself into a name field carrying a confirm and a cancel icon inside it, in the same place in the row and shaped like a tag, as the delete confirmation is; the button comes back as soon as the name is taken or the naming is abandoned, and the tag for the new report joins the row. That new tag is the marked one from the moment it exists: the report on screen and the tag that says so stay the same thing.
- Pressing a tag marks it, and it stays marked while the teacher goes on changing the two tag lists — that mark is what says which saved report is being worked on, and it moves only when another tag is pressed. Pressing the marked tag again releases it and leaves both tag lists exactly as they are, whether or not the report has been changed since: letting go of a saved report is not asking for one.
- A marked tag whose report is no longer what is on screen is shown in a different colour from one that still matches it, so a teacher can tell a saved report they have left alone from one they have since changed. Which order the tags were pressed in is no part of that comparison.
- A saved report made before a filter category or a data field existed still opens: an entry that no longer stands for anything restricts nothing and adds no detail line, rather than making the whole saved report unreadable. The same holds for an option that has since been renamed or removed — a class, a program, a skill level: opening the report drops the tags nothing offers any more, because a tag that cannot be seen and cannot be unpressed would otherwise narrow the report to nobody with nothing on screen to explain it.
- The controls for updating, renaming and deleting a saved report sit inside its own tag, so it is managed where it is shown rather than on a page of its own. They are shown on the marked tag only, permanently and on every device rather than revealed by a hover a teacher has to discover (see General); an unmarked tag carries no controls at all, so there is nothing on it to press by accident.
- Updating a saved report replaces both tag list selections it holds with the report as it currently stands, leaving its name alone. It is what a teacher reaches for after opening a saved report and adjusting it, instead of saving a second report under a second name. Its control appears only while the marked report is no longer what is on screen, since a report that has not been changed has nothing to store.
- Renaming a saved report edits its name in place: the tag itself becomes a name field carrying a confirm and a cancel icon inside it, holding the name it had, and the tag returns as soon as the new name is taken or the rename is abandoned. Every edit is made inside the tag it belongs to, so the row neither grows a line nor moves the tags around while a teacher works in it.
- Deleting a saved report requires a lightweight inline confirmation before it is removed, asked in the tag that is about to go.
- Reaching for a control in a tag closes the name form if one is open, whether it was opened to save a report or to rename one: the teacher has moved on from naming a report to managing one, and a form left standing would take a name for something they are no longer doing.
- While a saved report is being created, updated, renamed or removed, every tag and the name form are out of reach and the application's shared spinner says so, because every tag is drawn from the reports that write is changing.

### US-17: Teacher exports the student report as PDF

As a teacher, I can export the report as a PDF so that I have a paginated document to file, hand on, or send, without going through a browser's print dialog and whatever it decides a page looks like.

**Acceptance criteria:**

- An export button exists on the report page, labelled "PDF". The icon beside it says it is a download, so spelling out "exportieren" would only repeat what the button already shows.
- What it produces is a PDF file (`.pdf`), handed to the teacher as a download, so that what a teacher ends up holding can be filed, attached or sent as it is.
- The file is downloaded as soon as it has been built, to wherever the browser normally puts downloads. The teacher is not asked where to put it, because the export is one press and a location dialog would make it two.
- The file is named after the saved report on screen (see US-13), or "Sportsweek Report" where what is on screen is no saved report, followed by a dash and the date and time the export was made: `Sportsweek Report - 2026-08-27 14-35.pdf`. The date leads with the year so that a folder of exports sorts into the order they were taken in, which is the order a teacher looks for them in.
- What names it is the saved report the screen still matches, not whichever tag is marked: a marked report the teacher has since changed names nothing, because the file would otherwise claim to be a report it is not.
- A saved report's name is text a teacher typed, and a file name is not: whatever a file system will not accept in one — a slash, a colon — is replaced before the name is used.
- The export contains exactly the students the filter tag list leaves and exactly the detail lines the fields tag list activates (see US-13). It is the report as it currently stands on screen, not a second report with rules of its own.
- The document keeps the master-detail structure of the report: one master line per student, with that student's detail lines indented below it.
- A student is one block that is never split across a page boundary — a master line always sits on the same page as the detail lines belonging to it, so a page never opens with answers whose owner was named on the page before. Only a block taller than a whole page may break, because there is no page it would fit on.
- Every page carries the same header and the same footer, the first page included.
- The header holds the report title "Sportsweek Report" on the left and the HTL logo on the right. The title belongs to the header rather than being a heading printed once, which is what makes it repeat on every page.
- Under the title stands what the copy holds, on every page rather than once at the foot of one. Where what is on screen is a saved report (see US-13), its name is the first of those lines, unadorned; the filter that produced the export is the next — the name being searched for, then the tags chosen, grouped by the category they were chosen in but not labelled with it, since the tags say what they are. A report matching no saved one carries the filter line alone, and a report of the whole season that no saved report names has no subtitle at all.
- The footer states the page's own number and the total number of pages, in the form "Seite 3 von 12".
- The footer also states the date and time at which the export was made. A printed copy outlives the screen it was taken from, and the registrations keep changing after it, so a reader has to be able to tell how old the sheet in front of them is.
- The students' details are not put in a URL to produce the document: a class full of contact details has no business in an address bar, a history entry, or any log that records one. The document is built in the browser, from what the two tag lists already hold.

### US-18: Teacher exports the student report as a spreadsheet

As a teacher, I can export the report as an Excel file so that I can sort, group and count the registrations myself — which is the one thing a document meant for printing cannot do.

**Acceptance criteria:**

- An export button exists on the report page, beside the PDF export button (see US-17), labelled "Excel".
- What it produces is an Excel workbook file (`.xlsx`), handed to the teacher as a download.
- The file is delivered and named exactly as the PDF export's is (see US-17), with the `.xlsx` extension: `Sportsweek Report - 2026-08-27 14-35.xlsx`.
- The export holds exactly the students the filter tag list leaves and exactly the fields the fields tag list activates (see US-13) — the same scope the PDF export has.
- The workbook has two sheets: "Overview", which says what the export is, and "Report", which holds the students. What a PDF can put in a header and a footer on every page has nowhere to go in a table, and a row of provenance above the header row would be a row that sorting and filtering have to be told to skip.
- The "Overview" sheet carries the HTL logo, and below it the report title "Sportsweek Report", the date and time at which the export was made, and then the same lines the PDF puts under its title (see US-17): the saved report's name where what is on screen is one (see US-13), and the filter that produced the export.
- The "Report" sheet is tabular rather than master-detail: one row per student, one column per field. The master-detail shape would put a student's answers underneath their name in a single column, which is precisely the shape a spreadsheet cannot sort, filter or total.
- The leftmost columns are the fields every student has and the report always shows — first name, last name and e-mail address (see US-1) — each in a column of its own. They are followed by one column per activated field, in the order the fields tag list lists them.
- A tag standing for a group of fields — contact data, body measurements, health/medication (see US-13) — spreads into one column per field rather than one column holding all of them, because a cell that holds several values can be read but not sorted or counted.
- The first row of the "Report" sheet is a header row naming each column with its field's label, so the sheet still says what it holds once it has left the application. Nothing precedes it, which is what lets a teacher select the sheet and sort or filter it without first excluding anything.
- The mark for a registration still missing answers is not a column of its own: it is the "Registrierung" field of the fields tag list (see US-13), and appears when the teacher activates it.
- A field a student has not answered leaves its cell empty, rather than carrying the wording the report and the PDF put in its place, since an empty cell is what a spreadsheet itself counts as missing.

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
