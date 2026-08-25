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
- Icons throughout the UI use a single, consistent, minimalistic icon set (e.g. line/outline style) that fits the clean visual design while still looking polished and refined.

## Authentication & User Management

### US-1: Login with Microsoft Entra ID

As a user, I log in with my Microsoft Entra ID credentials so that I can access the system.

**Acceptance criteria:**

- The system uses federated login with Microsoft Entra ID.
- First name, last name, and email address are obtained from Entra ID and stored in the user record.
- A user record is created on the user's first login if none exists yet.
- There is a 1:1 relationship between the Entra ID user and the user record stored in the database.
- The user record's ID is the Entra ID user principal name (UPN).

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

## Seasons & Events

### US-4: Teacher maintains seasons and events

As a teacher, I can maintain seasons and, within each season, maintain events so that sports weeks can be organized over time.

**Acceptance criteria:**

- A view for maintaining the list of seasons exists.
- A teacher can add, edit, and remove seasons.
- Only an archived season can be removed (deleted); an active (non-archived) season cannot be deleted.
- Removing (deleting) a season also deletes all master data records (see US-11) belonging to that season.
- Before a season is deleted, a confirmation popup asks the teacher whether they are sure they want to delete the season, showing the exact season name; it also states that all master data records for that season will be deleted along with it, and includes a hint that this cannot be undone.
- The confirmation popup is a warning dialog (see Design Guidelines).
- The confirmation popup has a Delete button and a Cancel button.
- The confirmation popup requires the teacher to type the exact season name; the Delete button is only enabled once the entered text matches the season name being deleted.
- A teacher can archive a season; an archived season no longer appears in the teacher's list of seasons.
- A teacher can unarchive an archived season.
- Archiving (or unarchiving) a season is a computed state: the master data records for that season are considered archived accordingly, without storing a separate archived flag on each master data record.
- Each season can contain multiple events.
- A view for maintaining the list of events within a selected season exists.
- A teacher can add, edit, and remove events within a season.
- Removing (deleting) an event unassigns any students that were assigned to it (see US-12); the students themselves and their master data are not removed.
- A teacher can define exactly one season as the active season.

## Sports Week Master Data

### US-5: Teacher maintains programs

As a teacher, I can maintain the list of programs so that students can register for a current program.

**Acceptance criteria:**

- A view for maintaining the list of programs exists.
- A teacher can add, edit, and remove programs from the list.
- The list is pre-populated with the programs Ski, Snowboard, and Alternativ.
- The program a student selects in their master data (US-11) is chosen from this maintained list.
- Each program has an associated list of required equipment items (e.g. ski, ski boots, poles, helmet).
- A teacher can add, edit, and remove the required equipment items for each program.
- A program (or one of its required equipment items) can only be edited or removed if it is not currently selected by any master data record (US-11) belonging to a non-archived season (US-4).
- When a program (or one of its required equipment items) cannot be edited or removed, a hint is shown: "This item is still in use in an active season. Archive that season to edit or remove it."

### US-6: Teacher maintains classes

As a teacher, I can maintain the list of classes so that students can select their current class.

**Acceptance criteria:**

- A view for maintaining the list of classes exists.
- A teacher can add, edit, and remove classes from the list.
- A student can only select a class from this maintained list; a student cannot create or edit a class.
- The class a student selects in their master data (US-11) is chosen from this maintained list.
- A class can only be edited or removed if it is not currently selected by any master data record (US-11) belonging to a non-archived season (US-4).
- When a class cannot be edited or removed, a hint is shown: "This item is still in use in an active season. Archive that season to edit or remove it."

### US-7: Teacher maintains skill levels

As a teacher, I can maintain the list of ski/snowboard skill levels so that students can select their current skill level.

**Acceptance criteria:**

- A view for maintaining the list of skill levels exists.
- A teacher can add, edit, and remove skill levels from the list.
- The list is pre-populated with the skill levels complete beginner, beginner, advanced, and expert.
- The skill level a student selects in their master data (US-11) is chosen from this maintained list.
- A skill level can only be edited or removed if it is not currently selected by any master data record (US-11) belonging to a non-archived season (US-4).
- When a skill level cannot be edited or removed, a hint is shown: "This item is still in use in an active season. Archive that season to edit or remove it."

