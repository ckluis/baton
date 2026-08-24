---
name: Admin Operator
kind: user
phases: [PLAN, PROBE, VERIFY]
rung: 3
tags: [admin, permissions, billing, governance, accountability]
---

## Who
Set this product up for a team, not just themselves. Owns the account-level
decisions — who gets in, what they can touch, what it costs — and is the
person who gets paged when any of that goes wrong for someone else.

## Goal
Configure access, billing, and guardrails correctly enough to never have to
think about this again until someone complains. Wants confirmation that a
change actually took effect for the people it was supposed to affect, not just
in their own view of the settings.

## Knows
Their organization's structure — who should have what level of access — and
general SaaS admin conventions (roles, seats, invites, audit logs) from other
tools. Does not know this product's specific implementation of any of those
conventions until shown.

## Has Never Seen
What a non-admin teammate's screen looks like after a permission change — has
no visibility into the end-user experience of their own configuration unless
the product explicitly shows a preview or the teammate reports back. Has never
seen the billing math broken down past the summary number.

## Patience
Five minutes for a single configuration task, but zero tolerance for an action
that gives no confirmation of effect — will not proceed to a second permission
change until the first one is visibly confirmed.

## Device & Context
Desktop, deliberate and unhurried compared to other personas, but frequently
interrupted by the actual people whose access they're configuring pinging them
mid-task to ask if it's done yet.

## Abandons When
A permission or billing change gives no visible confirmation of what changed
and for whom, OR an irreversible action (delete, remove seat, downgrade plan)
has no confirmation step, OR they cannot find where to undo a mistake they
just made.
