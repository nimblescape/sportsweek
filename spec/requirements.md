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

As the system, I recognize the admin, teacher, and student roles so that access rights can be managed according to the role assigned in the user's record.

**Acceptance criteria:**

- User records can be stored in the database.
- There is a 1:1 relationship between a logged-in user and a user record.
- Each user record stores exactly one role.
- A user's role is either admin, teacher, or student.
- Roles are hierarchical: admin has all the rights of teacher, and teacher has all the rights of student.

### US-3: First user becomes admin

As the first unique user ever to log in to the system, my user record is created and assigned the admin role so that at least one admin account always exists.

**Acceptance criteria:**

- In a blank system, no user record exists.
- After the first login, exactly one user record exists, and it is assigned the admin role.
- After the login, a user record linked to my Entra ID user exists and has the admin role.

### US-4: Second user becomes teacher

As the second unique user ever to log in to the system, I am assigned the teacher role so that at least one teacher exists in the system.

**Acceptance criteria:**

- Before the login, exactly one user record exists in the system.
- After the login, exactly two user records exist.
- The first user record is assigned the admin role.
- The second user record is assigned the teacher role.
- After the login, a user record linked to my Entra ID user exists and has the teacher role.

### US-5: Subsequent users become students

As a user who is neither the first nor the second unique user ever to log in, I am assigned the student role.

**Acceptance criteria:**

- A user record with the admin role already exists in the system.
- A user record with the teacher role already exists in the system.
- Zero or more user records with the student role may already exist in the system.
- After the login, a user record linked to my Entra ID user exists and has the student role.

### US-6: Admin manages user roles

As an admin, I can modify the role of another user's record so that I can change the access rights for that user.

**Acceptance criteria:**

- A view listing all existing users exists.
- Only an admin can see the list of all users.
- The list shows each user's ID, first name, last name, and email address.
- The list can be filtered by role: admin, teacher, or student.
- The list can be filtered by a text filter that searches the first name, last name, and user ID.
- The text filter matches if the entered string occurs anywhere in the first name, last name, or user ID, ignoring leading/trailing whitespace and case, with no other sanitization applied.
- A role change assigns exactly one role (admin, teacher, or student) to the target user record.
- A user record that is the last remaining record with the admin role cannot have its role changed away from admin.
- A user record that is the last remaining record with the teacher role cannot have its role changed away from teacher.

## Seasons & Events

### US-7: Teacher maintains seasons and events

As a teacher, I can maintain seasons and, within each season, maintain events so that sports weeks can be organized over time.

**Acceptance criteria:**

- A view for maintaining the list of seasons exists.
- A teacher can add, edit, and remove seasons.
- Only an archived season can be removed (deleted); an active (non-archived) season cannot be deleted.
- Removing (deleting) a season also deletes all master data records (see US-14) belonging to that season.
- A teacher can archive a season; an archived season no longer appears in the teacher's list of seasons.
- A teacher can unarchive an archived season.
- Archiving (or unarchiving) a season is a computed state: the master data records for that season are considered archived accordingly, without storing a separate archived flag on each master data record.
- Each season can contain multiple events.
- A view for maintaining the list of events within a selected season exists.
- A teacher can add, edit, and remove events within a season.
- Removing (deleting) an event unassigns any students that were assigned to it (see US-15); the students themselves and their master data are not removed.
- A teacher can define exactly one season as the active season.

## Sports Week Master Data

### US-8: Teacher maintains programs

As a teacher, I can maintain the list of programs so that students can register for a current program.

**Acceptance criteria:**

- A view for maintaining the list of programs exists.
- A teacher can add, edit, and remove programs from the list.
- The list is pre-populated with the programs Ski, Snowboard, and Alternativ.
- The program a student selects in their master data (US-14) is chosen from this maintained list.
- Each program has an associated list of required equipment items (e.g. ski, ski boots, poles, helmet).
- A teacher can add, edit, and remove the required equipment items for each program.
- A program (or one of its required equipment items) can only be edited or removed if it is not currently selected by any master data record (US-14) belonging to a non-archived season (US-7).