### US-8: Teacher maintains bus pickup points

As a teacher, I can maintain the list of bus pickup points so that students can select their pickup point on arrival.

**Acceptance criteria:**

- A view for maintaining the list of bus pickup points exists.
- A teacher can add, edit, and remove bus pickup points from the list.
- The list is pre-populated with the pickup points HTL Dornbirn, Feldkirch station, Bregenz station, and directly at the Tschagguns accommodation.
- The bus pickup point a student selects in their master data (US-11) is chosen from this maintained list.
- A bus pickup point can only be edited or removed if it is not currently selected by any master data record (US-11) belonging to a non-archived season (US-4).
- When a bus pickup point cannot be edited or removed, a hint is shown: "This item is still in use in an active season. Archive that season to edit or remove it."

### US-9: Teacher maintains food/diet options

As a teacher, I can maintain the list of food/diet options so that students can select their dietary needs.

**Acceptance criteria:**

- A view for maintaining the list of food/diet options exists.
- A teacher can add, edit, and remove food/diet options from the list.
- The list is pre-populated with the options eats everything, vegetarian, vegan, and no pork.
- In addition to the teacher-maintained list, the option "other" is always available and cannot be removed or edited by the teacher.
- Selecting the "other" option always requires the student to enter free text explaining the intolerance; the free text must not be empty.
- The food/diet option a student selects in their master data (US-11) is chosen from this maintained list.
- A food/diet option can only be edited or removed if it is not currently selected by any master data record (US-11) belonging to a non-archived season (US-4).
- When a food/diet option cannot be edited or removed, a hint is shown: "This item is still in use in an active season. Archive that season to edit or remove it."

### US-10: Teacher maintains season pass options

As a teacher, I can maintain the list of season pass options so that students can select their season pass status.

**Acceptance criteria:**

- A view for maintaining the list of season pass options exists.
- A teacher can add, edit, and remove season pass options from the list.
- The list is pre-populated with the options no, maybe, Golm-Bielerhöhe (Illwerke), and Silvretta-Montafon.
- The season pass option a student selects in their master data (US-11) is chosen from this maintained list.
- A season pass option can only be edited or removed if it is not currently selected by any master data record (US-11) belonging to a non-archived season (US-4).
- When a season pass option cannot be edited or removed, a hint is shown: "This item is still in use in an active season. Archive that season to edit or remove it."

### US-11: Student edits own master data

As a student, I can edit my master data so that I can provide the information needed for my sports week planning.

**Acceptance criteria:**

- A student can view and edit the master data for their own user record.
- The master data a student edits is bound to the currently active season (see US-4).
- Last name and first name are taken from the user record (see US-1) and are shown but not editable as part of this master data.
- The following master data fields are available:
  - Season: the active season the student is registering for (read-only)
  - Are you attending the sports week?: yes / no
  - Class: one of the classes maintained by a teacher (see US-6)
  - Date of birth
  - Gender: male / female
  - Phone number (must be in international format, e.g. +43...)
  - Emergency contact: first name, last name, relationship (mother, father, other with free text), phone number (must be in international format, e.g. +43...)
  - Which program are you registering for?: one of the programs maintained by a teacher (see US-5)
  - Equipment rental — shown only if the selected program has at least one required equipment item (see US-5): do you need to borrow any of the required equipment?: yes / no
    - If yes: shoe size, height [cm], weight [kg]
    - If yes, which equipment: one or more of the required equipment items for the selected program (see US-5)
  - Skill level: one of the skill levels maintained by a teacher (see US-7)
  - Season pass: one of the season pass options maintained by a teacher (see US-10), for the Silvretta-Montafon ski areas
  - Bus pickup point on arrival: one of the pickup points maintained by a teacher (see US-8)
  - Food: one of the food/diet options maintained by a teacher (see US-9), with free text if "other" is selected
  - Health: free text about illnesses/allergies the teachers should know about (e.g. diabetes, epilepsy, asthma)
  - Do you carry medication for that?: yes / no
