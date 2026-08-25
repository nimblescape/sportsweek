# Requirements

## General

- All UI text is in German.

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

## Sports Week Master Data

### US-7: Teacher maintains programs

As a teacher, I can maintain the list of programs so that students can register for a current program.

**Acceptance criteria:**

- A view for maintaining the list of programs exists.
- A teacher can add, edit, and remove programs from the list.
- The list is pre-populated with the programs Ski, Snowboard, and Alternativ.
- The program a student selects in their master data (US-9) is chosen from this maintained list.
- Each program has an associated list of required equipment items (e.g. ski, ski boots, poles, helmet).
- A teacher can add, edit, and remove the required equipment items for each program.

### US-8: Teacher maintains classes

As a teacher, I can maintain the list of classes so that students can select their current class.

**Acceptance criteria:**

- A view for maintaining the list of classes exists.
- A teacher can add, edit, and remove classes from the list.
- A student can only select a class from this maintained list; a student cannot create or edit a class.
- The class a student selects in their master data (US-9) is chosen from this maintained list.

### US-9: Teacher maintains skill levels

As a teacher, I can maintain the list of ski/snowboard skill levels so that students can select their current skill level.

**Acceptance criteria:**

- A view for maintaining the list of skill levels exists.
- A teacher can add, edit, and remove skill levels from the list.
- The list is pre-populated with the skill levels complete beginner, beginner, advanced, and expert.
- The skill level a student selects in their master data (US-10) is chosen from this maintained list.

### US-10: Teacher maintains bus pickup points

As a teacher, I can maintain the list of bus pickup points so that students can select their pickup point on arrival.

**Acceptance criteria:**

- A view for maintaining the list of bus pickup points exists.
- A teacher can add, edit, and remove bus pickup points from the list.
- The list is pre-populated with the pickup points HTL Dornbirn, Feldkirch station, Bregenz station, and directly at the Tschagguns accommodation.
- The bus pickup point a student selects in their master data (US-11) is chosen from this maintained list.

### US-11: Teacher maintains food/diet options

As a teacher, I can maintain the list of food/diet options so that students can select their dietary needs.

**Acceptance criteria:**

- A view for maintaining the list of food/diet options exists.
- A teacher can add, edit, and remove food/diet options from the list.
- The list is pre-populated with the options eats everything, vegetarian, vegan, and no pork.
- In addition to the teacher-maintained list, the option "other" is always available and cannot be removed or edited by the teacher.
- Selecting the "other" option always requires the student to enter free text explaining the intolerance.
- The food/diet option a student selects in their master data (US-13) is chosen from this maintained list.

### US-12: Teacher maintains season pass options

As a teacher, I can maintain the list of season pass options so that students can select their season pass status.

**Acceptance criteria:**

- A view for maintaining the list of season pass options exists.
- A teacher can add, edit, and remove season pass options from the list.
- The list is pre-populated with the options no, maybe, Golm-Bielerhöhe (Illwerke), and Silvretta-Montafon.
- The season pass option a student selects in their master data (US-13) is chosen from this maintained list.

### US-13: Student edits own master data

As a student, I can edit my master data so that I can provide the information needed for my sports week planning.

**Acceptance criteria:**

- A student can view and edit the master data for their own user record.
- Last name and first name are taken from the user record (see US-1) and are shown but not editable as part of this master data.
- The following master data fields are available:
  - Class: one of the classes maintained by a teacher (see US-8)
  - Date of birth
  - Gender: male / female
  - Which program are you registering for?: one of the programs maintained by a teacher (see US-7)
  - Skill level: one of the skill levels maintained by a teacher (see US-9)
  - Season pass: one of the season pass options maintained by a teacher (see US-12), for the Silvretta-Montafon ski areas
  - Bus pickup point on arrival: one of the pickup points maintained by a teacher (see US-10)
  - Food: one of the food/diet options maintained by a teacher (see US-11), with free text if "other" is selected
  - Health: free text about illnesses/allergies the teachers should know about (e.g. diabetes, epilepsy, asthma)
  - Do you carry medication for that?: yes / no
  - Emergency contact: first name, last name, relationship (mother, father, other with free text), phone number (must be in international format, e.g. +43...)
  - Equipment rental — do you need to borrow any of the equipment required for your selected program?: yes / no
    - If yes: shoe size, height [cm], weight [kg]
    - If yes, which equipment: one or more of the required equipment items for the selected program (see US-7)
- The required equipment items for the selected program are shown directly below the program field, in read-only form.