### US-9: Teacher maintains classes

As a teacher, I can maintain the list of classes so that students can select their current class.

**Acceptance criteria:**

- A view for maintaining the list of classes exists.
- A teacher can add, edit, and remove classes from the list.
- A student can only select a class from this maintained list; a student cannot create or edit a class.
- The class a student selects in their master data (US-14) is chosen from this maintained list.
- A class can only be edited or removed if it is not currently selected by any master data record (US-14) belonging to a non-archived season (US-7).

### US-10: Teacher maintains skill levels

As a teacher, I can maintain the list of ski/snowboard skill levels so that students can select their current skill level.

**Acceptance criteria:**

- A view for maintaining the list of skill levels exists.
- A teacher can add, edit, and remove skill levels from the list.
- The list is pre-populated with the skill levels complete beginner, beginner, advanced, and expert.
- The skill level a student selects in their master data (US-14) is chosen from this maintained list.
- A skill level can only be edited or removed if it is not currently selected by any master data record (US-14) belonging to a non-archived season (US-7).

### US-11: Teacher maintains bus pickup points

As a teacher, I can maintain the list of bus pickup points so that students can select their pickup point on arrival.

**Acceptance criteria:**

- A view for maintaining the list of bus pickup points exists.
- A teacher can add, edit, and remove bus pickup points from the list.
- The list is pre-populated with the pickup points HTL Dornbirn, Feldkirch station, Bregenz station, and directly at the Tschagguns accommodation.
- The bus pickup point a student selects in their master data (US-14) is chosen from this maintained list.
- A bus pickup point can only be edited or removed if it is not currently selected by any master data record (US-14) belonging to a non-archived season (US-7).

### US-12: Teacher maintains food/diet options

As a teacher, I can maintain the list of food/diet options so that students can select their dietary needs.

**Acceptance criteria:**

- A view for maintaining the list of food/diet options exists.
- A teacher can add, edit, and remove food/diet options from the list.
- The list is pre-populated with the options eats everything, vegetarian, vegan, and no pork.
- In addition to the teacher-maintained list, the option "other" is always available and cannot be removed or edited by the teacher.
- Selecting the "other" option always requires the student to enter free text explaining the intolerance.
- The food/diet option a student selects in their master data (US-14) is chosen from this maintained list.
- A food/diet option can only be edited or removed if it is not currently selected by any master data record (US-14) belonging to a non-archived season (US-7).

### US-13: Teacher maintains season pass options

As a teacher, I can maintain the list of season pass options so that students can select their season pass status.

**Acceptance criteria:**

- A view for maintaining the list of season pass options exists.
- A teacher can add, edit, and remove season pass options from the list.
- The list is pre-populated with the options no, maybe, Golm-Bielerhöhe (Illwerke), and Silvretta-Montafon.
- The season pass option a student selects in their master data (US-14) is chosen from this maintained list.
- A season pass option can only be edited or removed if it is not currently selected by any master data record (US-14) belonging to a non-archived season (US-7).

### US-14: Student edits own master data

As a student, I can edit my master data so that I can provide the information needed for my sports week planning.

**Acceptance criteria:**