- All master data fields other than "Are you attending the sports week?" are shown only if the student answers that question with "yes".
- The required equipment items for the selected program are shown directly below the program field, in read-only form, only if the selected program has at least one required equipment item.
- When a value is selected from a teacher-maintained list (class, program, skill level, bus pickup point, food/diet option, or season pass option), the master data record stores that value redundantly as plain text (like an enum value), not as a foreign key/reference to the list item; later changes to the maintained list do not alter already-stored master data records.
- Unlike those teacher-maintained lists, the season (see US-4) the master data record belongs to is a genuine foreign key relationship, not a redundant plain-text copy — this is what allows a season's archived state to be computed for its master data records.

## Event Assignment

### US-12: Teacher assigns students to events

As a teacher, I can assign students to the events of the active season using an assignment dialog so that each student is allocated to a specific event.

**Acceptance criteria:**

- An assignment dialog exists, showing all students registered for the active season (see US-4).
- A per-class overview table shows, for each class, the total number of students, the number of male students, the number of female students, and the skill-level statistics (see US-7) per program (see US-5).
- Below the per-class overview table, a second table shows the same statistics (total, male, female, skill levels per program), broken down by event instead of by class.
- Below the two overview tables, a left/right (transfer) list shows students for the event selected by clicking its row in the per-event overview table: the left list shows students not yet assigned to any event; the right list shows the students assigned to the selected event.
- The teacher can select a student in either list and move it to the other list by dragging and dropping it.
- Multi-select is supported when moving students from left to right and from right to left.
- Both the left and right lists can be filtered by class (see US-6), by gender, by program (see US-5), by skill level (see US-7), and by a free-text filter that searches the first name and last name.
- Above each list, a free-text filter field for the name is shown, with a clear button (using a suitable icon) to reset it; below it, a single wrapping row of tags contains all the class, gender, program, and skill level filter options together, in that order.
- Each tag in the row can be individually selected and deselected; a selected tag is highlighted. Selecting multiple tags combines them with AND logic (a student must match all selected tags to be shown).
- The tag row includes an "all" tag as its very first tag, that deselects all other tags; it is highlighted while no other tag is selected, and stops being highlighted as soon as any other tag is selected.
- Below each list, the number of currently shown (filtered) items is displayed.

## Reporting

### US-13: Teacher views student report

As a teacher, I can view a report listing all students so that I have their contact information at hand.

**Acceptance criteria:**

- A report page exists, listing all students registered for the active season (see US-4).
- For each student, the report always shows the first name and last name (see US-1).
- The report has two independent tag lists: a filter tag list that determines which students are shown, and a columns tag list that determines which additional fields are shown for each student.
- The filter tag list works the same way as in the assignment dialog (see US-12): a free-text filter for the name with a clear button, and a wrapping tag row (with a first "all" tag) for class, gender, program, and skill level, combined with AND logic.
- The columns tag list lets the teacher select which additional fields, beyond first name and last name, are shown for each student: class (see US-6), gender (see US-11), date of birth (see US-11), contact data (email address, see US-1; phone number and emergency contact — name, relationship, and phone number — see US-11), skill level (see US-11), body measurements (weight, height, shoe size, see US-11), and needed rental equipment (see US-11).
- A teacher can save the current filter tag list selection under a name.
- A dropdown lets the teacher select a previously saved filter and apply it to the report.
- A print button on the report page opens the report as HTML in a popup window, which the teacher can then print (e.g. to PDF or any format supported by the installed printers).

## Navigation

### US-14: Teacher dashboard layout

As a teacher, I see a dashboard when I log in so that I can navigate to the different areas of the application.

**Acceptance criteria:**

- A header row is shown at the top of the dashboard: the application title "Sportsweek" on the left, and a logout button on the right.
- Below the header, the remaining area is split into a left-side navigation zone and a content area on the right.
- The left-side navigation contains, from top to bottom: Report (see US-13), Assignment (see US-12), Master data, and Archived seasons (see US-4).
- The Master data navigation item has a sub-item for each teacher-maintained category (see US-5 through US-10).
- Selecting the Master data navigation item expands its sub-items; deselecting it collapses them again.

### US-15: Student navigation

As a student, I only see my master data when I log in, so that I can go straight to registering for the sports week without unrelated navigation.

**Acceptance criteria:**

- When a student logs in, only the student master data (see US-11) is shown.
- The student's page has the same header row as the teacher dashboard (see US-14): the application title "Sportsweek" on the left, and a logout button on the right.
- A student's view has no left-side navigation zone (see US-14); the header is followed directly by the master data content.
