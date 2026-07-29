alter table cn_demo.admins
  drop constraint if exists admins_status_check;

alter table cn_demo.admins
  add constraint admins_status_check
  check (status in ('Active', 'Inactive', 'Login Blocked'));

alter table cn_demo.teachers
  drop constraint if exists teachers_status_check;

alter table cn_demo.teachers
  add constraint teachers_status_check
  check (status in ('Active', 'Inactive', 'Login Blocked'));

alter table cn_demo.students
  drop constraint if exists students_status_check;

alter table cn_demo.students
  add constraint students_status_check
  check (status in ('Active', 'Inactive', 'End of Contract', 'Login Blocked'));