- A student can view and edit the master data for their own user record.
- The master data a student edits is bound to the currently active season (see US-7).
- Last name and first name are taken from the user record (see US-1) and are shown but not editable as part of this master data.
- The following master data fields are available:
  - Season: the active season the student is registering for (read-only)
  - Class: one of the classes maintained by a teacher (see US-9)
  - Date of birth
  - Gender: male / female
  - Phone number (must be in international format, e.g. +43...)
  - Emergency contact: first name, last name, relationship (mother, father, other with free text), phone number (must be in international format, e.g. +43...)
  - Which program are you registering for?: one of the programs maintained by a teacher (see US-8)
  - Equipment rental — shown only if the selected program has at least one required equipment item (see US-8): do you need to borrow any of the required equipment?: yes / no
    - If yes: shoe size, height [cm], weight [kg]
    - If yes, which equipment: one or more of the required equipment items for the selected program (see US-8)
  - Skill level: one of the skill levels maintained by a teacher (see US-10)
  - Season pass: one of the season pass options maintained by a teacher (see US-13), for the Silvretta-Montafon ski areas
  - Bus pickup point on arrival: one of the pickup points maintained by a teacher (see US-11)
  - Food: one of the food/diet options maintained by a teacher (see US-12), with free text if "other" is selected
  - Health: free text about illnesses/allergies the teachers should know about (e.g. diabetes, epilepsy, asthma)
  - Do you carry medication for that?: yes / no
- The required equipment items for the selected program are shown directly below the program field, in read-only form, only if the selected program has at least one required equipment item.
- When a value is selected from a teacher-maintained list (class, program, skill level, bus pickup point, food/diet option, or season pass option), the master data record stores that value redundantly as plain text (like an enum value), not as a foreign key/reference to the list item; later changes to the maintained list do not alter already-stored master data records.
- Unlike those teacher-maintained lists, the season (see US-7) the master data record belongs to is a genuine foreign key relationship, not a redundant plain-text copy — this is what allows a season's archived state to be computed for its master data records.

## Event Assignment

### US-15: Teacher assigns students to events

As a teacher, I can assign students to the events of the active season using an assignment dialog so that each student is allocated to a specific event.

**Acceptance criteria:**

- An assignment dialog exists, showing all students registered for the active season (see US-7).
- A per-class overview table shows, for each class, the total number of students, the number of male students, the number of female students, and the skill-level statistics (see US-10) per program (see US-8).
- Below the per-class overview table, a second table shows the same statistics (total, male, female, skill levels per program), broken down by event instead of by class.
- Below the two overview tables, a left/right (transfer) list shows students for the event selected by clicking its row in the per-event overview table: the left list shows students not yet assigned to any event; the right list shows the students assigned to the selected event.
- The teacher can select a student in either list and move it to the other list by dragging and dropping it.
- Multi-select is supported when moving students from left to right and from right to left.
- Both the left and right lists can be filtered by class (see US-9), by gender, by program (see US-8), by skill level (see US-10), and by a free-text filter that searches the first name and last name.
- Above each list, a free-text filter field for the name is shown, with a clear button (using a suitable icon) to reset it; below it, a single wrapping row of tags contains all the class, gender, program, and skill level filter options together, in that order.
- Each tag in the row can be individually selected and deselected; a selected tag is highlighted. Selecting multiple tags combines them with AND logic (a student must match all selected tags to be shown).
- The tag row includes an "all" tag as its very first tag, that deselects all other tags; it is highlighted while no other tag is selected, and stops being highlighted as soon as any other tag is selected.
- Below each list, the number of currently shown (filtered) items is displayed.

## Reporting

### US-16: Teacher views student report

As a teacher, I can view a report listing all students so that I have their contact information at hand.

**Acceptance criteria:**

- A report page exists, listing all students registered for the active season (see US-7).
- For each student, the report always shows the first name and last name (see US-1).
- The report has two independent tag lists: a filter tag list that determines which students are shown, and a columns tag list that determines which additional fields are shown for each student.
- The filter tag list works the same way as in the assignment dialog (see US-15): a free-text filter for the name with a clear button, and a wrapping tag row (with a first "all" tag) for class, gender, program, and skill level, combined with AND logic.
- The columns tag list lets the teacher select which additional fields, beyond first name and last name, are shown for each student: class (see US-9), gender (see US-14), date of birth (see US-14), contact data (email address, see US-1; phone number and emergency contact — name, relationship, and phone number — see US-14), skill level (see US-14), body measurements (weight, height, shoe size, see US-14), and needed rental equipment (see US-14).
